/**
 * US Jobs page controller: search, filters, state map, position/school views.
 */
import { DEPARTMENT_LABELS, JOBS_KEYWORD_SPECS, JOB_SORTS, LEVEL_LABELS, TRACK_LABELS, VISA_FILTER_LABELS, filterJobs, groupBySchool, jobsSuggestions, loadJobsData, stateCounts } from './jobs-data.js';
import { renderJobCard, renderSchoolCard, renderStateMap } from './jobs-render.js';
import { exportFileName, jobsToMarkdown, restoreStarredIds } from './jobs-export.js';
import { STATE_TILE_ROWS, US_STATES, resolveState } from './states.js';
import { createSuggestionBox, rankSuggestions } from '../suggestion-box.js';
import { initTooltipPositioning } from '../tooltip-position.js';
import { SITE_NAME, updatePageMeta } from '../seo.js';
import { trackView } from '../analytics.js';
import { areaLabels, escapeHtml } from '../shared.js';
import { createFavoritesStore, favoritesSelect, onFavoriteChange, onlyFavorites, prioritizeFavorites, updateFavoritesCount, wantsFavoritesOnly, wireFavoriteToggles } from '../favorites.js';
import { keywordSuggestions, mountKeywordHelp, parseKeywordQuery, restoreKeywordQuery, setQueryKeyword } from '../search-keywords.js';
import { DEFAULT_END_YEAR, DEFAULT_START_YEAR, filterByYears, loadData } from '../data.js';
import type { JobFilters, JobSort } from './jobs-data.js';
import type { RankLookup, SchoolRank } from './jobs-render.js';
import type { Job } from '../types.js';
import type { createSuggestionBox as CreateSuggestionBox } from '../suggestion-box.js';

const params = new URLSearchParams(window.location.search);
const input = document.querySelector<HTMLInputElement>('#jobs-search')!;
const results = document.getElementById('jobs-results')!;
const statusText = document.getElementById('jobs-status')!;
const countElement = document.getElementById('jobs-count')!;
const mapElement = document.getElementById('jobs-map')!;
const favorites = createFavoritesStore('cspicks:jobs-favorites');
const select = (id: string) => document.getElementById(id) as HTMLSelectElement;
const exportButton = document.querySelector<HTMLButtonElement>('#export-favorites')!;
const restoreInput = document.querySelector<HTMLInputElement>('#restore-favorites-file')!;
const restoreNote = document.getElementById('jobs-restore-note')!;
const mapClear = document.querySelector<HTMLButtonElement>('#clear-map-states')!;

let allJobs: Job[] = [];
let suggestions: ReturnType<typeof CreateSuggestionBox>;
let schoolRanks = new Map<string, SchoolRank>();
const ranks: RankLookup = school => schoolRanks.get(school);
const rankOf = (school: string) => schoolRanks.get(school)?.rank;

const EXAMPLES = ['Assistant professor', 'Teaching track', 'Postdoc', 'dept: information', 'dept: ece', 'area: security', 'area: "machine learning"', 'loc: california', 'loc: texas', 'visa: possible', 'status: closed'];

function state() {
  return {
    query: input.value.trim(),
    sortBy: select('sort-select').value as JobSort,
    view: select('view-select').value,
    favorites: select('favorites-select').value
  };
}

function updateUrl(current: ReturnType<typeof state>) {
  const next = new URLSearchParams();
  const defaults = { sortBy: 'deadline', view: 'position', favorites: 'all' };
  const names: Record<string, string> = { sortBy: 'sort' };
  if (current.query) next.set('q', current.query);
  (Object.keys(defaults) as Array<keyof typeof defaults>).forEach(key => {
    if (current[key] !== defaults[key]) next.set(names[key] || key, current[key]);
  });
  window.history.replaceState({}, '', next.toString() ? `${window.location.pathname}?${next}` : window.location.pathname);
  updatePageMeta({
    title: current.query ? `${current.query} - US Academic CS Jobs - ${SITE_NAME}` : `${SITE_NAME} - US Academic CS Jobs`,
    description: current.query
      ? `US academic computer science positions matching “${current.query}”.`
      : 'Open US computer science faculty, teaching, research, and postdoc positions by school, area, and state.'
  });
}

