import { createFilterBar } from '../src/filters.js';
import { createSuggestionBox, rankSuggestions } from '../src/suggestion-box.js';
import { initTooltipPositioning } from '../src/tooltip-position.js';
import { SITE_NAME, updatePageMeta } from '../src/seo.js';
import { trackView } from '../src/analytics.js';
import { escapeHtml } from '../src/shared.js';
import { createFavoritesStore, favoritesSelect, onFavoriteChange, onlyFavorites, prioritizeFavorites, wantsFavoritesOnly, wireFavoriteToggles } from '../src/favorites.js';
import { mountKeywordHelp } from '../src/search-keywords.js';
import { CSCONFS_KEYWORD_SPECS, DEADLINE_MODES, filterSchedule, scheduleSuggestions } from './schedule-data.js';
import { LOCATION_REGIONS } from './place.js';
import { renderScheduleCard } from './schedule-render.js';
import type { DeadlineMode } from './schedule-data.js';
import type { FilterController } from '../src/filters.js';
import type { createSuggestionBox as CreateSuggestionBox } from '../src/suggestion-box.js';
import type { ConferenceRecord } from './types.js';

const params = new URLSearchParams(location.search);
const currentYear = new Date().getFullYear();
const input = document.querySelector<HTMLInputElement>('#csconfs-search')!;
const results = document.getElementById('csconfs-results')!;
const status = document.getElementById('csconfs-status')!;
const favorites = createFavoritesStore('cspicks:csconfs-favorites');
let conferences: ConferenceRecord[] = [];
let filters: FilterController;
let suggestions: ReturnType<typeof CreateSuggestionBox>;

const deadlineMode = () => (document.querySelector<HTMLSelectElement>('#deadline-mode')!.value || 'upcoming') as DeadlineMode;
const locationValue = () => document.querySelector<HTMLSelectElement>('#location-select')!.value;
const favoritesValue = () => document.querySelector<HTMLSelectElement>('#favorites-select')?.value || 'all';

function updateUrl() {
  const next = filters.toParams();
  const query = input.value.trim();
  if (query) next.set('q', query);
  if (deadlineMode() !== 'upcoming') next.set('deadline', deadlineMode());
  if (locationValue()) next.set('loc', locationValue());
  if (favoritesValue() === 'only') next.set('favorites', 'only');
  history.replaceState({}, '', `${location.pathname}?${next}`);
  updatePageMeta({
    title: query ? `${query} - CS Conference Schedule - ${SITE_NAME}` : `${SITE_NAME} - CS Conference Schedule`,
    description: query
      ? `Conference dates and submission deadlines matching “${query}” for ${filters.startYear}–${filters.endYear}.`
      : `Search computer science conference dates and submission deadlines for ${filters.startYear}–${filters.endYear}.`
  });
}

function render() {
  if (!conferences.length) return;
  const mode = deadlineMode();
  const favoritesOnly = wantsFavoritesOnly(input.value, favoritesValue());
  const matched = filterSchedule(conferences, {
    startYear: filters.startYear,
    endYear: filters.endYear,
    confSet: filters.confSet,
    query: input.value,
    deadline: mode,
    location: locationValue()
  });
  const favoriteIdOf = (group: typeof matched[number]) => `${group[0].name} ${group[0].year}`;
  const groups = favoritesOnly ? onlyFavorites(matched, favoriteIdOf, favorites) : prioritizeFavorites(matched, favoriteIdOf, favorites);
  results.innerHTML = groups.map(group => renderScheduleCard(group, Date.now(), favorites.isFavorite)).join('');
  const suffix = mode === 'upcoming' ? ' upcoming' : mode === 'open' ? ' open-deadline' : mode === 'passed' ? ' past-deadline, still ahead' : '';
  status.textContent = groups.length
    ? `${groups.length} matching${suffix} conference${groups.length === 1 ? '' : 's'}`
    : favoritesOnly ? 'No starred conferences match. Star a conference with the ☆ button, or switch back to “All items”.' : `No conferences match these years, venue set, and search terms.`;
  document.getElementById('csconfs-count')!.textContent = `${groups.length} conferences during`;
  updateUrl();
  trackView(input.value.trim() ? 'search-results' : 'default', 'csconfs');
}

function buildSuggestions() {
  return createSuggestionBox({
    input,
    listbox: document.getElementById('universal-suggestions')!,
    emptyText: 'No matching conference or research area',
    getGroups: query => {
      const items = scheduleSuggestions(conferences, filters.startYear, filters.endYear, filters.confSet);
      return [
        ['Conferences', rankSuggestions(items.conferences, query, 10)],
        ['Research areas', rankSuggestions(items.areas, query, 8)]
      ];
    },
    onSelect: item => {
      input.value = item.label;
      render();
    }
  });
}

