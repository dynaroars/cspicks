import { loadData, publicationMatchesConferenceSet, schoolAliases } from './data.js';
import { createFilterBar } from './filters.js';
import { initAnalysis, refreshAnalysis, setAnalysisTarget } from './analysis.js';
import { areaLabels, cleanName, escapeHtml, getInstitutionShortName } from './shared.js';
import { applyPerCapitaRanks, buildPriorPeriodData, calculateDiscoveryInsights, calculateSubfieldDiscoveries } from './metrics.js';
import { renderProfessorCard as renderProfessorCardView, renderSchoolCard as renderSchoolCardView } from './search-cards.js';
import { clearSearchSections, initSearchResults, searchAreaPeople, searchProfessorByAffiliation, searchProfessors, searchSchools, showDefaultRankings } from './search-results.js';
import { createDblpAuthorSearch } from './dblp-search-ui.js';
import { activeComparisonType, hideComparison, initComparison, isComparing, renderComparison, resolveComparison } from './comparison.js';
import { createSearchSuggestionBox } from './search-suggestions.js';
import { initTooltipPositioning } from './tooltip-position.js';
import { SITE_NAME, updatePageMeta } from './seo.js';
import { trackComparison, trackView } from './analytics.js';
import { aoeDeadline, filterSchedule, formatCalendarDate } from '../csconfs/schedule-data.js';

let rawData = null;
let appData = { professors: {}, schools: {} };
let priorAppData = { professors: {}, schools: {} };
let filters = null;
let selectedAnalysisTarget = null;
let nsfData = null;
let conferenceSchedule = [];
// Discoveries' cards (and the NSF fetch they need) are dead weight on every
// plain Search visit, so they're loaded as a separate chunk only when the
// page was actually reached via the Discoveries nav link, not statically
// imported here.
let discoveriesApi = null;

function getCardContext() {
  return {
    appData,
    rawData,
    historyMap: filters.historyMap,
    aliasMap: filters.aliasMap,
    historicalMode: filters.historical,
    startYear: filters.startYear,
    endYear: filters.endYear,
    confSet: filters.confSet,
    showRankings: filters.rankings,
    currentQuery: document.getElementById('main-search')?.value.toLowerCase().trim() || ''
  };
}

const searchDBLPAuthors = createDblpAuthorSearch(getCardContext);

function renderProfessorCard(professor, options = {}) {
  return renderProfessorCardView(professor, { ...getCardContext(), ...options });
}

function renderSchoolCard(school, filterArea = null, options = {}) {
  return renderSchoolCardView(school, filterArea, { ...getCardContext(), ...options });
}

const params = new URLSearchParams(window.location.search);
const isDiscoveries = params.get('view') === 'discoveries';

function updateNavActive() {
  const searchLink = document.getElementById('nav-search');
  const discoveriesLink = document.getElementById('nav-discoveries');
  searchLink.classList.toggle('active', !isDiscoveries);
  discoveriesLink.classList.toggle('active', isDiscoveries);
  if (isDiscoveries) {
    searchLink.removeAttribute('aria-current');
    discoveriesLink.setAttribute('aria-current', 'page');
  } else {
    discoveriesLink.removeAttribute('aria-current');
    searchLink.setAttribute('aria-current', 'page');
  }
}

