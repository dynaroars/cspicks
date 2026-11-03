/**
 * CS Awards & Grants Main Controller
 */
import { createFavoritesStore, onFavoriteChange, onlyFavorites, prioritizeFavorites, wantsFavoritesOnly, wireFavoriteToggles } from '../favorites.js';
import { downloadMarkdown, scrollToHashCard, wireFavoritesActions } from '../opportunity-card.js';
import { downloadCalendar } from '../calendar.js';
import { createProgressStore, filterByProgress, PROGRESS_SEARCH_CHOICES, wireProgressPickers } from '../progress.js';
import { createSearchControls, focusSearchOnLoad, renderSearchExamples, sample, searchChoices, updateSearchUrl } from '../search-controls.js';
import { restoreKeywordQuery, setQueryKeyword } from '../search-keywords.js';
import { SITE_NAME, updatePageMeta } from '../seo.js';
import { rankSuggestions } from '../suggestion-box.js';
import { initTooltipPositioning } from '../tooltip-position.js';
import { filterGrants, grantCalendarEvents, GRANTS_KEYWORD_SPECS, grantsSuggestions, groupBySponsor, loadGrantsData } from './grants-data.js';
import { grantsExportFileName, grantsToMarkdown, renderGrantCard, renderSponsorGroup } from './grants-render.js';
import type { Grant } from '../types.js';

const params = new URLSearchParams(window.location.search);
const input = document.querySelector<HTMLInputElement>('#grants-search')!;
const resultsContainer = document.getElementById('grants-results')!;
const statusText = document.getElementById('grants-status');
const countElement = document.getElementById('grants-count');
const favorites = createFavoritesStore('cspicks:grants-favorites');
const progress = createProgressStore('cspicks:grants-progress');

let allGrants: Grant[] = [];
const selectById = (id: string) => document.getElementById(id) as HTMLSelectElement | null;

const DEFAULT_SORT = 'deadline';

const DEFAULT_EXAMPLES = ['NSF CAREER', 'Google PhD Fellowship', 'audience: phd', 'category: industry', 'sponsor: NSF audience: faculty', 'loc: California', 'deadline: soon', 'citizenship: international', 'added: month', 'status: historical'];

function getFilterState() {
  return {
    query: input ? input.value.trim() : '',
    sortBy: selectById('sort-select')?.value || DEFAULT_SORT,
    view: selectById('view-select')?.value || 'award'
  };
}

function updateUrl(filterState: ReturnType<typeof getFilterState>) {
  const next = new URLSearchParams();
  if (filterState.query) next.set('q', filterState.query);
  if (filterState.sortBy !== DEFAULT_SORT) next.set('sort', filterState.sortBy);
  if (filterState.view !== 'award') next.set('view', filterState.view);

  updateSearchUrl(next, filterState.query);

  const titlePrefix = filterState.query ? `${filterState.query} - CS Awards & Grants` : 'CS Research Awards, Fellowships & Grants';
  updatePageMeta({
    title: `${titlePrefix} - ${SITE_NAME}`,
    description: filterState.query
      ? `Search results for "${filterState.query}" across CS research grants, fellowships, and industry awards.`
      : 'Explore CS research awards, fellowships, NSF calls, DARPA, DOE, and industry grants for CS faculty and students.'
  });
}

function render() {
  if (!allGrants.length) return;
  const filterState = getFilterState();
  const favoritesOnly = wantsFavoritesOnly(filterState.query);
  const matched = filterGrants(allGrants, filterState);
  const filtered = filterByProgress(
    favoritesOnly ? onlyFavorites(matched, grant => grant.id, favorites) : prioritizeFavorites(matched, grant => grant.id, favorites),
    filterState.query,
    GRANTS_KEYWORD_SPECS,
    grant => grant.id,
    progress
  );
  const now = new Date();

  if (!filtered.length) {
    resultsContainer.innerHTML = `
      <div class="empty-state grants-empty">
        <h3>${favoritesOnly ? 'No starred awards or grants match' : 'No matching awards or grants found'}</h3>
        <p>${favoritesOnly ? 'Star an award with the ☆ button to keep it here, or clear “favorites: only” from search.' : 'Try broadening your search terms or clearing some filters.'}</p>
        <button type="button" class="btn-secondary" id="reset-grants-filters">Reset all filters</button>
      </div>
    `;
  } else if (filterState.view === 'sponsor') {
    resultsContainer.innerHTML = groupBySponsor(filtered).map(group => renderSponsorGroup(group, favorites.isFavorite, now, progress.get)).join('');
  } else {
    resultsContainer.innerHTML = filtered.map(grant => renderGrantCard(grant, favorites.isFavorite, now, progress.get)).join('');
  }

  const countStr = `${filtered.length} award${filtered.length === 1 ? '' : 's'} &amp; grant${filtered.length === 1 ? '' : 's'}`;
  if (countElement) countElement.innerHTML = countStr;
  if (statusText) {
    const sponsors = new Set(filtered.map(grant => grant.sponsor)).size;
    statusText.textContent = `Showing ${filtered.length} of ${allGrants.length} funding opportunities${filtered.length ? ` from ${sponsors} sponsor${sponsors === 1 ? '' : 's'}` : ''}`;
  }

  updateUrl(filterState);
}

