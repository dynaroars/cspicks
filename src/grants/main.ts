/**
 * CS Awards & Grants Main Controller
 */
import { GRANTS_KEYWORD_SPECS, loadGrantsData, filterGrants, grantsSuggestions } from './grants-data.js';
import { renderGrantCard } from './grants-render.js';
import { createSuggestionBox, rankSuggestions } from '../suggestion-box.js';
import { initTooltipPositioning } from '../tooltip-position.js';
import { SITE_NAME, updatePageMeta } from '../seo.js';
import { trackView } from '../analytics.js';
import { escapeHtml } from '../shared.js';
import { createFavoritesStore, favoritesSelect, onFavoriteChange, onlyFavorites, prioritizeFavorites, wantsFavoritesOnly, wireFavoriteToggles } from '../favorites.js';
import { keywordSuggestions, mountKeywordHelp, restoreKeywordQuery, setQueryKeyword } from '../search-keywords.js';
import type { Grant } from '../types.js';
import type { createSuggestionBox as CreateSuggestionBox } from '../suggestion-box.js';

const params = new URLSearchParams(window.location.search);
const input = document.querySelector<HTMLInputElement>('#grants-search')!;
const resultsContainer = document.getElementById('grants-results')!;
const statusText = document.getElementById('grants-status');
const countElement = document.getElementById('grants-count');
const favorites = createFavoritesStore('cspicks:grants-favorites');

let allGrants: Grant[] = [];
let suggestions: ReturnType<typeof CreateSuggestionBox> | null = null;
const selectById = (id: string) => document.getElementById(id) as HTMLSelectElement | null;

const DEFAULT_EXAMPLES = ['NSF CAREER', 'Google PhD Fellowship', 'audience: phd', 'category: industry', 'sponsor: NSF audience: faculty', 'loc: California', 'deadline: rolling', 'status: historical'];

function getFilterState() {
  return {
    query: input ? input.value.trim() : '',
    sortBy: selectById('sort-select')?.value || 'featured',
    favorites: selectById('favorites-select')?.value || 'all'
  };
}

function updateUrl(filterState: ReturnType<typeof getFilterState>) {
  const next = new URLSearchParams();
  if (filterState.query) next.set('q', filterState.query);
  if (filterState.sortBy !== 'featured') next.set('sort', filterState.sortBy);
  if (filterState.favorites === 'only') next.set('favorites', 'only');

  const newUrl = next.toString() ? `${window.location.pathname}?${next}${window.location.hash}` : `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, '', newUrl);

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
  const favoritesOnly = wantsFavoritesOnly(filterState.query, filterState.favorites);
  const matched = filterGrants(allGrants, filterState);
  const filtered = favoritesOnly ? onlyFavorites(matched, grant => grant.id, favorites) : prioritizeFavorites(matched, grant => grant.id, favorites);

  if (!filtered.length) {
    resultsContainer.innerHTML = `
      <div class="universal-suggestion-empty" style="padding: 3rem 1rem; text-align: center; color: var(--text-secondary);">
        <h3>${favoritesOnly ? 'No starred awards or grants match' : 'No matching awards or grants found'}</h3>
        <p style="margin-top: 0.5rem;">${favoritesOnly ? 'Star an award with the ☆ button to keep it here, or switch back to “All items”.' : 'Try broadening your search terms or clearing some filters.'}</p>
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
  return createSuggestionBox({
    input,
    listbox: document.getElementById('universal-suggestions')!,
    emptyText: 'No matching grant, sponsor, or topic',
    getGroups: query => {
      const items = grantsSuggestions(allGrants);
      const choices = (values: string[]) => values.map(value => ({ label: value, detail: 'Search filter' }));
      const scoped = keywordSuggestions(input.value, GRANTS_KEYWORD_SPECS, {
        sponsor: items.sponsors, audience: choices(['faculty', 'students', 'phd', 'undergrad', 'postdoc']), topic: items.topics,
        category: choices(['government', 'industry', 'foundation', 'society']),
        deadline: choices(['rolling', 'fixed']), status: choices(['all', 'current', 'historical']),
        loc: choices([...new Set(allGrants.flatMap(grant => grant.locations || []))]), favorites: choices(['only'])
      });
      if (scoped) return scoped;
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
  const container = document.getElementById('grants-examples');
  if (!container) return;

  container.innerHTML = DEFAULT_EXAMPLES.map(example => `
    <button type="button" data-search-example="${escapeHtml(example)}">${escapeHtml(example)}</button>
  `).join('');

  container.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-search-example]') : null;
    if (!button) return;
    input.value = button.dataset.searchExample || '';
    render();
    input.focus();
    if (suggestions) suggestions.close();
  });
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
      const favEl = selectById('favorites-select');
      if (favEl) favEl.value = 'all';
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

    const shareBtn = target.closest<HTMLElement>('[data-share-grant]');
    if (shareBtn) {
      const grantId = shareBtn.dataset.shareGrant || '';
      const shareUrl = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(grantId)}#${grantId}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        const label = shareBtn.querySelector<HTMLElement>('span')!;
        const originalText = label.textContent;
        shareBtn.classList.add('is-copied');
        label.textContent = 'Copied!';
        window.setTimeout(() => {
          shareBtn.classList.remove('is-copied');
          label.textContent = originalText;
        }, 1800);
      });
      window.location.hash = grantId;
    }
  });

  // Filter change listeners
  ['sort-select', 'favorites-select'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      render();
    });
  });

  // Slash key to focus search
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
}

function restoreFilters() {
  input.value = restoreKeywordQuery(params, { audience: 'audience', sponsor: 'category', topic: 'topic', deadline: 'deadline', status: 'status' });
  const sort = params.get('sort');
  const sortSelect = selectById('sort-select')!;
  if (sort && [...sortSelect.options].some(option => option.value === sort)) sortSelect.value = sort;
}

async function init() {
  try {
    allGrants = await loadGrantsData();
    document.getElementById('favorites-filter')!.innerHTML = favoritesSelect(params.get('favorites') === 'only' ? 'only' : 'all', favorites.all().length);
    restoreFilters();
    suggestions = buildSuggestions();

    input.disabled = false;
    input.placeholder = 'Search awards or use keywords: sponsor: NSF audience: phd';
    input.addEventListener('input', () => {
      suggestions!.render(input.value);
      render();
    });

    mountKeywordHelp(input, GRANTS_KEYWORD_SPECS, 'grants-search-help', 'audience: phd category: industry topic: AI');
    wireFavoriteToggles(resultsContainer, favorites);
    onFavoriteChange(resultsContainer, favorites, render);
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
