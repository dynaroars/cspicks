/**
 * US Jobs page controller: search, filters, state map, position/school views.
 */
import { JOBS_KEYWORD_SPECS, JOB_SORTS, LEVEL_LABELS, TRACK_LABELS, filterJobs, groupBySchool, jobsSuggestions, loadJobsData, stateCounts } from './jobs-data.js';
import { renderJobCard, renderSchoolCard, renderStateMap } from './jobs-render.js';
import { STATE_TILE_ROWS, US_STATES } from './states.js';
import { createSuggestionBox, rankSuggestions } from '../suggestion-box.js';
import { initTooltipPositioning } from '../tooltip-position.js';
import { SITE_NAME, updatePageMeta } from '../seo.js';
import { trackView } from '../analytics.js';
import { areaLabels, escapeHtml } from '../shared.js';
import { createFavoritesStore, favoritesSelect, onFavoriteChange, onlyFavorites, prioritizeFavorites, wantsFavoritesOnly, wireFavoriteToggles } from '../favorites.js';
import { keywordHelpIcon } from '../search-keywords.js';
import { DEFAULT_END_YEAR, DEFAULT_START_YEAR, filterByYears, loadData } from '../data.js';
import type { JobFilters, StatusFilter } from './jobs-data.js';
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

let allJobs: Job[] = [];
let suggestions: ReturnType<typeof CreateSuggestionBox>;
let schoolRanks = new Map<string, SchoolRank>();
const ranks: RankLookup = school => schoolRanks.get(school);

const EXAMPLES = ['Assistant professor', 'Teaching track', 'Postdoc', 'area: security', 'area: machine learning', 'loc: california', 'loc: texas', 'status: closed'];

function state() {
  return {
    query: input.value.trim(),
    track: select('track-select').value,
    level: select('level-select').value,
    area: select('area-select').value,
    state: select('state-select').value,
    status: select('status-select').value as StatusFilter,
    sortBy: select('sort-select').value as JobFilters['sortBy'],
    view: select('view-select').value,
    favorites: select('favorites-select').value
  };
}

