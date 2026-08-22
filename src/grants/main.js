/**
 * CS Awards & Grants Main Controller
 */
import { loadGrantsData, filterGrants, grantsSuggestions } from './grants-data.js';
import { renderGrantCard } from './grants-render.js';
import { createSuggestionBox, rankSuggestions } from '../suggestion-box.js';
import { SITE_NAME, updatePageMeta } from '../seo.js';
import { trackView } from '../analytics.js';
import { escapeHtml } from '../shared.js';

const params = new URLSearchParams(window.location.search);
const input = document.getElementById('grants-search');
const resultsContainer = document.getElementById('grants-results');
const statusText = document.getElementById('grants-status');
const countElement = document.getElementById('grants-count');

let allGrants = [];
let suggestions = null;

const DEFAULT_EXAMPLES = [
  'NSF CAREER',
  'Google PhD Fellowship',
  'DARPA YFA',
  'Amazon Research Awards',
  'Sloan Research Fellowship',
  'AI/ML',
  'Cybersecurity',
  'PhD Students',
  'Early-Career Faculty'
];

function getFilterState() {
  return {
    query: input ? input.value.trim() : '',
    audience: document.getElementById('audience-select')?.value || 'all',
    sponsorCategory: document.getElementById('sponsor-category-select')?.value || 'all',
    topic: document.getElementById('topic-select')?.value || 'all',
    deadlineFilter: document.getElementById('deadline-select')?.value || 'all',
    sortBy: document.getElementById('sort-select')?.value || 'featured'
  };
}

function updateUrl(filterState) {
  const next = new URLSearchParams();
  if (filterState.query) next.set('q', filterState.query);
  if (filterState.audience !== 'all') next.set('audience', filterState.audience);
  if (filterState.sponsorCategory !== 'all') next.set('sponsor', filterState.sponsorCategory);
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
    const button = event.target.closest('[data-search-example]');
    if (!button) return;
    input.value = button.dataset.searchExample;
    render();
    input.focus();
    if (suggestions) suggestions.close();
  });
}

function setupDelegatedListeners() {
  // Topic clicks and sponsor clicks on cards
  resultsContainer.addEventListener('click', event => {
    const topicBtn = event.target.closest('[data-search-topic]');
    if (topicBtn) {
      input.value = topicBtn.dataset.searchTopic;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const sponsorBtn = event.target.closest('[data-search-sponsor]');
    if (sponsorBtn) {
      input.value = sponsorBtn.dataset.searchSponsor;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const shareBtn = event.target.closest('[data-share-grant]');
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
  ['audience-select', 'sponsor-category-select', 'topic-select', 'deadline-select', 'sort-select'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      render();
    });
  });
}

function populateFilterOptions(grants) {
  const topicSelect = document.getElementById('topic-select');
  if (topicSelect) {
    const allTopics = new Set();
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
    const audEl = document.getElementById('audience-select');
    if (audEl) audEl.value = params.get('audience');
  }
  if (params.get('sponsor')) {
    const sponEl = document.getElementById('sponsor-category-select');
    if (sponEl) sponEl.value = params.get('sponsor');
  }
  if (params.get('topic')) {
    const topEl = document.getElementById('topic-select');
    if (topEl) topEl.value = params.get('topic');
  }
  if (params.get('deadline')) {
    const dEl = document.getElementById('deadline-select');
    if (dEl) dEl.value = params.get('deadline');
  }
  if (params.get('sort')) {
    const sEl = document.getElementById('sort-select');
    if (sEl) sEl.value = params.get('sort');
  }
}

async function init() {
  try {
    allGrants = await loadGrantsData();
    populateFilterOptions(allGrants);
    suggestions = buildSuggestions();

    input.disabled = false;
    input.placeholder = 'Search awards, sponsors, topics, or eligibility (e.g. NSF CAREER, Google PhD, DARPA)...';
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
