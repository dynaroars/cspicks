import { createFilterBar } from '../src/filters.js';
import { createSuggestionBox, rankSuggestions } from '../src/suggestion-box.js';
import { initTooltipPositioning } from '../src/tooltip-position.js';
import { SITE_NAME, updatePageMeta } from '../src/seo.js';
import { trackView } from '../src/analytics.js';
import { escapeHtml } from '../src/shared.js';
import { filterSchedule, scheduleSuggestions } from './schedule-data.js';
import { renderScheduleCard } from './schedule-render.js';
import type { FilterController } from '../src/filters.js';
import type { createSuggestionBox as CreateSuggestionBox } from '../src/suggestion-box.js';
import type { ConferenceRecord } from './types.js';

const params = new URLSearchParams(location.search);
const currentYear = new Date().getFullYear();
const input = document.querySelector<HTMLInputElement>('#csconfs-search')!;
const results = document.getElementById('csconfs-results')!;
const status = document.getElementById('csconfs-status')!;
let conferences: ConferenceRecord[] = [];
let filters: FilterController;
let suggestions: ReturnType<typeof CreateSuggestionBox>;

function updateUrl() {
  const next = filters.toParams();
  const query = input.value.trim();
  if (query) next.set('q', query);
  if (!document.querySelector<HTMLInputElement>('#upcoming-only')!.checked) next.set('upcoming', 'false');
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
  const upcomingOnly = document.querySelector<HTMLInputElement>('#upcoming-only')!.checked;
  const groups = filterSchedule(conferences, {
    startYear: filters.startYear,
    endYear: filters.endYear,
    confSet: filters.confSet,
    query: input.value,
    upcomingOnly
  });
  results.innerHTML = groups.map(group => renderScheduleCard(group)).join('');
  const suffix = upcomingOnly ? ' upcoming' : '';
  status.textContent = groups.length
    ? `${groups.length} matching${suffix} conference${groups.length === 1 ? '' : 's'}`
    : `No conferences match these years, venue set, and search terms.`;
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
    upcomingOnly: document.querySelector<HTMLInputElement>('#upcoming-only')!.checked
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
  filters = createFilterBar('#filter-bar', {
    label: 'Conference schedule filters',
    fields: ['years', 'confSet'],
    years: { min: currentYear, max: currentYear + 1 },
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
  filters.element.insertAdjacentHTML('beforeend', `<div class="filter-group checkboxes">
    <label for="upcoming-only" class="filter-checkbox tooltip-trigger">
      <input type="checkbox" id="upcoming-only"${params.get('upcoming') === 'false' ? '' : ' checked'} aria-describedby="upcoming-only-help">
      <span>Upcoming only</span>
      <span class="tooltip-content" id="upcoming-only-help" role="tooltip">Shows conferences with a future submission deadline or conference date. Conference deadlines use Anywhere on Earth time.</span>
    </label>
  </div>`);
  document.getElementById('upcoming-only')!.addEventListener('change', () => {
    render();
    renderExamples();
  });
  initTooltipPositioning();

  try {
    const response = await fetch(new URL('./data/conferences.json', import.meta.url));
    if (!response.ok) throw new Error(`Conference data request failed (${response.status})`);
    conferences = await response.json();
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
