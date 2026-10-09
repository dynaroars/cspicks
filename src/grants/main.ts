/**
 * CS Awards & Grants Main Controller
 */
import { GRANTS_KEYWORD_SPECS, loadGrantsData, filterGrants, grantsSuggestions } from './grants-data.js';
import { renderGrantCard } from './grants-render.js';
import { rankSuggestions } from '../suggestion-box.js';
import { initTooltipPositioning } from '../tooltip-position.js';
import { SITE_NAME, updatePageMeta } from '../seo.js';
import { trackView } from '../analytics.js';
import { escapeHtml } from '../shared.js';
import { createFavoritesStore, onFavoriteChange, onlyFavorites, prioritizeFavorites, wantsFavoritesOnly, wireFavoriteToggles } from '../favorites.js';
import { restoreKeywordQuery, setQueryKeyword } from '../search-keywords.js';
import type { Grant } from '../types.js';
import { createSearchControls, renderSearchExamples, searchChoices, updateSearchUrl } from '../search-controls.js';

const params = new URLSearchParams(window.location.search);
const input = document.querySelector<HTMLInputElement>('#grants-search')!;
const resultsContainer = document.getElementById('grants-results')!;
const statusText = document.getElementById('grants-status');
const countElement = document.getElementById('grants-count');
const favorites = createFavoritesStore('cspicks:grants-favorites');

let allGrants: Grant[] = [];
let suggestions: ReturnType<typeof createSearchControls> | null = null;
const selectById = (id: string) => document.getElementById(id) as HTMLSelectElement | null;

const DEFAULT_EXAMPLES = ['NSF CAREER', 'Google PhD Fellowship', 'audience: phd', 'category: industry', 'sponsor: NSF audience: faculty', 'loc: California', 'deadline: rolling', 'status: historical'];

function getFilterState() {
  return {
    query: input ? input.value.trim() : '',
    sortBy: selectById('sort-select')?.value || 'featured'
  };
}

function updateUrl(filterState: ReturnType<typeof getFilterState>) {
  const next = new URLSearchParams();
  if (filterState.query) next.set('q', filterState.query);
  if (filterState.sortBy !== 'featured') next.set('sort', filterState.sortBy);

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
  const filtered = favoritesOnly ? onlyFavorites(matched, grant => grant.id, favorites) : prioritizeFavorites(matched, grant => grant.id, favorites);

  if (!filtered.length) {
    resultsContainer.innerHTML = `
      <div class="universal-suggestion-empty" style="padding: 3rem 1rem; text-align: center; color: var(--text-secondary);">
        <h3>${favoritesOnly ? 'No starred awards or grants match' : 'No matching awards or grants found'}</h3>
        <p style="margin-top: 0.5rem;">${favoritesOnly ? 'Star an award with the ☆ button to keep it here, or clear “favorites: only” from search.' : 'Try broadening your search terms or clearing some filters.'}</p>
        <button type="button" class="btn-secondary" id="reset-grants-filters" style="margin-top: 1rem;">Reset all filters</button>
      </div>
    `;
  } else {
    resultsContainer.innerHTML = filtered.map(grant => renderGrantCard(grant, favorites.isFavorite)).join('');
  }

  const countStr = `${filtered.length} award${filtered.length === 1 ? '' : 's'} &amp; grant${filtered.length === 1 ? '' : 's'}`;
  if (countElement) countElement.innerHTML = countStr;
  if (statusText) {
    statusText.textContent = `Showing ${filtered.length} of ${allGrants.length} funding opportunities`;
  }

  updateUrl(filterState);
  trackView(filterState.query ? 'search-results' : 'default', 'grants');
}

function handleHashScroll() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const targetElement = document.getElementById(hash);
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetElement.classList.add('is-highlighted');
    window.setTimeout(() => targetElement.classList.remove('is-highlighted'), 2400);
  }
}

function buildSuggestions() {
  return createSearchControls({
    input,
    listbox: document.getElementById('universal-suggestions')!,
    specs: GRANTS_KEYWORD_SPECS, helpId: 'grants-search-help', example: 'audience: phd category: industry topic: AI',
    examples: document.getElementById('grants-examples'), onQuery: () => render(),
    getKeywordSources: () => {
      const items = grantsSuggestions(allGrants);
      return {
        sponsor: items.sponsors, audience: searchChoices(['faculty', 'students', 'phd', 'undergrad', 'postdoc']), topic: items.topics,
        category: searchChoices(['government', 'industry', 'foundation', 'society']),
        deadline: searchChoices(['rolling', 'fixed']), status: searchChoices(['all', 'current', 'historical']),
        loc: searchChoices([...new Set(allGrants.flatMap(grant => grant.locations || []))]), favorites: searchChoices(['only'])
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
        handleHashScroll();
      } else {
        input.value = item.value || item.label;
        render();
      }
    }
  });
}

function setupExamples() {
  renderSearchExamples(document.getElementById('grants-examples')!, DEFAULT_EXAMPLES);
}

function setupDelegatedListeners() {
  // Topic clicks, sponsor clicks, and reset on cards
  resultsContainer.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const resetBtn = target.closest('#reset-grants-filters');
    if (resetBtn) {
      input.value = '';
      const sortEl = selectById('sort-select');
      if (sortEl) sortEl.value = 'featured';
      render();
      input.focus();
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
  ['sort-select'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      render();
    });
  });

  // Slash key to focus search

}

function restoreFilters() {
  input.value = restoreKeywordQuery(params, { audience: 'audience', sponsor: 'category', topic: 'topic', deadline: 'deadline', status: 'status', favorites: 'favorites' });
  const sort = params.get('sort');
  const sortSelect = selectById('sort-select')!;
  if (sort && [...sortSelect.options].some(option => option.value === sort)) sortSelect.value = sort;
}

async function init() {
  try {
    allGrants = await loadGrantsData();
    restoreFilters();
    suggestions = buildSuggestions();

    input.disabled = false;
    input.placeholder = 'Search awards or use keywords: sponsor: NSF audience: phd';
    wireFavoriteToggles(resultsContainer, favorites);
    onFavoriteChange(resultsContainer, render);
    initTooltipPositioning();

    setupExamples();
    setupDelegatedListeners();
    render();

    if (window.location.hash) {
      window.setTimeout(handleHashScroll, 300);
    }
  } catch (error) {
    console.error('Failed to load grants data:', error);
    if (statusText) {
      statusText.textContent = 'Awards and grants data could not be loaded. Please try again.';
      statusText.classList.add('load-error');
    }
  }
}

init();
