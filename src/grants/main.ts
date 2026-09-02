/**
 * CS Awards & Grants Main Controller
 */
import { loadGrantsData, filterGrants, grantsSuggestions } from './grants-data.js';
import { renderGrantCard } from './grants-render.js';
import { createSuggestionBox, rankSuggestions } from '../suggestion-box.js';
import { SITE_NAME, updatePageMeta } from '../seo.js';
import { trackView } from '../analytics.js';
import { escapeHtml } from '../shared.js';
import type { Grant } from '../types.js';

const params = new URLSearchParams(window.location.search);
const input = document.querySelector<HTMLInputElement>('#grants-search')!;
const resultsContainer = document.getElementById('grants-results');
const statusText = document.getElementById('grants-status');
const countElement = document.getElementById('grants-count');

let allGrants: Grant[] = [];
let suggestions = null;
const selectById = (id: string) => document.getElementById(id) as HTMLSelectElement | null;

const DEFAULT_EXAMPLES = [
  'NSF CAREER',
  'NSF GRFP',
  'DOE CSGF',
  'NDSEG',
  'Google PhD Fellowship',
  'DARPA YFA',
  'Space Grant',
  'EPSCoR',
  'Sloan Research Fellowship',
  'AI/ML',
  'PhD Students',
  'Undergraduate'
];

function getFilterState() {
  return {
    query: input ? input.value.trim() : '',
    audience: selectById('audience-select')?.value || 'all',
    sponsorCategory: selectById('sponsor-category-select')?.value || 'all',
    status: selectById('status-select')?.value || 'all',
    topic: selectById('topic-select')?.value || 'all',
    deadlineFilter: selectById('deadline-select')?.value || 'all',
    sortBy: selectById('sort-select')?.value || 'featured'
  };
}

function updateUrl(filterState) {
  const next = new URLSearchParams();
  if (filterState.query) next.set('q', filterState.query);
  if (filterState.audience !== 'all') next.set('audience', filterState.audience);
  if (filterState.sponsorCategory !== 'all') next.set('sponsor', filterState.sponsorCategory);
  if (filterState.status !== 'all') next.set('status', filterState.status);
  if (filterState.topic !== 'all') next.set('topic', filterState.topic);
  if (filterState.deadlineFilter !== 'all') next.set('deadline', filterState.deadlineFilter);
  if (filterState.sortBy !== 'featured') next.set('sort', filterState.sortBy);

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
  const filtered = filterGrants(allGrants, filterState);

  if (!filtered.length) {
    resultsContainer.innerHTML = `
      <div class="universal-suggestion-empty" style="padding: 3rem 1rem; text-align: center; color: var(--text-secondary);">
        <h3>No matching awards or grants found</h3>
        <p style="margin-top: 0.5rem;">Try broadening your search terms or clearing some filters.</p>
        <button type="button" class="btn-secondary" id="reset-grants-filters" style="margin-top: 1rem;">Reset all filters</button>
      </div>
    `;
  } else {
    resultsContainer.innerHTML = filtered.map(renderGrantCard).join('');
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
    listbox: document.getElementById('universal-suggestions'),
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
      if (item.type === 'award' && item.grantId) {
        input.value = item.label;
        render();
        window.location.hash = item.grantId;
        handleHashScroll();
      } else {
        input.value = item.label;
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
    input.value = button.dataset.searchExample;
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
      const audEl = selectById('audience-select');
      const sponEl = selectById('sponsor-category-select');
      const topEl = selectById('topic-select');
      const deadEl = selectById('deadline-select');
      const statusEl = selectById('status-select');
      const sortEl = selectById('sort-select');
      if (audEl) audEl.value = 'all';
      if (sponEl) sponEl.value = 'all';
      if (topEl) topEl.value = 'all';
      if (deadEl) deadEl.value = 'all';
      if (statusEl) statusEl.value = 'all';
      if (sortEl) sortEl.value = 'featured';
      render();
      input.focus();
      return;
    }

    const topicBtn = target.closest<HTMLElement>('[data-search-topic]');
    if (topicBtn) {
      input.value = topicBtn.dataset.searchTopic;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const sponsorBtn = target.closest<HTMLElement>('[data-search-sponsor]');
    if (sponsorBtn) {
      input.value = sponsorBtn.dataset.searchSponsor;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const shareBtn = target.closest<HTMLElement>('[data-share-grant]');
    if (shareBtn) {
      const grantId = shareBtn.dataset.shareGrant;
      const shareUrl = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(grantId)}#${grantId}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        const originalText = shareBtn.querySelector('span').textContent;
        shareBtn.classList.add('is-copied');
        shareBtn.querySelector('span').textContent = 'Copied!';
        window.setTimeout(() => {
          shareBtn.classList.remove('is-copied');
          shareBtn.querySelector('span').textContent = originalText;
        }, 1800);
      });
      window.location.hash = grantId;
    }
  });

  // Filter change listeners
  ['audience-select', 'sponsor-category-select', 'topic-select', 'deadline-select', 'status-select', 'sort-select'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      render();
    });
  });

  // Slash key to focus search
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
}

function populateFilterOptions(grants: Grant[]) {
  const topicSelect = selectById('topic-select');
  if (topicSelect) {
    const allTopics = new Set<string>();
    grants.forEach(g => (g.topics || []).forEach(t => allTopics.add(t)));
    const sortedTopics = Array.from(allTopics).sort();
    sortedTopics.forEach(top => {
      const option = document.createElement('option');
      option.value = top;
      option.textContent = top;
      topicSelect.appendChild(option);
    });
  }

  // Restore initial URL parameters
  if (params.get('q')) input.value = params.get('q');
  if (params.get('audience')) {
    const audEl = selectById('audience-select');
    if (audEl) audEl.value = params.get('audience');
  }
  if (params.get('sponsor')) {
    const sponEl = selectById('sponsor-category-select');
    if (sponEl) sponEl.value = params.get('sponsor');
  }
  if (params.get('topic')) {
    const topEl = selectById('topic-select');
    if (topEl) topEl.value = params.get('topic');
  }
  if (params.get('deadline')) {
    const dEl = selectById('deadline-select');
    if (dEl) dEl.value = params.get('deadline');
  }
  if (params.get('status')) {
    const statusEl = selectById('status-select');
    if (statusEl) statusEl.value = params.get('status');
  }
  if (params.get('sort')) {
    const sEl = selectById('sort-select');
    if (sEl) sEl.value = params.get('sort');
  }
}

async function init() {
  try {
    allGrants = await loadGrantsData();
    populateFilterOptions(allGrants);
    suggestions = buildSuggestions();

    input.disabled = false;
    input.placeholder = 'Search awards, sponsors, topics, states, or eligibility (e.g. Space Grant, EPSCoR, Google PhD)...';
    input.addEventListener('input', () => {
      suggestions.render(input.value);
      render();
    });

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