async function init() {
  updateNavActive();

  // Kick off the fetch immediately (in parallel with filter-bar setup and
  // loadData() below) so awaiting it later costs nothing extra - only its
  // own network/parse time, not a serialized extra round trip.
  const discoveriesModulePromise = isDiscoveries ? import('./discoveries.js') : null;

  filters = createFilterBar('#filter-bar', {
    label: 'Search filters',
    // Per-faculty ordering only means something for the ranking lists this page
    // shows, so it is opted into here rather than offered on every page.
    fields: ['region', 'years', 'rankings', 'history', 'percapita', 'confSet'],
    params,
    onChange: () => {
      refreshData();
      updateURL();
    }
  });

  initComparison({
    get appData() { return appData; },
    get priorAppData() { return priorAppData; },
    resolveTarget: resolveAnalysisTarget
  });
  initSearchResults({
    get appData() { return appData; },
    get filters() { return filters; },
    renderProfessorCard,
    renderSchoolCard,
    displayIntegratedAnalysis,
    updateURL,
    hideComparison
  });
  setupSearch();
  setupTooltips();
  initTooltipPositioning();

  try {
    const schedulePromise = fetch('./csconfs/data/conferences.json')
      .then(response => response.ok ? response.json() : [])
      .catch(error => {
        console.warn('Conference schedule examples could not be loaded:', error);
        return [];
      });

    if (isDiscoveries) {
      discoveriesApi = await discoveriesModulePromise;
      discoveriesApi.setupCardSharing(filters);
      const [loadedData, loadedNsfData, loadedSchedule] = await Promise.all([loadData(), discoveriesApi.fetchDiscoveriesNsfData(), schedulePromise]);
      rawData = loadedData;
      nsfData = loadedNsfData;
      conferenceSchedule = loadedSchedule;
    } else {
      const [loadedData, loadedSchedule] = await Promise.all([loadData(), schedulePromise]);
      rawData = loadedData;
      conferenceSchedule = loadedSchedule;
    }
    await filters.ready();

    appData = filters.apply(rawData);
    updatePriorData();
    renderSearchExamples();
    await initAnalysis(rawData, filters);

    const searchInput = document.getElementById('main-search');
    searchInput.placeholder = "Search professors, universities, areas (e.g., graphics), or conferences (e.g., PLDI)";
    searchInput.disabled = false;

    if (params.has('q')) {
      searchInput.value = params.get('q');
      document.body.classList.add('has-search-query');
      const comparing = runQuery(params.get('q'));
      const linkedTargetName = params.get('target');
      const linkedTargetType = params.get('targetType');
      const linkedTargetExists = linkedTargetType === 'school'
        ? Boolean(rawData.schools[linkedTargetName])
        : linkedTargetType === 'researcher' && Boolean(rawData.professors[linkedTargetName]);
      if (linkedTargetExists && !comparing) displayIntegratedAnalysis({ type: linkedTargetType, name: linkedTargetName });
      // A shared link's title/description have to be right on first paint,
      // not only after the next interaction - updateURL() is what normally
      // triggers this, but nothing here calls it (the URL is already correct).
      updateSeoForCurrentView(params.get('q'));
    } else {
      showLandingState();
      // Only meaningful right after the initial render - a card's #fragment
      // link should land on that card once, not re-scroll on every later
      // filter change that re-renders the grid.
      if (isDiscoveries) discoveriesApi.scrollToHashDiscovery();
    }

    searchInput.focus();
  } catch (err) {
    console.error('Failed to load data:', err);
    document.querySelector('main').innerHTML = '<p class="load-error">Error loading data. Please try again.</p>';
  }
}

function saveExpandedCards() {
  const expandedCards = new Set();
  document.querySelectorAll('.card:not(.collapsed)').forEach(card => {
    const nameAttr = card.getAttribute('data-name');
    if (nameAttr) {
      expandedCards.add(nameAttr);
    } else {
      const header = card.querySelector('.card-header h2, .card-header h3');
      if (header) {
        const fullText = header.textContent.trim();
        const nameOnly = fullText.split('#')[0].trim();
        expandedCards.add(nameOnly);
      }
    }
  });
  return expandedCards;
}

function restoreExpandedCards(expandedCards) {
  document.querySelectorAll('.card').forEach(card => {
    const nameAttr = card.getAttribute('data-name');
    const header = card.querySelector('.card-header h2, .card-header h3');

    let shouldExpand = false;
    if (nameAttr && expandedCards.has(nameAttr)) {
      shouldExpand = true;
    } else if (header) {
      const fullText = header.textContent.trim();
      const nameOnly = fullText.split('#')[0].trim();
      if (expandedCards.has(nameOnly)) {
        shouldExpand = true;
      }
    }

    if (shouldExpand) {
      card.classList.add('no-transition');
      card.classList.remove('collapsed');
      card.offsetHeight;
      card.classList.remove('no-transition');
    }
  });
}

function updateURL() {
  const params = filters.toParams();

  if (isDiscoveries) params.set('view', 'discoveries');
  const q = document.getElementById('main-search').value;
  if (q) params.set('q', q);
  if (selectedAnalysisTarget) {
    params.set('target', selectedAnalysisTarget.name);
    params.set('targetType', selectedAnalysisTarget.type);
  }

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
  updateSeoForCurrentView(q);
}