function render() {
  if (!allJobs.length && !statusText.dataset.loaded) return;
  const current = state();
  const filters: JobFilters = { ...current, rankOf, now: Date.now() };
  const favoritesOnly = wantsFavoritesOnly(current.query, current.favorites);
  // Starred postings lead the list; "favorites only" hides the rest.
  const byFavorites = (list: Job[]) => favoritesOnly ? onlyFavorites(list, job => job.id, favorites) : prioritizeFavorites(list, job => job.id, favorites);
  const shown = byFavorites(filterJobs(allJobs, filters));
  // The map ignores its own state filter so every state keeps a count.
  const counts = stateCounts(byFavorites(filterJobs(allJobs, filters, true)));
  const locations = parseKeywordQuery(current.query, JOBS_KEYWORD_SPECS).filters.loc || [];
  const selectedStates = locations.flatMap(value => value.split(',')).map(value => resolveState(value.trim())).filter((value): value is string => Boolean(value));
  mapElement.innerHTML = renderStateMap(STATE_TILE_ROWS, counts, selectedStates);
  mapClear.hidden = !selectedStates.length;
  mapClear.textContent = `Clear ${selectedStates.length === 1 ? US_STATES[selectedStates[0]!] : `${selectedStates.length} states`}`;

  const now = Date.now();
  if (!shown.length) {
    results.innerHTML = `<div class="jobs-empty">
      <h3>${favoritesOnly ? 'No starred positions match' : allJobs.length ? 'No matching positions' : 'No postings yet'}</h3>
      <p>${favoritesOnly ? 'Star a posting with the ☆ button to keep it here, or switch back to “All items”.' : allJobs.length
        ? 'Try broadening your search, searching “status: all”, or clearing some filters.'
        : 'Postings are added as department hiring pages are crawled and as people submit them.'}
        You can also <a href="jobs-submit.html">submit a posting</a>.</p>
      ${allJobs.length ? '<button type="button" class="btn-secondary" id="reset-jobs-filters">Reset all filters</button>' : ''}
    </div>`;
  } else if (current.view === 'school') {
    results.innerHTML = groupBySchool(shown).map(group => renderSchoolCard(group, ranks, favorites.isFavorite, now)).join('');
  } else {
    results.innerHTML = shown.map(job => renderJobCard(job, ranks, favorites.isFavorite, now)).join('');
  }

  const status = parseKeywordQuery(current.query, JOBS_KEYWORD_SPECS).filters.status?.[0] || 'active';
  const label = status === 'active' ? 'active ' : status === 'closed' ? 'closed ' : '';
  const schools = new Set(shown.map(job => job.school)).size;
  statusText.textContent = `Showing ${shown.length} ${label}position${shown.length === 1 ? '' : 's'}${shown.length ? ` at ${schools} school${schools === 1 ? '' : 's'}` : ''} of ${allJobs.length} listed`;
  countElement.textContent = `${shown.length} position${shown.length === 1 ? '' : 's'}`;
  updateUrl(current);
  trackView(current.query ? 'search-results' : 'default', 'jobs');
}

function setFilter(key: string, values: string[]) {
  input.value = setQueryKeyword(input.value, key, values, JOBS_KEYWORD_SPECS);
  render();
  suggestions.close();
}

function populateOptions() {
  select('favorites-select').value = params.get('favorites') === 'only' ? 'only' : 'all';
  const view = params.get('view');
  if (view === 'school') select('view-select').value = view;
  const sort = params.get('sort');
  if (sort && (JOB_SORTS as string[]).includes(sort)) select('sort-select').value = sort;
  input.value = restoreKeywordQuery(params, { track: 'track', dept: 'dept', level: 'level', area: 'area', state: 'loc', visa: 'visa', status: 'status' });
}

function buildSuggestions() {
  return createSuggestionBox({
    input,
    listbox: document.getElementById('universal-suggestions')!,
    emptyText: 'No matching school, area, or state',
    getGroups: query => {
      const items = jobsSuggestions(allJobs);
      const choices = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label, detail: 'Search filter' }));
      const scoped = keywordSuggestions(input.value, JOBS_KEYWORD_SPECS, {
        school: items.schools, area: Object.entries(areaLabels).map(([value, label]) => ({ value, label, detail: 'Research area' })),
        loc: items.states, track: choices(TRACK_LABELS), level: choices(LEVEL_LABELS), dept: choices(DEPARTMENT_LABELS), visa: choices({ ...VISA_FILTER_LABELS, possible: 'Anything but no sponsorship' }),
        status: choices({ active: 'Active postings', closed: 'Closed postings', all: 'All postings' }),
        favorites: choices({ only: 'Starred postings only' })
      });
      if (scoped) return scoped;
      return [
        ['Schools', rankSuggestions(items.schools, query, 8)],
        ['Research areas', rankSuggestions(items.areas, query, 5)],
        ['States', rankSuggestions(items.states, query, 5)],
        ['Position types', rankSuggestions(items.tracks, query, 4)]
      ];
    },
    onSelect: item => {
      input.value = item.value || item.label;
      render();
    }
  });
}