function sample<T>(items: T[], count: number) {
  const available = [...items];
  for (let index = available.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [available[index], available[swapIndex]] = [available[swapIndex]!, available[index]!];
  }
  return available.slice(0, count);
}

function renderExamples() {
  if (!conferences.length || !filters) return;
  const eligibleGroups = filterSchedule(conferences, {
    startYear: filters.startYear,
    endYear: filters.endYear,
    confSet: filters.confSet,
    query: '',
    deadline: deadlineMode(),
    location: locationValue()
  });
  const items = scheduleSuggestions(eligibleGroups.flat(), filters.startYear, filters.endYear, filters.confSet);
  // Show both query types, shuffled together just like Search's fresh sample.
  const examples = sample([
    ...sample(items.conferences, 2),
    ...sample(items.areas, 2)
  ], 4);
  document.getElementById('csconfs-examples')!.innerHTML = examples
    .map(item => `<button type="button" data-search-example="${escapeHtml(item.label)}">${escapeHtml(item.label)}</button>`).join('');
}

function setupExamples() {
  document.getElementById('csconfs-examples')!.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-search-example]') : null;
    if (!button) return;
    input.value = button.dataset.searchExample || '';
    render();
    input.focus();
    suggestions.close();
  });
  renderExamples();
}

async function init() {
  try {
    const response = await fetch(new URL('./data/conferences.json', import.meta.url));
    if (!response.ok) throw new Error(`Conference data request failed (${response.status})`);
    conferences = await response.json();

    const earliestYear = conferences.reduce((min, conf) => Math.min(min, conf.year), currentYear);
    filters = createFilterBar('#filter-bar', {
      label: 'Conference schedule filters',
      fields: ['years', 'confSet'],
      years: { min: earliestYear, max: currentYear + 1 },
      defaults: { startYear: currentYear, endYear: currentYear + 1 },
      persist: { years: false },
      prefix: 'Conference years',
      prefixId: 'csconfs-count',
      className: 'csconfs-filters',
      params,
      onChange: () => {
        render();
        renderExamples();
      }
    });
    const wantedLocation = (params.get('loc') || '').toLowerCase();
    const wantedDeadline = params.get('deadline') || (params.get('upcoming') === 'false' ? 'all' : 'upcoming');
    const option = (value: string, label: string, selected: boolean) => `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    const deadlineLabels: Record<DeadlineMode, string> = {
      upcoming: 'Upcoming (open deadline or event ahead)',
      open: 'Deadline still open',
      passed: 'Deadline passed, event still ahead',
      all: 'All, including past conferences'
    };
    filters.element.insertAdjacentHTML('beforeend', `
      <div class="filter-group">
        <select id="location-select" aria-label="Conference location">
          ${option('', 'Anywhere', !wantedLocation)}
          ${option('united states', 'United States', wantedLocation === 'united states')}
          ${LOCATION_REGIONS.map(region => option(region, region.replace(/\b\w/g, c => c.toUpperCase()), region === wantedLocation)).join('')}
        </select>
      </div>
      <div class="filter-group">
        <select id="deadline-mode" aria-label="Deadline status">${DEADLINE_MODES.map(mode => option(mode, deadlineLabels[mode], mode === wantedDeadline)).join('')}</select>
      </div>
      <div class="filter-group">${favoritesSelect(params.get('favorites') === 'only' ? 'only' : 'all', favorites.all().length)}</div>`);
    ['location-select', 'deadline-mode', 'favorites-select'].forEach(id => document.getElementById(id)!.addEventListener('change', () => {
      render();
      renderExamples();
    }));
    mountKeywordHelp(input, CSCONFS_KEYWORD_SPECS, 'csconfs-search-help', 'area: security loc: europe', 'Combine keywords to narrow your search. Quote values with spaces.');
    wireFavoriteToggles(results, favorites);
    onFavoriteChange(results, favorites, render);
    initTooltipPositioning();

    suggestions = buildSuggestions();
    input.disabled = false;
    input.placeholder = 'Search conferences or research areas (e.g., PLDI or Security)';
    input.value = params.get('q') || '';
    input.addEventListener('input', () => {
      suggestions.render(input.value);
      render();
    });
    setupExamples();
    render();
    input.focus();

    document.addEventListener('keydown', event => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    });
  } catch (error) {
    console.error('Failed to load conference schedules:', error);
    status.textContent = 'Conference schedule data could not be loaded. Please try again.';
    status.classList.add('load-error');
  }
}

init();
