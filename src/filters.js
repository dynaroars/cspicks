import { DEFAULT_END_YEAR, DEFAULT_START_YEAR, filterByYears, loadAffiliationData, normalizeConferenceSet } from './data.js';
import { getInitialRegion, rememberRegion } from './shared.js';

// Every page shows the same "region / years / conference set / rankings /
// history" controls.
// This module owns their markup, state, persistence, and the affiliation data
// that History mode needs, so pages only declare which fields they want.

const CONF_SET_HELP = 'Chooses which publication venues count. CSRankings Default follows the primary CSRankings set; CSRankings All includes its extended venues; CORE options use CORE conference tiers.';
const HISTORY_HELP = 'When enabled, publications are credited to the institution where the author was affiliated at the time of publication, not their current institution. Use the year selectors to filter results for a specific historical period.';
const RANKINGS_HELP = 'Numbers the result lists and shows each university\'s overall and per-area rank for the selected region, years, and conference set.';

const REGIONS = [
  ['world', 'World'],
  ['us', 'USA'],
  ['europe', 'Europe'],
  ['asia', 'Asia'],
  ['canada', 'Canada'],
  ['australasia', 'Australasia']
];

const CONF_SETS = [
  ['csrankings-default', 'CSRankings (Default)'],
  ['csrankings', 'CSRankings (All)'],
  ['core', 'CORE A*'],
  ['core-a', 'CORE A*/A']
];

const FILTER_STORAGE_KEY = 'cspicks:filters';