function setupEvents() {
  const resetFilters = () => {
    input.value = '';
    select('sort-select').value = 'deadline';
    select('view-select').value = 'position';
    select('favorites-select').value = 'all';
    render();
    input.focus();
  };
  ['sort-select', 'view-select', 'favorites-select']
    .forEach(id => select(id).addEventListener('change', render));

  // Map tiles add or remove a state, so several can be picked; chips on a card narrow to just that value.
  mapElement.addEventListener('click', event => {
    const tile = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-state]') : null;
    if (!tile) return;
    const locations = parseKeywordQuery(input.value, JOBS_KEYWORD_SPECS).filters.loc || [];
    const values = locations.flatMap(value => value.split(',')).map(value => resolveState(value.trim()) || value.trim());
    const code = tile.dataset.state!;
    setFilter('loc', values.includes(code) ? values.filter(value => value !== code) : [...values, code]);
  });

  mapClear.addEventListener('click', () => setFilter('loc', []));
  exportButton.addEventListener('click', exportFavorites);
  document.getElementById('restore-favorites')!.addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', () => {
    const file = restoreInput.files?.[0];
    restoreInput.value = '';
    if (file) void restoreFavorites(file);
  });

  results.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#reset-jobs-filters')) return resetFilters();
    const school = target.closest<HTMLElement>('[data-search-school]');
    if (school) {
      setFilter('school', [school.dataset.searchSchool!]);
      return window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const area = target.closest<HTMLElement>('[data-search-area]');
    if (area) return setFilter('area', [area.dataset.searchArea!]);
    const stateButton = target.closest<HTMLElement>('[data-state]');
    if (stateButton) setFilter('loc', [stateButton.dataset.state!]);
  });

  document.getElementById('jobs-examples')!.innerHTML = EXAMPLES.map(example =>
    `<button type="button" data-search-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join('');
  document.getElementById('jobs-examples')!.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-search-example]') : null;
    if (!button) return;
    input.value = button.dataset.searchExample || '';
    render();
    input.focus();
    suggestions.close();
  });

  input.addEventListener('input', () => {
    suggestions.render(input.value);
    render();
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
}

function updateExportButton() {
  const count = favorites.all().length;
  exportButton.disabled = count === 0;
  exportButton.title = count ? `Download your ${count} starred position${count === 1 ? '' : 's'} as a Markdown file` : 'Star postings with ☆ to export them';
}

/** Every starred posting (closed ones too, whatever the filters), in the current sort order. */
function exportFavorites() {
  const now = Date.now();
  const starred = onlyFavorites(allJobs, job => job.id, favorites);
  if (!starred.length) return;
  const ordered = filterJobs(starred, { status: 'all', sortBy: state().sortBy, rankOf, now });
  const url = URL.createObjectURL(new Blob([jobsToMarkdown(ordered, { ranks, now })], { type: 'text/markdown;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: exportFileName(now) });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Makes the stars exactly the postings listed in an exported file: stars it lists are added, every
 * other star is removed. A file with no posting sections at all leaves the stars untouched.
 */
async function restoreFavorites(file: File) {
  const { ids, unmatched } = restoreStarredIds(await file.text(), allJobs);
  const plural = (count: number) => `${count} posting${count === 1 ? '' : 's'}`;
  if (!ids.length && !unmatched) {
    restoreNote.textContent = `No CS Picks postings found in “${file.name}”, so your stars were not changed. Choose a file made with “Export ★ (.md)”.`;
  } else {
    const wanted = new Set(ids);
    const removed = favorites.all().filter(id => !wanted.has(id));
    removed.forEach(id => favorites.toggle(id));
    ids.filter(id => !favorites.isFavorite(id)).forEach(id => favorites.toggle(id));
    restoreNote.textContent = [
      `Restored ${plural(ids.length)} from “${file.name}”${removed.length ? `; removed ${removed.length} other star${removed.length === 1 ? '' : 's'}` : ''}.`,
      unmatched ? `${plural(unmatched)} could not be matched; they may have been removed from the listings.` : ''
    ].filter(Boolean).join(' ');
  }
  restoreNote.hidden = false;
  updateFavoritesCount(favorites);
  updateExportButton();
  render();
}

/** Progressive enhancement: add CSRankings rank chips once the (large) roster has loaded. */
async function loadSchoolRanks() {
  try {
    const data = filterByYears(await loadData(), DEFAULT_START_YEAR, DEFAULT_END_YEAR, 'us');
    schoolRanks = new Map(Object.values(data.schools).map(school => [school.name, { rank: school.rank ?? null, areaRanks: school.areaRanks || {} }]));
    render();
  } catch (error) {
    console.warn('School rankings unavailable; showing postings without rank chips.', error);
  }
}

async function init() {
  try {
    allJobs = await loadJobsData();
    statusText.dataset.loaded = 'true';
    document.getElementById('favorites-filter')!.innerHTML = favoritesSelect(params.get('favorites') === 'only' ? 'only' : 'all', favorites.all().length);
    populateOptions();
    suggestions = buildSuggestions();
    input.disabled = false;
    input.placeholder = 'Search jobs or use keywords: track: teaching loc: texas';
    mountKeywordHelp(input, JOBS_KEYWORD_SPECS, 'jobs-search-help', 'track: teaching loc: TX,VA level: assistant');
    wireFavoriteToggles(results, favorites);
    onFavoriteChange(results, favorites, render);
    results.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('[data-favorite-id]')) updateExportButton();
    });
    updateExportButton();
    initTooltipPositioning();
    setupEvents();
    render();
    void loadSchoolRanks();
  } catch (error) {
    console.error('Failed to load jobs data:', error);
    statusText.textContent = 'Jobs data could not be loaded. Please try again.';
    statusText.classList.add('load-error');
  }
}

init();