// Keeps <title>/description/canonical honest about what's on screen, so a
// copied link previews the actual view rather than the generic homepage -
// every call site that reproduces the URL (updateURL) reproduces the title too.
function updateSeoForCurrentView(query) {
  const page = isDiscoveries ? 'discoveries' : 'search';
  const trimmed = (query || '').trim();
  if (!trimmed) {
    // The filter bar isn't disabled during the initial load, so this can in
    // principle fire before the lazy-loaded discoveries chunk resolves -
    // skip the meta update rather than reading off a still-null module.
    if (isDiscoveries && discoveriesApi) updatePageMeta(discoveriesApi.getDiscoveriesMeta(filters));
    else if (!isDiscoveries) updatePageMeta({ title: `${SITE_NAME} - Find the Right CS PhD Program and Advisor` });
    trackView('default', page);
    return;
  }
  if (isComparing()) {
    updatePageMeta({
      title: `${trimmed} - ${SITE_NAME}`,
      description: `Head-to-head comparison: ${trimmed}. Publication trends, research strengths, and rank breakdowns on CS Picks.`
    });
    trackComparison(activeComparisonType(), page);
    return;
  }
  if (selectedAnalysisTarget) {
    const name = selectedAnalysisTarget.type === 'researcher' ? cleanName(selectedAnalysisTarget.name) : selectedAnalysisTarget.name;
    const kind = selectedAnalysisTarget.type === 'researcher' ? 'professor profile' : 'university research profile';
    updatePageMeta({
      title: `${name} - ${SITE_NAME}`,
      description: `${name} ${kind} on CS Picks: publication trends, research strengths, and rankings from open academic data.`
    });
    trackView(selectedAnalysisTarget.type, page);
    return;
  }
  updatePageMeta({
    title: `${trimmed} - ${SITE_NAME}`,
    description: `CS Picks results for "${trimmed}": universities, professors, and research areas from open academic data.`
  });
  trackView('search-results', page);
}

// Search's empty-query landing browses every university and professor;
// Discoveries uses the same shell but shows the insight-card grid where
// those lists would go instead.
function showLandingState() {
  if (isDiscoveries) {
    displayIntegratedAnalysis(null);
    hideComparison();
    clearSearchSections();
    document.getElementById('discovery-stats').hidden = false;
    discoveriesApi.renderDiscoveries(rawData, filters, nsfData);
  } else {
    showDefaultRankings();
  }
}

// A real search (or comparison, or clicking into a card's analysis) replaces
// the Discoveries landing grid the same way it replaces Search's default
// rankings - this just also needs to hide the card grid first.
function hideDiscoveryCards() {
  if (isDiscoveries) document.getElementById('discovery-stats').hidden = true;
}

function refreshData() {
  if (!rawData) return;

  const expandedCards = saveExpandedCards();

  appData = filters.apply(rawData);
  updatePriorData();
  renderSearchExamples();

  // Re-run current search
  const query = document.getElementById('main-search').value;
  if (query.length >= 2) {
    runQuery(query);
  } else {
    showLandingState();
  }

  refreshAnalysis();

  // Restore expanded state immediately
  requestAnimationFrame(() => {
    restoreExpandedCards(expandedCards);
  });
}

function updatePriorData() {
  priorAppData = buildPriorPeriodData(
    rawData,
    filters.startYear,
    filters.endYear,
    filters.region,
    filters.historyMap,
    filters.aliasMap,
    filters.confSet
  );
  if (filters.perCapita) {
    applyPerCapitaRanks(priorAppData);
  }
}