// Filter choices follow the reader from page to page, so clicking through to
// another university or tool does not silently reset them.
function readStoredFilters() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(FILTER_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function storeFilters(state) {
  try {
    globalThis.localStorage?.setItem(FILTER_STORAGE_KEY, JSON.stringify({
      startYear: state.startYear,
      endYear: state.endYear,
      confSet: state.confSet,
      rankings: state.rankings,
      historical: state.historical
    }));
  } catch {
    // Filters still work for this page without storage.
  }
}

let affiliationData = null;

// Shared across pages: the affiliation history is large, so load it at most once.
export async function loadHistoryMaps() {
  if (!affiliationData) {
    const data = await loadAffiliationData();
    affiliationData = { historyMap: data.historyMap, aliasMap: data.aliasMap };
  }
  return affiliationData;
}

function tooltip(label, help) {
  return `<span class="tooltip-trigger filter-info" tabindex="0" aria-label="About ${label}">ⓘ<span class="tooltip-content">${help}</span></span>`;
}

function optionsHtml(entries, selected) {
  return entries
    .map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`)
    .join('');
}

function yearOptions(min, max, selected) {
  let html = '';
  for (let year = min; year <= max; year++) {
    html += `<option value="${year}"${year === selected ? ' selected' : ''}>${year}</option>`;
  }
  return html;
}

/**
 * Renders a filter bar into `mount` and returns a controller holding the state.
 *
 * fields   — any of 'region', 'years', 'confSet', 'rankings', 'history' (order
 *            is fixed)
 * onChange — called after any control changes, with the controller
 * The controller exposes the current values plus `apply(rawData)`, which runs
 * `filterByYears` with the right history maps for the current History setting.
 */
export function createFilterBar(mount, {
  fields = ['region', 'years', 'confSet', 'rankings', 'history'],
  years = { min: 1970, max: new Date().getFullYear() + 1 },
  prefix = '',
  prefixId = '',
  label = 'Filters',
  className = '',
  params = new URLSearchParams(window.location.search),
  onChange = () => {}
} = {}) {
  const element = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (!element) throw new Error('createFilterBar: mount element not found');

  const has = field => fields.includes(field);
  const state = {
    region: has('region') ? getInitialRegion() : 'world',
    startYear: DEFAULT_START_YEAR,
    endYear: DEFAULT_END_YEAR,
    confSet: 'csrankings-default',
    rankings: false,
    historical: false
  };

  // A link's parameters win; otherwise the reader's last choices apply.
  const stored = readStoredFilters();
  if (Number.isFinite(stored.startYear)) state.startYear = stored.startYear;
  if (Number.isFinite(stored.endYear)) state.endYear = stored.endYear;
  if (stored.confSet) state.confSet = normalizeConferenceSet(stored.confSet);
  if (typeof stored.rankings === 'boolean') state.rankings = stored.rankings;
  if (typeof stored.historical === 'boolean') state.historical = stored.historical;

  if (params.has('region')) state.region = params.get('region');
  if (params.has('start')) state.startYear = parseInt(params.get('start'));
  if (params.has('end')) state.endYear = parseInt(params.get('end'));
  if (params.has('confSet')) state.confSet = normalizeConferenceSet(params.get('confSet'));
  if (params.has('rankings')) state.rankings = params.get('rankings') === 'true';
  if (params.has('historical')) state.historical = params.get('historical') === 'true';
  state.startYear = Math.min(Math.max(state.startYear, years.min), years.max);
  state.endYear = Math.min(Math.max(state.endYear, years.min), years.max);
  storeFilters(state);

  element.className = ['filters', 'search-filters', className].filter(Boolean).join(' ');
  element.setAttribute('aria-label', label);
  element.innerHTML = `
    ${prefix ? `<span class="filter-sentence-prefix"${prefixId ? ` id="${prefixId}"` : ''}>${prefix}</span>` : ''}
    ${has('region') ? `<div class="filter-group search-region-control">
      <select id="region-select" aria-label="Region">${optionsHtml(REGIONS, state.region)}</select>
    </div>` : ''}
    ${has('years') ? `<div class="filter-group" id="year-filter-group" aria-label="Year range">
      <div class="year-inputs">
        <select id="start-year" aria-label="Start year">${yearOptions(years.min, years.max, state.startYear)}</select>
        <span>to</span>
        <select id="end-year" aria-label="End year">${yearOptions(years.min, years.max, state.endYear)}</select>
      </div>
    </div>` : ''}
    ${has('confSet') ? `<div class="filter-group conference-set-control">
      <select id="conf-set" aria-label="Conference set">${optionsHtml(CONF_SETS, state.confSet)}</select>
      ${tooltip('conference sets', CONF_SET_HELP)}
    </div>` : ''}
    ${has('rankings') ? `<div class="filter-group checkboxes">
      <label for="show-rankings" class="filter-checkbox">
        <input type="checkbox" id="show-rankings"${state.rankings ? ' checked' : ''}>
        <span>Rankings</span>
        ${tooltip('rankings', RANKINGS_HELP)}
      </label>
    </div>` : ''}
    ${has('history') ? `<div class="filter-group checkboxes">
      <label for="historical-mode" class="filter-checkbox">
        <input type="checkbox" id="historical-mode"${state.historical ? ' checked' : ''}>
        <span>History</span>
        ${tooltip('historical mode', HISTORY_HELP)}
      </label>
    </div>` : ''}
  `;

  const regionSelect = element.querySelector('#region-select');
  const startSelect = element.querySelector('#start-year');
  const endSelect = element.querySelector('#end-year');
  const confSelect = element.querySelector('#conf-set');
  const rankingsToggle = element.querySelector('#show-rankings');
  const historyToggle = element.querySelector('#historical-mode');

  const controller = {
    element,
    get region() { return state.region; },
    get startYear() { return state.startYear; },
    get endYear() { return state.endYear; },
    get confSet() { return state.confSet; },
    get rankings() { return state.rankings; },
    get historical() { return state.historical; },
    get historyMap() { return state.historical ? affiliationData?.historyMap || null : null; },
    get aliasMap() { return state.historical ? affiliationData?.aliasMap || null : null; },

    apply(rawData) {
      return filterByYears(rawData, state.startYear, state.endYear, state.region,
        controller.historyMap, controller.aliasMap, state.confSet);
    },

    // Writes the shared filter params so every page produces the same URL shape.
    toParams(target = new URLSearchParams()) {
      if (has('region')) target.set('region', state.region);
      if (has('years')) {
        target.set('start', String(state.startYear));
        target.set('end', String(state.endYear));
      }
      if (has('confSet') && state.confSet !== 'csrankings-default') target.set('confSet', state.confSet);
      if (has('rankings') && state.rankings) target.set('rankings', 'true');
      if (has('history') && state.historical) target.set('historical', 'true');
      return target;
    },

    // Loads affiliation data if the page starts with History already enabled.
    async ready() {
      if (state.historical) await loadHistoryMaps();
      return controller;
    }
  };

  const readControls = () => {
    if (regionSelect) {
      state.region = regionSelect.value;
      rememberRegion(state.region);
    }
    if (startSelect && endSelect) {
      state.startYear = Number(startSelect.value);
      state.endYear = Number(endSelect.value);
      if (state.startYear > state.endYear) {
        [state.startYear, state.endYear] = [state.endYear, state.startYear];
        startSelect.value = state.startYear;
        endSelect.value = state.endYear;
      }
    }
    if (confSelect) state.confSet = confSelect.value;
    storeFilters(state);
  };

  [regionSelect, startSelect, endSelect, confSelect].forEach(control => {
    control?.addEventListener('change', () => {
      readControls();
      onChange(controller);
    });
  });

  rankingsToggle?.addEventListener('change', () => {
    state.rankings = rankingsToggle.checked;
    storeFilters(state);
    onChange(controller);
  });

  historyToggle?.addEventListener('change', async () => {
    historyToggle.disabled = true;
    try {
      if (historyToggle.checked) await loadHistoryMaps();
      state.historical = historyToggle.checked;
      storeFilters(state);
      onChange(controller);
    } catch (error) {
      console.error('Failed to load historical affiliation data:', error);
      historyToggle.checked = false;
      state.historical = false;
      window.alert('Historical affiliation data could not be loaded. Please try again.');
    } finally {
      historyToggle.disabled = false;
    }
  });

  return controller;
}
