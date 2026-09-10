import { DEFAULT_END_YEAR, DEFAULT_START_YEAR, filterByYears, loadAffiliationData, normalizeConferenceSet } from './data.js';
import { applyPerCapitaRanks } from './metrics/per-capita.js';
import { getInitialRegion, rememberRegion } from './shared.js';
import type { ConferenceSetId } from './data/conference-sets.js';
import type { AffiliationHistory, FilteredData, RawData, SchoolAliasMap } from './types.js';

type FilterField = 'region' | 'years' | 'rankings' | 'history' | 'percapita' | 'confSet';
interface FilterState {
  region: string;
  startYear: number;
  endYear: number;
  confSet: ConferenceSetId;
  rankings: boolean;
  historical: boolean;
  perCapita: boolean;
}
type PersistedFields = Partial<Record<'years' | 'confSet' | 'rankings' | 'history' | 'percapita', boolean>>;

export interface FilterController extends FilterState {
  element: Element;
  readonly historyMap: AffiliationHistory | null;
  readonly aliasMap: SchoolAliasMap | null;
  setDisabled(disabled: boolean): void;
  apply(rawData: RawData): FilteredData;
  toParams(target?: URLSearchParams): URLSearchParams;
  ready(): Promise<FilterController>;
}

interface FilterBarOptions {
  fields?: FilterField[];
  years?: { min: number, max: number };
  prefix?: string;
  prefixId?: string;
  label?: string;
  className?: string;
  defaults?: Partial<FilterState>;
  persist?: PersistedFields;
  params?: URLSearchParams;
  onChange?: (controller: FilterController) => void;
}

// Every page shows the same "region / years / conference set / rankings /
// history" controls.
// This module owns their markup, state, persistence, and the affiliation data
// that History mode needs, so pages only declare which fields they want.

const CONF_SET_HELP = 'Select conference venues: CSRankings default/all, CORE tiers, or union of all sets.';
const HISTORY_HELP = 'Credits papers to the university where the author was affiliated when published.';
const RANKINGS_HELP = 'Displays overall and per-area ranks for institutions in the selected view.';
const PER_CAPITA_HELP = 'Ranks universities by output per faculty member (min. 5 active faculty).';

const REGIONS: Array<[string, string]> = [
  ['world', 'World'],
  ['us', 'USA'],
  ['europe', 'Europe'],
  ['asia', 'Asia'],
  ['canada', 'Canada'],
  ['australasia', 'Australasia']
];
const REGION_IDS = new Set(REGIONS.map(([value]) => value));

const CONF_SETS: Array<[ConferenceSetId, string]> = [
  ['csrankings-default', 'CSRankings (Default)'],
  ['csrankings', 'CSRankings (All)'],
  ['core', 'CORE A*'],
  ['core-a', 'CORE A*/A'],
  ['all-union', 'All (Union)']
];

// Versioned: the conference-set default changed from CSRankings-default to
// All (Union), so readers carrying the old stored value would otherwise
// never see the new default.
const FILTER_STORAGE_KEY = 'cspicks:filters:v3';