function setupSearch() {
  const mainSearch = document.getElementById('main-search');
  const suggestionBox = createSearchSuggestionBox({
    input: mainSearch,
    listbox: document.getElementById('universal-suggestions'),
    getContext: () => ({ appData: rawData ? appData : null, confSet: filters.confSet }),
    onSelect: (item, comparePrefix) => {
      mainSearch.value = `${comparePrefix}${item.label}`;

      if (comparePrefix) {
        document.body.classList.add('has-search-query');
        runQuery(mainSearch.value, { includeDblp: false });
        updateURL();
        return;
      }

      hideDiscoveryCards();
      const query = item.value.toLowerCase();
      searchProfessors(query);
      searchSchools(query);
      searchAreaPeople(query);
      document.getElementById('dblp-results').innerHTML = '';
      displayIntegratedAnalysis(item.target || null);
      updateURL();
    }
  });

  let debounceTimer;
  mainSearch.addEventListener('input', event => {
    clearTimeout(debounceTimer);
    const rawQuery = event.target.value;

    displayIntegratedAnalysis(null);
    updateURL();
    document.body.classList.toggle('has-search-query', Boolean(rawQuery.trim()));
    suggestionBox.render(rawQuery);

    if (rawQuery.length < 2) {
      showLandingState();
      return;
    }

    debounceTimer = setTimeout(() => {
      runQuery(rawQuery);
      updateURL();
    }, 300);
  });

  document.querySelector('.search-examples')?.addEventListener('click', event => {
    const exampleButton = event.target.closest('[data-search-example]');
    if (exampleButton) {
      clearTimeout(debounceTimer);
      const query = exampleButton.dataset.searchExample;
      mainSearch.value = query;
      document.body.classList.add('has-search-query');
      displayIntegratedAnalysis(null);
      runQuery(query);
      updateURL();
      mainSearch.focus();
      // Focusing a populated search normally opens autocomplete. An example is
      // already a complete query, so keep focus for easy editing but do not put
      // a redundant suggestion menu over its results.
      suggestionBox.close();
    }
  });

  document.querySelector('main')?.addEventListener('click', event => {
    const searchAction = event.target.closest('[data-action="search-query"]');
    if (searchAction) setSearchQuery(searchAction.dataset.query);
    const professorAction = event.target.closest('[data-action="professor-at-school"]');
    if (professorAction) searchProfessorByAffiliation(professorAction.dataset.professorName, professorAction.dataset.affiliation);
    const cardAction = event.target.closest('[data-action="open-target"]');
    if (cardAction) {
      cardAction.closest('.card')?.classList.toggle('collapsed');
      showIntegratedAnalysis(cardAction.dataset.targetType, cardAction.dataset.targetName);
    }
    const toggleAction = event.target.closest('[data-action="toggle-card"]');
    if (toggleAction) toggleAction.closest('.card')?.classList.toggle('collapsed');
    const papersAction = event.target.closest('[data-action="toggle-papers"]');
    if (papersAction) {
      const list = papersAction.nextElementSibling;
      list?.classList.toggle('visible');
      papersAction.textContent = list?.classList.contains('visible') ? '▼ Hide Papers' : '▶ Show Papers';
    }
  });
}

// Shared by the example chips and the "Applying for a CS PhD?" callout, both
// of which pick a fresh, random handful of real areas/schools each render.
function sample(items, count) {
  const available = [...items];
  for (let index = available.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [available[index], available[swapIndex]] = [available[swapIndex], available[index]];
  }
  return available.slice(0, count);
}

function discoveryExampleItems() {
  const examples = [];
  const insights = calculateDiscoveryInsights(appData, priorAppData);
  const subfields = calculateSubfieldDiscoveries(appData, priorAppData);
  const short = name => getInstitutionShortName(name);
  const discoveryHref = cardId => {
    const params = filters.toParams();
    params.set('view', 'discoveries');
    return `index.html?${params.toString()}#${cardId}`;
  };
  const add = (label, cardId, title) => examples.push({ label, href: discoveryHref(cardId), title });

  sample(insights.rankClimbers, 1).forEach(item => {
    add(`${short(item.name)} rose ${item.metrics.rankDelta} spots`, 'discovery-biggest-rank-gains', 'View this rank-gain discovery');
  });
  sample(insights.momentum, 1).forEach(item => {
    add(`${short(item.name)} grew ${item.metrics.growth.toFixed(0)}%`, 'discovery-fastest-growing-output', 'View this growth discovery');
  });
  sample(insights.areaBreakouts, 1).forEach(item => {
    const area = areaLabels[item.area] || item.area;
    add(`${area} is rising at ${short(item.name)}`, 'discovery-fastest-growing-research-areas', 'View this research-area discovery');
  });
  sample(subfields.growth, 1).forEach(item => {
    const area = areaLabels[item.area] || item.area;
    add(`${area} grew ${item.growth.toFixed(0)}%`, 'discovery-fastest-growing-subfields', 'View this subfield discovery');
  });
  return examples;
}

