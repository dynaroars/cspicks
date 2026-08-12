import { loadData, publicationMatchesConferenceSet, schoolAliases } from './data.js';
import { createFilterBar } from './filters.js';
import { initAnalysis, refreshAnalysis, setAnalysisTarget } from './analysis.js';
import { areaLabels, cleanName, escapeHtml, getInstitutionShortName } from './shared.js';
import { buildPriorPeriodData } from './metrics.js';
import { renderProfessorCard as renderProfessorCardView, renderSchoolCard as renderSchoolCardView } from './search-cards.js';
import { clearSearchSections, initSearchResults, searchAreaPeople, searchProfessorByAffiliation, searchProfessors, searchSchools, showDefaultRankings } from './search-results.js';
import { createDblpAuthorSearch } from './dblp-search-ui.js';
import { activeComparisonType, hideComparison, initComparison, isComparing, renderComparison, resolveComparison } from './comparison.js';
import { createSearchSuggestionBox } from './search-suggestions.js';
import { initTooltipPositioning } from './tooltip-position.js';
import { SITE_NAME, updatePageMeta } from './seo.js';
import { mountShareButton } from './share.js';
import { trackComparison, trackShare, trackView } from './analytics.js';

let rawData = null;
let appData = { professors: {}, schools: {} };
let priorAppData = { professors: {}, schools: {} };
let filters = null;
let selectedAnalysisTarget = null;

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