function buildSuggestions() {
  return createSearchControls({
    input,
    listbox: document.getElementById('universal-suggestions')!,
    specs: GRANTS_KEYWORD_SPECS, example: 'audience: phd category: industry topic: AI',
    examples: document.getElementById('grants-examples'), onQuery: () => render(),
    getKeywordSources: () => {
      const items = grantsSuggestions(allGrants);
      return {
        sponsor: items.sponsors, audience: searchChoices(['faculty', 'students', 'phd', 'undergrad', 'postdoc']), topic: items.topics,
        category: searchChoices(['government', 'industry', 'foundation', 'society']),
        deadline: searchChoices({ soon: 'Next 30 days', week: 'Next 7 days', rolling: 'Rolling / open', fixed: 'Fixed dates' }), status: searchChoices(['all', 'current', 'historical']),
        citizenship: searchChoices({ international: 'Not limited to US citizens or residents', open: 'Stated open to international applicants', pr: 'US permanent residents eligible', 'us-only': 'US citizens only' }),
        added: searchChoices({ week: 'Added in the last 7 days', month: 'Added in the last month' }),
        loc: searchChoices([...new Set(allGrants.flatMap(grant => grant.locations || []))]),
        progress: searchChoices(PROGRESS_SEARCH_CHOICES),
        favorites: searchChoices(['only'])
      };
    },
    emptyText: 'No matching grant, sponsor, or topic',
    getGroups: query => {
      const items = grantsSuggestions(allGrants);
      return [
        ['Awards & Fellowships', rankSuggestions(items.awards, query, 8)],
        ['Sponsors & Agencies', rankSuggestions(items.sponsors, query, 5)],
        ['Target Audience', rankSuggestions(items.audiences, query, 4)],
        ['Topics & Research Areas', rankSuggestions(items.topics, query, 5)]
      ];
    },
    onSelect: item => {
      if (!item.value && item.type === 'award' && item.grantId) {
        input.value = item.value || item.label;
        render();
        window.location.hash = item.grantId;
        scrollToHashCard();
      } else {
        input.value = item.value || item.label;
        render();
      }
    }
  });
}

function setupExamples() {
  renderSearchExamples(document.getElementById('grants-examples')!, sample(DEFAULT_EXAMPLES, 4));
}

function setupDelegatedListeners() {
  wireProgressPickers(resultsContainer, progress);

  // Topic clicks, sponsor clicks, and reset on cards
  resultsContainer.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const resetBtn = target.closest('#reset-grants-filters');
    if (resetBtn) {
      input.value = '';
      selectById('sort-select')!.value = DEFAULT_SORT;
      selectById('view-select')!.value = 'award';
      render();
      input.focus();
      return;
    }

    const calendar = target.closest<HTMLElement>('[data-calendar-grant]');
    if (calendar) {
      const grant = allGrants.find(item => item.id === calendar.dataset.calendarGrant);
      if (grant) downloadCalendar(`${grant.id}-deadlines.ics`, grantCalendarEvents(grant), `${grant.shortName || grant.name} deadlines`);
      return;
    }

    const topicBtn = target.closest<HTMLElement>('[data-search-topic]');
    if (topicBtn) {
      input.value = setQueryKeyword(input.value, 'topic', [topicBtn.dataset.searchTopic!], GRANTS_KEYWORD_SPECS);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const sponsorBtn = target.closest<HTMLElement>('[data-search-sponsor]');
    if (sponsorBtn) {
      input.value = setQueryKeyword(input.value, 'sponsor', [sponsorBtn.dataset.searchSponsor!], GRANTS_KEYWORD_SPECS);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
  });

  // Filter change listeners
  ['sort-select', 'view-select'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      render();
    });
  });
}

function restoreFilters() {
  input.value = restoreKeywordQuery(params, { audience: 'audience', sponsor: 'category', topic: 'topic', deadline: 'deadline', status: 'status', favorites: 'favorites' });
  const sort = params.get('sort');
  const sortSelect = selectById('sort-select')!;
  if (sort && [...sortSelect.options].some(option => option.value === sort)) sortSelect.value = sort;
  if (params.get('view') === 'sponsor') selectById('view-select')!.value = 'sponsor';
}

async function init() {
  try {
    allGrants = await loadGrantsData();
    restoreFilters();
    buildSuggestions();

    input.disabled = false;
    input.placeholder = 'Search awards or use keywords: sponsor: NSF audience: phd';
    const favoritesMenu = wireFavoritesActions({
      getItems: () => allGrants,
      getId: grant => grant.id,
      favorites,
      calendarEvents: grant => grantCalendarEvents(grant),
      calendarFileName: 'cspicks-starred-award-deadlines.ics',
      calendarTitle: 'CS Picks: starred award deadlines',
      exportNoun: 'awards',
      onExportMarkdown: starred => {
        const now = new Date();
        const ordered = filterGrants(starred, { status: 'all', sortBy: getFilterState().sortBy, now });
        downloadMarkdown(grantsExportFileName(now.getTime()), grantsToMarkdown(ordered, { now, getProgress: progress.get }));
      }
    });
    wireFavoriteToggles(resultsContainer, favorites);
    onFavoriteChange(resultsContainer, () => { favoritesMenu.update(); render(); });
    favoritesMenu.update();
    initTooltipPositioning();

    setupExamples();
    setupDelegatedListeners();
    render();
    focusSearchOnLoad(input);

    // render() is synchronous, so the cards already exist.
    scrollToHashCard();
  } catch (error) {
    console.error('Failed to load grants data:', error);
    if (statusText) {
      statusText.textContent = 'Awards and grants data could not be loaded. Please try again.';
      statusText.classList.add('load-error');
    }
  }
}

init();
