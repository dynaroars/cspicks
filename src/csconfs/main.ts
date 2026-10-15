import { createFilterBar } from '../filters.js';
import { rankSuggestions } from '../suggestion-box.js';
import { initTooltipPositioning } from '../tooltip-position.js';
import { SITE_NAME, updatePageMeta } from '../seo.js';
import { trackView } from '../analytics.js';
import { createFavoritesStore, onFavoriteChange, onlyFavorites, prioritizeFavorites, wantsFavoritesOnly, wireFavoriteToggles } from '../favorites.js';
import { keywordValue, parseKeywordQuery, restoreKeywordQuery } from '../search-keywords.js';
import { createSearchControls, focusSearchOnLoad, renderSearchExamples as renderExampleChips, sample, searchChoices, updateSearchUrl } from '../search-controls.js';
import { areaLabels } from '../shared.js';
import { parsePlace } from './place.js';
import { CSCONFS_KEYWORD_SPECS, DEADLINE_MODES, filterSchedule, scheduleSuggestions } from './schedule-data.js';
import { LOCATION_REGIONS } from './place.js';
import { renderScheduleCard } from './schedule-render.js';
import type { DeadlineMode } from './schedule-data.js';
import type { FilterController } from '../filters.js';

import type { ConferenceRecord } from '../types.js';

const params = new URLSearchParams(location.search);
const currentYear = new Date().getFullYear();
const input = document.querySelector<HTMLInputElement>('#csconfs-search')!;
const results = document.getElementById('csconfs-results')!;
const status = document.getElementById('csconfs-status')!;
const favorites = createFavoritesStore('cspicks:csconfs-favorites');
let conferences: ConferenceRecord[] = [];
let filters: FilterController;

const deadlineMode = () => (parseKeywordQuery(input.value, CSCONFS_KEYWORD_SPECS).filters.deadline?.[0] || 'upcoming') as DeadlineMode;

function updateUrl() {
  const next = filters.toParams();
  const query = input.value.trim();
  if (query) next.set('q', query);
  updateSearchUrl(next, query);
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
  const favoritesOnly = wantsFavoritesOnly(input.value);
  const matched = filterSchedule(conferences, {
    startYear: filters.startYear,
    endYear: filters.endYear,
    confSet: filters.confSet,
    query: input.value,
    deadline: mode,
  });
  const favoriteIdOf = (group: typeof matched[number]) => `${group[0].name} ${group[0].year}`;
  const groups = favoritesOnly ? onlyFavorites(matched, favoriteIdOf, favorites) : prioritizeFavorites(matched, favoriteIdOf, favorites);
  results.innerHTML = groups.map(group => renderScheduleCard(group, Date.now(), favorites.isFavorite)).join('');
  const suffix = mode === 'upcoming' ? ' upcoming' : mode === 'open' ? ' open-deadline' : mode === 'passed' ? ' past-deadline, still ahead' : '';
  status.textContent = groups.length
    ? `${groups.length} matching${suffix} conference${groups.length === 1 ? '' : 's'}`
    : favoritesOnly ? 'No starred conferences match. Star a conference with the ☆ button, or clear “favorites: only” from search.' : `No conferences match these years, venue set, and search terms.`;
  document.getElementById('csconfs-count')!.textContent = `${groups.length} conferences during`;
  updateUrl();
  trackView(input.value.trim() ? 'search-results' : 'default', 'csconfs');
}

function buildSuggestions() {
  return createSearchControls({
    input,
    listbox: document.getElementById('universal-suggestions')!,
    specs: CSCONFS_KEYWORD_SPECS, example: 'area: security loc: europe',
    examples: document.getElementById('csconfs-examples'), onQuery: () => render(),
    getKeywordSources: () => {
      const places = conferences.map(conf => parsePlace(conf.place)).filter(place => place != null);
      return {
        area: searchChoices(areaLabels),
        loc: searchChoices([...new Set([...LOCATION_REGIONS, 'united states', ...places.flatMap(place => place.display.split(/,\s*/))])]),
        deadline: searchChoices(DEADLINE_MODES), verified: searchChoices(['yes', 'no']), favorites: searchChoices(['only'])
      };
    },
    emptyText: 'No matching conference or research area',
    getGroups: query => {
      const items = scheduleSuggestions(conferences, filters.startYear, filters.endYear, filters.confSet);
      return [
        ['Conferences', rankSuggestions(items.conferences, query, 10)],
        ['Research areas', rankSuggestions(items.areas, query, 8)]
      ];
    },
    onSelect: item => {
      input.value = item.value || item.label;
      render();
    }
  });
}

function renderExamples() {
  if (!conferences.length || !filters) return;
  const eligibleGroups = filterSchedule(conferences, {
    startYear: filters.startYear,
    endYear: filters.endYear,
    confSet: filters.confSet,
    query: '',
    deadline: deadlineMode(),
  });
  const items = scheduleSuggestions(eligibleGroups.flat(), filters.startYear, filters.endYear, filters.confSet);
  // Show both query types, shuffled together just like Search's fresh sample.
  const examples = sample([
    ...sample(items.conferences, 2),
    ...sample(items.areas, 2)
  ], 4);
  renderExampleChips(document.getElementById('csconfs-examples')!, examples.map(item => item.detail.startsWith('Research area') ? `area: ${keywordValue(item.label)}` : item.label));
}

async function init() {
  try {
    const response = await fetch(new URL('../../csconfs/data/conferences.json', import.meta.url));
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
    input.value = restoreKeywordQuery(params, { loc: 'loc', deadline: 'deadline', favorites: 'favorites' });
    if (params.get('upcoming') === 'false' && !params.has('deadline')) input.value += ' deadline: all';
    wireFavoriteToggles(results, favorites);
    onFavoriteChange(results, render);
    initTooltipPositioning();

    buildSuggestions();
    input.disabled = false;
    input.placeholder = 'Search conferences or research areas (e.g., PLDI or Security)';
    renderExamples();
    render();
    focusSearchOnLoad(input);


  } catch (error) {
    console.error('Failed to load conference schedules:', error);
    status.textContent = 'Conference schedule data could not be loaded. Please try again.';
    status.classList.add('load-error');
  }
}

init();