async function init() {
  const shareButton = mountShareButton('#page-share-mount', { getUrl: () => window.location.href, label: '', className: 'icon-link' });
  shareButton?.addEventListener('click', () => trackShare('search'), { capture: true });
  filters = createFilterBar('#filter-bar', {
    label: 'Search filters',
    // Per-faculty ordering only means something for the ranking lists this page
    // shows, so it is opted into here rather than offered on every page.
    fields: ['region', 'years', 'confSet', 'rankings', 'history', 'percapita'],
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
    rawData = await loadData();
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
      showDefaultRankings();
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
  const trimmed = (query || '').trim();
  if (!trimmed) {
    updatePageMeta({ title: `${SITE_NAME} - Find the Right CS PhD Program and Advisor` });
    trackView('default');
    return;
  }
  if (isComparing()) {
    updatePageMeta({
      title: `${trimmed} - ${SITE_NAME}`,
      description: `Head-to-head comparison: ${trimmed}. Publication trends, research strengths, and rank breakdowns on CS Picks.`
    });
    trackComparison(activeComparisonType());
    return;
  }
  if (selectedAnalysisTarget) {
    const name = selectedAnalysisTarget.type === 'researcher' ? cleanName(selectedAnalysisTarget.name) : selectedAnalysisTarget.name;
    const kind = selectedAnalysisTarget.type === 'researcher' ? 'professor profile' : 'university research profile';
    updatePageMeta({
      title: `${name} - ${SITE_NAME}`,
      description: `${name} ${kind} on CS Picks: publication trends, research strengths, and rankings from open academic data.`
    });
    trackView(selectedAnalysisTarget.type);
    return;
  }
  updatePageMeta({
    title: `${trimmed} - ${SITE_NAME}`,
    description: `CS Picks results for "${trimmed}": universities, professors, and research areas from open academic data.`
  });
  trackView('search-results');
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
    showDefaultRankings();
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
      showDefaultRankings();
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
      mainSearch.value = exampleButton.dataset.searchExample;
      mainSearch.dispatchEvent(new Event('input', { bubbles: true }));
      mainSearch.focus();
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

function renderSearchExamples() {
  const fixedContainer = document.getElementById('search-example-fixed');
  const container = document.getElementById('search-example-items');
  if (!container || !fixedContainer || !rawData || !appData) return;

  const sample = (items, count) => {
    const available = [...items];
    for (let index = available.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [available[index], available[swapIndex]] = [available[swapIndex], available[index]];
    }
    return available.slice(0, count);
  };

  const schools = Object.values(appData.schools).filter(school => school.name);
  const schoolsInRegion = region => schools.filter(school => {
    const metadata = rawData.schools[school.name];
    if (!metadata) return false;
    if (region === 'us') return metadata.country === 'us';
    return metadata.region === region;
  });
  const universityExamples = [];
  const addUniversity = (school, label = null) => {
    if (!school || universityExamples.some(item => item.query === school.name)) return;
    universityExamples.push({
      label: label || getInstitutionShortName(school.name),
      query: school.name
    });
  };

  // One short row of examples: two universities, a professor, an area, a venue
  // and a single comparison.
  if (filters.region === 'world') {
    sample(['us', 'europe', 'asia', 'australasia'], 2).forEach(region => {
      addUniversity(sample(schoolsInRegion(region), 1)[0]);
    });
  } else {
    sample(schools, 2).forEach(school => addUniversity(school));
  }

  const rankedProfessors = Object.values(appData.professors)
    .filter(professor => professor.totalAdjusted > 0);
  const facultyExamples = sample(rankedProfessors, 1)
    .map(professor => ({ label: cleanName(professor.name), query: professor.name }));

  const areaExamples = sample(Object.values(areaLabels), 1)
    .map(label => ({ label, query: label }));
  const familiarConferences = ['pldi', 'nips', 'icml', 'cvpr', 'sigcomm', 'sosp', 'chi', 'sigmod', 'fse', 'icse']
    .filter(area => publicationMatchesConferenceSet({ area }, filters.confSet));
  const conferenceExamples = sample(familiarConferences, 1).map(area => ({
    label: area === 'nips' ? 'NeurIPS' : area.toUpperCase(),
    query: area === 'nips' ? 'NeurIPS' : area.toUpperCase()
  }));

  // "A vs B" runs a head-to-head comparison, so advertise it with real pairs of each kind.
  const comparisonExamples = (items, pairCount) => {
    const pool = sample(items, pairCount * 2);
    const pairs = [];
    for (let index = 0; index + 1 < pool.length; index += 2) {
      pairs.push({
        label: `${pool[index].label} vs ${pool[index + 1].label}`,
        query: `${pool[index].query} vs ${pool[index + 1].query}`
      });
    }
    return pairs;
  };
  // Pair schools that have a short name, so the comparison chip stays short
  // enough for the row to hold one line.
  const abbreviated = schools
    .map(school => ({ label: getInstitutionShortName(school.name), query: school.name }))
    .filter(entry => entry.label !== entry.query);
  const schoolPairs = comparisonExamples(abbreviated.length >= 2 ? abbreviated : schools
    .map(school => ({ label: getInstitutionShortName(school.name), query: school.name })), 1);

  // A first-time visitor should see at least one example of every kind of
  // query CS Picks supports (an area, a university, a head-to-head
  // comparison) rather than depend entirely on the random draw above. These
  // are only shown when the school actually exists under the current
  // region/filters, so a chip never lands on an empty result.
  const hasSchool = name => Boolean(appData.schools[name]);
  const curated = [
    { label: 'Software Engineering', query: 'Software Engineering' },
    { label: 'Programming Languages', query: 'Programming Languages' },
    { label: 'AI / ML', query: 'AI' },
    hasSchool('George Mason University') && { label: 'George Mason University', query: 'George Mason University' },
    (hasSchool('Carnegie Mellon University') && hasSchool('Univ. of Illinois at Urbana-Champaign'))
      && { label: 'CMU vs UIUC', query: 'Carnegie Mellon University vs Univ. of Illinois at Urbana-Champaign' }
  ].filter(Boolean);
  fixedContainer.innerHTML = '<span>Examples:</span>';
  container.innerHTML = [...curated, ...universityExamples, ...facultyExamples, ...areaExamples, ...conferenceExamples, ...schoolPairs]
    .filter((item, index, all) => all.findIndex(other => other.query === item.query) === index)
    .slice(0, 8)
    .map(item => `<button type="button" data-search-example="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>`)
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


function clearMainResults() {
  displayIntegratedAnalysis(null);
  hideComparison();
  clearSearchSections();
}






function setSearchQuery(query) {
  const input = document.getElementById('main-search');
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}



// DBLP URL generation



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