function findAreaQuery(query) {
  const normalized = query.trim().toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  return Object.entries(areaLabels).find(([key, label]) => {
    const labelCompact = label.toLowerCase().replace(/[^a-z0-9]/g, '');
    const words = normalized.split(/[^a-z0-9]+/).filter(word => word.length >= 4);
    return compact === key || labelCompact.includes(compact) || compact.includes(labelCompact)
      || words.some(word => label.toLowerCase().includes(word));
  })?.[0] || null;
}

function deadlineExampleItems(query) {
  if (!query.trim() || conferenceSchedule.length === 0) return [];
  const areaQuery = findAreaQuery(query);
  const scheduleQuery = areaQuery || query;
  const groups = filterSchedule(conferenceSchedule, {
    startYear: new Date().getFullYear(),
    endYear: new Date().getFullYear() + 1,
    confSet: filters.confSet,
    query: scheduleQuery,
    upcomingOnly: true
  });
  const deadlines = groups.map(group => {
    const deadline = group
      .map(conference => ({ conference, instant: aoeDeadline(conference.deadline) }))
      .filter(item => item.instant !== null && item.instant >= Date.now())
      .sort((a, b) => a.instant - b.instant)[0];
    return deadline ? { group, deadline } : null;
  }).filter(Boolean);

  return sample(deadlines, 2).map(({ group, deadline }) => {
    const name = group[0].name;
    const label = `${name} deadline ${formatCalendarDate(deadline.conference.deadline)}`;
    const targetQuery = areaQuery ? (areaLabels[areaQuery] || areaQuery) : name;
    return {
      label,
      href: `csconfs.html?q=${encodeURIComponent(targetQuery)}`,
      title: `View ${name} deadlines in CS Confs`
    };
  });
}

function renderSearchExamples() {
  const fixedContainer = document.getElementById('search-example-fixed');
  const container = document.getElementById('search-example-items');
  if (!container || !fixedContainer || !rawData || !appData) return;

  // One randomized example of each kind of query the search box accepts, so
  // the row demonstrates the whole vocabulary and stays fresh on every reload.
  const schools = Object.values(appData.schools).filter(school => school.name);
  const asSchool = school => ({ label: getInstitutionShortName(school.name), query: school.name });
  const rankedProfessors = Object.values(appData.professors)
    .filter(professor => professor.totalAdjusted > 0);
  const asProfessor = professor => ({ label: cleanName(professor.name), query: professor.name });

  const pair = items => {
    const [a, b] = sample(items, 2);
    return a && b ? [{ label: `${a.label} vs ${b.label}`, query: `${a.query} vs ${b.query}` }] : [];
  };
  // Prefer schools with a short name so a comparison chip stays on one line.
  const abbreviated = schools.map(asSchool).filter(entry => entry.label !== entry.query);

  const conferenceLabel = area => (area === 'nips' ? 'NeurIPS' : area.toUpperCase());
  const familiarConferences = ['pldi', 'nips', 'icml', 'cvpr', 'sigcomm', 'sosp', 'chi', 'sigmod', 'fse', 'icse']
    .filter(area => publicationMatchesConferenceSet({ area }, filters.confSet))
    .map(area => ({ label: conferenceLabel(area), query: conferenceLabel(area) }));
  const areaItems = Object.values(areaLabels).map(label => ({ label, query: label }));

  const examples = [
    ...sample(areaItems, 1),
    ...sample(schools, 1).map(asSchool),
    ...sample(rankedProfessors, 1).map(asProfessor),
    ...sample(familiarConferences, 1),
    ...pair(areaItems),
    ...pair(abbreviated.length >= 2 ? abbreviated : schools.map(asSchool)),
    ...pair(rankedProfessors.map(asProfessor)),
    ...pair(familiarConferences)
  ];

  const query = document.getElementById('main-search')?.value.trim() || '';
  const contextualItems = [
    ...sample(discoveryExampleItems(), 2),
    ...(query.length >= 2 ? deadlineExampleItems(query) : [])
  ];

  fixedContainer.innerHTML = '<span>Try:</span>';
  container.innerHTML = [...examples, ...contextualItems]
    .filter((item, index, all) => {
      const key = item.href || item.query;
      return all.findIndex(other => (other.href || other.query) === key) === index;
    })
    .map(item => item.href
      ? `<a class="search-example-link" href="${escapeHtml(item.href)}" title="${escapeHtml(item.title || item.label)}">${escapeHtml(item.label)}</a>`
      : `<button type="button" data-search-example="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>`)
    .join('');
}