function updateUrl(current: ReturnType<typeof state>) {
  const next = new URLSearchParams();
  const defaults: Record<string, string> = { track: 'all', level: 'all', area: 'all', state: 'all', status: 'active', sortBy: 'deadline', view: 'position', favorites: 'all' };
  const names: Record<string, string> = { sortBy: 'sort' };
  if (current.query) next.set('q', current.query);
  (Object.keys(defaults) as Array<keyof typeof current>).forEach(key => {
    if (current[key] !== defaults[key]) next.set(names[key] || key, current[key]!);
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
  const filters: JobFilters = { ...current, now: Date.now() };
  const favoritesOnly = wantsFavoritesOnly(current.query, current.favorites);
  // Starred postings lead the list; "favorites only" hides the rest.
  const byFavorites = (list: Job[]) => favoritesOnly ? onlyFavorites(list, job => job.id, favorites) : prioritizeFavorites(list, job => job.id, favorites);
  const shown = byFavorites(filterJobs(allJobs, filters));
  // The map ignores its own state filter so every state keeps a count.
  const counts = stateCounts(byFavorites(filterJobs(allJobs, filters, true)));
  mapElement.innerHTML = renderStateMap(STATE_TILE_ROWS, counts, current.state);

  const now = Date.now();
  if (!shown.length) {
    results.innerHTML = `<div class="jobs-empty">
      <h3>${favoritesOnly ? 'No starred positions match' : allJobs.length ? 'No matching positions' : 'No postings yet'}</h3>
      <p>${favoritesOnly ? 'Star a posting with the ☆ button to keep it here, or switch back to “All items”.' : allJobs.length
        ? 'Try broadening your search, choosing “All postings”, or clearing some filters.'
        : 'Postings are added as department hiring pages are crawled and as people submit them.'}
        You can also <a href="jobs-submit.html">submit a posting</a>.</p>
      ${allJobs.length ? '<button type="button" class="btn-secondary" id="reset-jobs-filters">Reset all filters</button>' : ''}
    </div>`;
  } else if (current.view === 'school') {
    results.innerHTML = groupBySchool(shown).map(group => renderSchoolCard(group, ranks, favorites.isFavorite, now)).join('');
  } else {
    results.innerHTML = shown.map(job => renderJobCard(job, ranks, favorites.isFavorite, now)).join('');
  }

  const label = current.status === 'active' ? 'active ' : current.status === 'closed' ? 'closed ' : '';
  const schools = new Set(shown.map(job => job.school)).size;
  statusText.textContent = `Showing ${shown.length} ${label}position${shown.length === 1 ? '' : 's'}${shown.length ? ` at ${schools} school${schools === 1 ? '' : 's'}` : ''} of ${allJobs.length} listed`;
  countElement.textContent = `${shown.length} position${shown.length === 1 ? '' : 's'}`;
  updateUrl(current);
  trackView(current.query ? 'search-results' : 'default', 'jobs');
}

function setFilter(id: string, value: string) {
  select(id).value = value;
  render();
}

function populateOptions() {
  const add = (id: string, entries: Array<[string, string]>) => {
    const el = select(id);
    entries.forEach(([value, label]) => el.add(new Option(label, value)));
  };
  add('track-select', Object.entries(TRACK_LABELS));
  add('level-select', Object.entries(LEVEL_LABELS));
  add('area-select', Object.entries(areaLabels).sort((a, b) => a[1].localeCompare(b[1])));
  add('state-select', Object.entries(US_STATES));

  select('favorites-select').value = params.get('favorites') === 'only' ? 'only' : 'all';
  const restore: Array<[string, string]> = [['track', 'track-select'], ['level', 'level-select'], ['area', 'area-select'], ['state', 'state-select'], ['status', 'status-select'], ['view', 'view-select']];
  restore.forEach(([param, id]) => {
    const value = params.get(param);
    if (value && [...select(id).options].some(option => option.value === value)) select(id).value = value;
  });
  const sort = params.get('sort');
  if (sort && (JOB_SORTS as string[]).includes(sort)) select('sort-select').value = sort;
  input.value = params.get('q') || '';
}

function buildSuggestions() {
  return createSuggestionBox({
    input,
    listbox: document.getElementById('universal-suggestions')!,
    emptyText: 'No matching school, area, or state',
    getGroups: query => {
      const items = jobsSuggestions(allJobs);
      return [
        ['Schools', rankSuggestions(items.schools, query, 8)],
        ['Research areas', rankSuggestions(items.areas, query, 5)],
        ['States', rankSuggestions(items.states, query, 5)],
        ['Position types', rankSuggestions(items.tracks, query, 4)]
      ];
    },
    onSelect: item => {
      input.value = item.label;
      render();
    }
  });
}

function setupEvents() {
  const resetFilters = () => {
    input.value = '';
    ['track', 'level', 'area', 'state'].forEach(name => { select(`${name}-select`).value = 'all'; });
    select('status-select').value = 'active';
    select('sort-select').value = 'deadline';
    select('view-select').value = 'position';
    select('favorites-select').value = 'all';
    render();
    input.focus();
  };
  ['track-select', 'level-select', 'area-select', 'state-select', 'status-select', 'sort-select', 'view-select', 'favorites-select']
    .forEach(id => select(id).addEventListener('change', render));

  mapElement.addEventListener('click', event => {
    const tile = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-state]') : null;
    if (!tile) return;
    setFilter('state-select', select('state-select').value === tile.dataset.state ? 'all' : tile.dataset.state!);
  });

  results.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#reset-jobs-filters')) return resetFilters();
    const school = target.closest<HTMLElement>('[data-search-school]');
    if (school) {
      input.value = `school: "${school.dataset.searchSchool}"`;
      render();
      return window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const area = target.closest<HTMLElement>('[data-search-area]');
    if (area) return setFilter('area-select', area.dataset.searchArea!);
    const stateButton = target.closest<HTMLElement>('[data-state]');
    if (stateButton) setFilter('state-select', stateButton.dataset.state!);
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
    input.placeholder = 'Search schools, areas, states, or position types (e.g. Georgia Tech, security, teaching track)';
    const searchBox = input.closest<HTMLElement>('.universal-search')!;
    searchBox.classList.add('has-search-help');
    searchBox.insertAdjacentHTML('afterbegin', keywordHelpIcon(JOBS_KEYWORD_SPECS, 'jobs-search-help'));
    wireFavoriteToggles(results, favorites);
    onFavoriteChange(results, favorites, render);
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