// Filter choices follow the reader from page to page, so clicking through to
// another university or tool does not silently reset them.
function readStoredFilters(): Partial<FilterState> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(FILTER_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function storeFilters(state: FilterState, persisted: PersistedFields = {}) {
  try {
    const stored = readStoredFilters();
    if (persisted.years) {
      stored.startYear = state.startYear;
      stored.endYear = state.endYear;
    }
    if (persisted.confSet) stored.confSet = state.confSet;
    if (persisted.rankings) stored.rankings = state.rankings;
    if (persisted.history) stored.historical = state.historical;
    if (persisted.percapita) stored.perCapita = state.perCapita;
    globalThis.localStorage?.setItem(FILTER_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Filters still work for this page without storage.
  }
}

let affiliationData: { historyMap: AffiliationHistory, aliasMap: SchoolAliasMap } | null = null;

// Shared across pages: the affiliation history is large, so load it at most once.
export async function loadHistoryMaps() {
  if (!affiliationData) {
    const data = await loadAffiliationData();
    affiliationData = { historyMap: data.historyMap, aliasMap: data.aliasMap };
  }
  return affiliationData;
}

// The help panel hangs off the control itself rather than a separate ⓘ, so
// hovering (or tabbing to) the control explains it. `tooltip-position.js`
// measures whichever element carries `.tooltip-trigger`, so the panel lines up
// with the whole control. Callers put `tooltip-trigger` on that element and
// point the input's aria-describedby at this id.
function helpPanel(id: string, help: string) {
  return `<span class="tooltip-content" id="${id}" role="tooltip">${help}</span>`;
}

function optionsHtml(entries: Array<[string, string]>, selected: string) {
  return entries
    .map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`)
    .join('');
}

function yearOptions(min: number, max: number, selected: number) {
  let html = '';
  for (let year = min; year <= max; year++) {
    html += `<option value="${year}"${year === selected ? ' selected' : ''}>${year}</option>`;
  }
  return html;
}

/**
 * Renders a filter bar into `mount` and returns a controller holding the state.
 *
 * fields   — any of 'region', 'years', 'rankings', 'history', 'percapita',
 *            'confSet'; render order is fixed here, not by this array
 * defaults — optional initial values used before stored choices and URL params
 * persist  — per-field booleans; Schedule disables year persistence so its
 *            current/next-year window cannot overwrite publication filters
 * onChange — called after any control changes, with the controller
 * The controller exposes the current values plus `apply(rawData)`, which runs
 * `filterByYears` with the right history maps for the current History setting.
 */
export function createFilterBar(mount: string | Element, {
  fields = ['region', 'years', 'rankings', 'history', 'confSet'],
  years = { min: 1970, max: new Date().getFullYear() + 1 },
  prefix = '',
  prefixId = '',
  label = 'Filters',
  className = '',
  defaults = {},
  persist = {},
  params = new URLSearchParams(window.location.search),
  onChange = () => {}
}: FilterBarOptions = {}): FilterController {
  const element = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (!element) throw new Error('createFilterBar: mount element not found');

  const has = (field: FilterField) => fields.includes(field);
  const persisted = {
    years: persist.years ?? has('years'),
    confSet: persist.confSet ?? has('confSet'),
    rankings: persist.rankings ?? has('rankings'),
    history: persist.history ?? has('history'),
    percapita: persist.percapita ?? has('percapita')
  };
  const state: FilterState = {
    region: has('region') ? getInitialRegion() : 'world',
    startYear: defaults.startYear ?? DEFAULT_START_YEAR,
    endYear: defaults.endYear ?? DEFAULT_END_YEAR,
    confSet: defaults.confSet ?? 'all-union',
    rankings: defaults.rankings ?? false,
    historical: defaults.historical ?? false,
    // Off by default so the default view reproduces official CSRankings
    // (which ranks by department total, not by output per faculty member).
    perCapita: defaults.perCapita ?? false
  };

  // A link's parameters win; otherwise the reader's last choices apply.
  const stored = readStoredFilters();
  if (persisted.years && Number.isFinite(stored.startYear)) state.startYear = stored.startYear!;
  if (persisted.years && Number.isFinite(stored.endYear)) state.endYear = stored.endYear!;
  if (persisted.confSet && stored.confSet) state.confSet = normalizeConferenceSet(stored.confSet);
  if (persisted.rankings && typeof stored.rankings === 'boolean') state.rankings = stored.rankings;
  if (persisted.history && typeof stored.historical === 'boolean') state.historical = stored.historical;
  if (persisted.percapita && typeof stored.perCapita === 'boolean') state.perCapita = stored.perCapita;

  const regionParam = params.get('region');
  if (regionParam && REGION_IDS.has(regionParam)) state.region = regionParam;
  if (params.has('start')) {
    const startYear = Number.parseInt(params.get('start')!, 10);
    if (Number.isFinite(startYear)) state.startYear = startYear;
  }
  if (params.has('end')) {
    const endYear = Number.parseInt(params.get('end')!, 10);
    if (Number.isFinite(endYear)) state.endYear = endYear;
  }
  if (params.has('confSet')) state.confSet = normalizeConferenceSet(params.get('confSet')!);
  if (params.has('rankings')) state.rankings = params.get('rankings') === 'true';
  if (params.has('historical')) state.historical = params.get('historical') === 'true';
  if (params.has('percapita')) state.perCapita = params.get('percapita') === 'true';
  state.startYear = Math.min(Math.max(state.startYear, years.min), years.max);
  state.endYear = Math.min(Math.max(state.endYear, years.min), years.max);
  storeFilters(state, persisted);

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
    ${has('rankings') ? `<div class="filter-group checkboxes">
      <label for="show-rankings" class="filter-checkbox tooltip-trigger">
        <input type="checkbox" id="show-rankings" aria-describedby="show-rankings-help"${state.rankings ? ' checked' : ''}>
        <span>Show Rankings</span>
        ${helpPanel('show-rankings-help', RANKINGS_HELP)}
      </label>
    </div>` : ''}
    ${has('history') ? `<div class="filter-group checkboxes">
      <label for="historical-mode" class="filter-checkbox tooltip-trigger">
        <input type="checkbox" id="historical-mode" aria-describedby="historical-mode-help"${state.historical ? ' checked' : ''}>
        <span>History</span>
        ${helpPanel('historical-mode-help', HISTORY_HELP)}
      </label>
    </div>` : ''}
    ${has('percapita') ? `<div class="filter-group checkboxes">
      <label for="per-capita-mode" class="filter-checkbox tooltip-trigger">
        <input type="checkbox" id="per-capita-mode" aria-describedby="per-capita-mode-help"${state.perCapita ? ' checked' : ''}>
        <span>Per capita</span>
        ${helpPanel('per-capita-mode-help', PER_CAPITA_HELP)}
      </label>
    </div>` : ''}
    ${has('confSet') ? `<div class="filter-group conference-set-control tooltip-trigger">
      <select id="conf-set" aria-label="Conference set" aria-describedby="conf-set-help">${optionsHtml(CONF_SETS, state.confSet)}</select>
      ${helpPanel('conf-set-help', CONF_SET_HELP)}
    </div>` : ''}
  `;

  const regionSelect = element.querySelector<HTMLSelectElement>('#region-select');
  const startSelect = element.querySelector<HTMLSelectElement>('#start-year');
  const endSelect = element.querySelector<HTMLSelectElement>('#end-year');
  const confSelect = element.querySelector<HTMLSelectElement>('#conf-set');
  const rankingsToggle = element.querySelector<HTMLInputElement>('#show-rankings');
  const historyToggle = element.querySelector<HTMLInputElement>('#historical-mode');
  const perCapitaToggle = element.querySelector<HTMLInputElement>('#per-capita-mode');

  const controller: FilterController = {
    element,
    get region() { return state.region; },
    get startYear() { return state.startYear; },
    get endYear() { return state.endYear; },
    get confSet() { return state.confSet; },
    get rankings() { return state.rankings; },
    get historical() { return state.historical; },
    get perCapita() { return state.perCapita; },
    get historyMap() { return state.historical ? affiliationData?.historyMap || null : null; },
    get aliasMap() { return state.historical ? affiliationData?.aliasMap || null : null; },

    setDisabled(disabled) {
      element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach(control => {
        control.disabled = disabled;
      });
    },

    apply(rawData: RawData) {
      const data = filterByYears(rawData, state.startYear, state.endYear, state.region,
        controller.historyMap, controller.aliasMap, state.confSet);
      if (state.perCapita) {
        applyPerCapitaRanks(data);
      }
      return data;
    },

    // Writes the shared filter params so every page produces the same URL shape.
    toParams(target = new URLSearchParams()) {
      if (has('region')) target.set('region', state.region);
      if (has('years')) {
        target.set('start', String(state.startYear));
        target.set('end', String(state.endYear));
      }
      if (has('confSet') && state.confSet !== 'all-union') target.set('confSet', state.confSet);
      if (has('rankings') && state.rankings) target.set('rankings', 'true');
      if (has('history') && state.historical) target.set('historical', 'true');
      if (has('percapita') && state.perCapita) target.set('percapita', 'true');
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
        startSelect.value = String(state.startYear);
        endSelect.value = String(state.endYear);
      }
    }
    if (confSelect) state.confSet = normalizeConferenceSet(confSelect.value);
    storeFilters(state, persisted);
  };

  [regionSelect, startSelect, endSelect, confSelect].forEach(control => {
    control?.addEventListener('change', () => {
      readControls();
      onChange(controller);
    });
  });

  rankingsToggle?.addEventListener('change', () => {
    state.rankings = rankingsToggle.checked;
    storeFilters(state, persisted);
    onChange(controller);
  });

  perCapitaToggle?.addEventListener('change', () => {
    state.perCapita = perCapitaToggle.checked;
    storeFilters(state, persisted);
    onChange(controller);
  });

  historyToggle?.addEventListener('change', async () => {
    historyToggle.disabled = true;
    try {
      if (historyToggle.checked) await loadHistoryMaps();
      state.historical = historyToggle.checked;
      storeFilters(state, persisted);
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