function resolveAnalysisTarget(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized || !appData) return null;

  const canonicalSchool = schoolAliases[normalized] || normalized;
  const school = Object.values(appData.schools).find(candidate =>
    candidate.name.toLowerCase() === canonicalSchool.toLowerCase()
  );
  if (school) return { type: 'school', name: school.name };

  const exactResearchers = Object.values(appData.professors).filter(professor =>
    professor.name.toLowerCase() === normalized
      || cleanName(professor.name).toLowerCase() === normalized
      || (professor.aliases || []).some(alias => alias.toLowerCase() === normalized || cleanName(alias).toLowerCase() === normalized)
  );
  return exactResearchers.length === 1
    ? { type: 'researcher', name: exactResearchers[0].name }
    : null;
}

function displayIntegratedAnalysis(target) {
  selectedAnalysisTarget = target ? { type: target.type, name: target.name } : null;
  document.body.classList.toggle('has-analysis-target', Boolean(target));
  setAnalysisTarget(selectedAnalysisTarget);
}

function updateIntegratedAnalysis(query) {
  displayIntegratedAnalysis(resolveAnalysisTarget(query));
}







// Runs a query through either the comparison view or the regular search
// sections. Returns true when the query was handled as a comparison.
function runQuery(query, { includeDblp = true } = {}) {
  hideDiscoveryCards();
  // Fresh suggestions for each search rather than the set drawn at page load.
  renderSearchExamples();
  const comparison = resolveComparison(query);
  if (comparison) {
    clearSearchSections();
    displayIntegratedAnalysis(null);
    renderComparison(comparison);
    return true;
  }

  hideComparison();
  document.body.classList.remove('showing-rankings');
  const normalized = query.toLowerCase();
  searchProfessors(normalized);
  searchSchools(normalized);
  searchAreaPeople(normalized);
  if (includeDblp) searchDBLPAuthors(normalized);
  else document.getElementById('dblp-results').innerHTML = '';
  updateIntegratedAnalysis(normalized);
  return false;
}

function showIntegratedAnalysis(type, name) {
  hideDiscoveryCards();
  const input = document.getElementById('main-search');
  input.value = type === 'researcher' ? cleanName(name) : name;
  document.body.classList.add('has-search-query');
  hideComparison();
  const query = name.toLowerCase();
  searchProfessors(query);
  searchSchools(query);
  searchAreaPeople(query);
  document.getElementById('dblp-results').innerHTML = '';
  displayIntegratedAnalysis({ type, name });
  updateURL();
}


function setSearchQuery(query) {
  const input = document.getElementById('main-search');
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function setupTooltips() {
  // Create global tooltip element
  let tooltip = document.getElementById('global-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'global-tooltip';
    document.body.appendChild(tooltip);
  }

  // Use event delegation for dynamic elements
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.year-column');
    if (target) {
      const text = target.getAttribute('data-tooltip');
      if (text) {
        // Replace comma with newline for better readability
        tooltip.textContent = text.replace(': ', ':\n');
        tooltip.style.display = 'block';
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (tooltip.style.display === 'block') {
      // Position slightly offset from cursor
      const x = e.clientX + 15;
      const y = e.clientY + 15;

      // Prevent going off screen
      const rect = tooltip.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 20;
      const maxY = window.innerHeight - rect.height - 20;

      tooltip.style.left = `${Math.min(x, maxX)}px`;
      tooltip.style.top = `${Math.min(y, maxY)}px`;
    }
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('.year-column');
    if (target) {
      tooltip.style.display = 'none';
    }
  });
}

init();
