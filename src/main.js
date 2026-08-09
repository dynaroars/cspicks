import { loadData, loadAffiliationData, filterByYears, getConferenceAreaMap, getPublicationSchools, normalizeConferenceSet, publicationMatchesConferenceSet, DEFAULT_START_YEAR, DEFAULT_END_YEAR, schoolAliases, conferenceAliases } from './data.js';
import { areaLabels, cleanName, escapeHtml, getConferenceLabel, getInitialRegion, getInstitutionShortName, rememberRegion } from './shared.js';
import { buildPriorPeriodData } from './metrics.js';
import { renderProfessorCard as renderProfessorCardView, renderSchoolCard as renderSchoolCardView } from './search-cards.js';
import { createDblpAuthorSearch } from './dblp-search-ui.js';
import { buildFundingIndex, formatFunding } from './nsf.js';

let rawData = null;
let appData = { professors: {}, schools: {} };
let priorAppData = { professors: {}, schools: {} };
let historyMap = null;  // OpenAlex affiliation history
let aliasMap = null;    // School name aliases

let startYear = DEFAULT_START_YEAR;
let endYear = DEFAULT_END_YEAR;
let selectedRegion = getInitialRegion();
let historicalMode = false;
let confSet = 'csrankings-default';
let selectedAnalysisTarget = null;
let showingAllResults = false;
let fundingDataset = null;
let fundingFaculty = null;
let fundingPromise = null;
let fundingUpdateQueued = false;

function getCardContext() {
  return {
    appData,
    rawData,
    historyMap,
    aliasMap,
    historicalMode,
    startYear,
    endYear,
    confSet,
    fundingFaculty,
    currentQuery: document.getElementById('main-search')?.value.toLowerCase().trim() || ''
  };
}

const searchDBLPAuthors = createDblpAuthorSearch(getCardContext);

function renderProfessorCard(professor) {
  ensureFundingData();
  return renderProfessorCardView(professor, getCardContext());
}

function renderSchoolCard(school, filterArea = null, resultPosition = null) {
  return renderSchoolCardView(school, filterArea, { ...getCardContext(), resultPosition });
}

async function ensureHistoricalData() {
  if (historyMap !== null && aliasMap !== null) return;
  const data = await loadAffiliationData();
  historyMap = data.historyMap;
  aliasMap = data.aliasMap;
}

function updateFacultyFundingStats() {
  document.querySelectorAll('[data-funding-faculty]').forEach(element => {
    const person = fundingFaculty?.get(element.dataset.fundingFaculty);
    const count = person?.awards.length || 0;
    const amount = person?.attributedAmount || 0;
    element.innerHTML = ` · <strong>${count}</strong> NSF ${count === 1 ? 'award' : 'awards'} (<strong>${escapeHtml(formatFunding(amount))}</strong> attributed)`;
  });
}

function scheduleFundingStatsUpdate() {
  if (fundingUpdateQueued) return;
  fundingUpdateQueued = true;
  queueMicrotask(() => {
    fundingUpdateQueued = false;
    updateFacultyFundingStats();
  });
}

function rebuildFundingIndex() {
  if (!fundingDataset) return;
  const funding = buildFundingIndex(fundingDataset, startYear, endYear);
  fundingFaculty = new Map(funding.faculty.map(person => [person.name, person]));
  updateFacultyFundingStats();
}

function ensureFundingData() {
  if (fundingFaculty) {
    scheduleFundingStatsUpdate();
    return Promise.resolve();
  }
  if (fundingPromise) return fundingPromise;
  fundingPromise = fetch('./nsf-awards.json')
    .then(response => {
      if (!response.ok) throw new Error(`NSF dataset returned ${response.status}`);
      return response.json();
    })
    .then(dataset => {
      fundingDataset = dataset;
      rebuildFundingIndex();
    })
    .catch(error => console.error('Failed to load NSF faculty summaries:', error))
    .finally(() => { fundingPromise = null; });
  return fundingPromise;
}


const params = new URLSearchParams(window.location.search);
showingAllResults = params.get('view') === 'all';
if (params.has('start')) startYear = parseInt(params.get('start'));
if (params.has('end')) endYear = parseInt(params.get('end'));
if (params.has('region')) selectedRegion = params.get('region');
if (params.has('historical')) historicalMode = params.get('historical') === 'true';
if (params.has('confSet')) confSet = normalizeConferenceSet(params.get('confSet'));
async function init() {
  setupFilters();
  setupSearch();
  setupTooltips();

  try {
    rawData = await loadData();
    if (historicalMode) await ensureHistoricalData();

    // Initialize toggle checkbox
    const historicalToggle = document.getElementById('historical-mode');
    if (historicalToggle) {
      historicalToggle.checked = historicalMode;

      historicalToggle.addEventListener('change', async () => {
        historicalToggle.disabled = true;
        try {
          if (historicalToggle.checked) await ensureHistoricalData();
          historicalMode = historicalToggle.checked;
          refreshData();
          updateURL();
        } catch (error) {
          console.error('Failed to load historical affiliation data:', error);
          historicalToggle.checked = false;
          historicalMode = false;
          window.alert('Historical affiliation data could not be loaded. Please try again.');
        } finally {
          historicalToggle.disabled = false;
        }
      });
    }

    // Conference Set toggle
    const confSetSelect = document.getElementById('conf-set');
    if (confSetSelect) {
      confSetSelect.value = confSet;
      confSetSelect.addEventListener('change', () => {
        confSet = confSetSelect.value;
        refreshData();
        updateURL();
      });
    }

    // Apply filters
    if (historicalMode && historyMap && aliasMap) {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, historyMap, aliasMap, confSet);
    } else {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, null, null, confSet);
    }
    updatePriorData();
    renderSearchExamples();

    console.log(`Data loaded (${startYear}-${endYear}, region: ${selectedRegion}, historical: ${historicalMode}):`, Object.keys(appData.professors).length, 'professors', Object.keys(appData.schools).length, 'schools');

    const searchInput = document.getElementById('main-search');
    searchInput.placeholder = "Search professors, universities, areas (e.g., graphics), or conferences (e.g., PLDI)";
    searchInput.disabled = false;

    document.getElementById('region-select').value = selectedRegion;

    if (params.has('q')) {
      showingAllResults = false;
      searchInput.value = params.get('q');
      document.body.classList.add('has-search-query');
      const query = params.get('q').toLowerCase();
      searchProfessors(query);
      searchSchools(query);
      searchAreaPeople(query);
      if (!getDistinctionFilter(query)) searchDBLPAuthors(query);
      updateIntegratedAnalysis(query);
      const linkedTargetName = params.get('target');
      const linkedTargetType = params.get('targetType');
      const linkedTargetExists = linkedTargetType === 'school'
        ? Boolean(rawData.schools[linkedTargetName])
        : linkedTargetType === 'researcher' && Boolean(rawData.professors[linkedTargetName]);
      if (linkedTargetExists) displayIntegratedAnalysis({ type: linkedTargetType, name: linkedTargetName });
    } else if (showingAllResults) {
      showDefaultRankings();
    } else {
      clearMainResults();
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
  const params = new URLSearchParams();
  params.set('start', startYear);
  params.set('end', endYear);
  params.set('region', selectedRegion);
  if (historicalMode) params.set('historical', 'true');
  if (confSet !== 'csrankings-default') params.set('confSet', confSet);
  if (showingAllResults) params.set('view', 'all');

  const q = document.getElementById('main-search').value;
  if (q) params.set('q', q);
  if (selectedAnalysisTarget) {
    params.set('target', selectedAnalysisTarget.name);
    params.set('targetType', selectedAnalysisTarget.type);
  }

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

function refreshData() {
  if (!rawData) return;

  const expandedCards = saveExpandedCards();

  appData = filterByYears(rawData, startYear, endYear, selectedRegion, historicalMode ? historyMap : null, historicalMode ? aliasMap : null, confSet);
  fundingFaculty = null;
  if (fundingDataset) rebuildFundingIndex();
  updatePriorData();
  renderSearchExamples();

  console.log(`Refreshed: Region=${selectedRegion}, Years=${startYear}-${endYear}, Historical=${historicalMode}, ConfSet=${confSet}`);

  // Re-run current search
  const query = document.getElementById('main-search').value.toLowerCase();
  if (query.length >= 2) {
    searchProfessors(query);
    searchSchools(query);
    searchAreaPeople(query);
    if (!getDistinctionFilter(query)) searchDBLPAuthors(query);
    else document.getElementById('dblp-results').innerHTML = '';
    updateIntegratedAnalysis(query);
  } else if (showingAllResults) {
    showDefaultRankings();
  } else {
    clearMainResults();
  }

  window.dispatchEvent(new CustomEvent('cspicks:analysis-refresh', {
    detail: { historical: historicalMode }
  }));

  // Restore expanded state immediately
  requestAnimationFrame(() => {
    restoreExpandedCards(expandedCards);
  });
}

function updatePriorData() {
  priorAppData = buildPriorPeriodData(
    rawData,
    startYear,
    endYear,
    selectedRegion,
    historicalMode ? historyMap : null,
    historicalMode ? aliasMap : null,
    confSet
  );
}

function setupSearch() {
  const mainSearch = document.getElementById('main-search');
  const suggestionsEl = document.getElementById('universal-suggestions');
  let suggestions = [];
  let activeSuggestion = -1;

  const closeSuggestions = () => {
    suggestions = [];
    activeSuggestion = -1;
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = '';
    mainSearch.setAttribute('aria-expanded', 'false');
    mainSearch.removeAttribute('aria-activedescendant');
  };

  const scoreMatch = (text, query) => {
    const normalized = text.toLowerCase();
    if (normalized.startsWith(query)) return 0;
    if (normalized.split(/\s+/).some(word => word.startsWith(query))) return 1;
    return normalized.includes(query) ? 2 : Infinity;
  };

  const renderSuggestions = queryValue => {
    if (!rawData || !appData) return closeSuggestions();
    const query = queryValue.trim().toLowerCase();
    if (!query) return closeSuggestions();

    const rank = (items, limit) => items
      .map(item => ({ item, score: scoreMatch(`${item.label} ${item.searchTerms || ''}`, query) }))
      .filter(match => Number.isFinite(match.score))
      .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
      .slice(0, limit)
      .map(match => match.item);

    const aliasesBySchool = new Map();
    Object.entries(schoolAliases).forEach(([alias, school]) => {
      if (!aliasesBySchool.has(school)) aliasesBySchool.set(school, []);
      aliasesBySchool.get(school).push(alias);
    });

    const schools = rank(Object.values(appData.schools).map(school => ({
      kind: 'school',
      label: school.name,
      value: school.name,
      detail: Number.isFinite(school.rank) ? `University · #${school.rank}` : 'University',
      searchTerms: (aliasesBySchool.get(school.name) || []).join(' '),
      target: { type: 'school', name: school.name }
    })), 4);
    const professors = rank(Object.values(appData.professors).map(professor => ({
      kind: 'researcher',
      label: cleanName(professor.name),
      value: professor.name,
      detail: professor.affiliation || 'Professor',
      searchTerms: (professor.aliases || []).join(' '),
      target: { type: 'researcher', name: professor.name }
    })), 4);
    const areas = rank(Object.entries(areaLabels).map(([key, label]) => ({
      kind: 'area', label, value: label, detail: 'Research area', searchTerms: key
    })), 3);
    const conferences = rank(Object.keys(getConferenceAreaMap(confSet))
      .filter(key => publicationMatchesConferenceSet({ area: key }, confSet))
      .map(key => ({
        kind: 'conference', label: getConferenceLabel(key), value: key, detail: 'Conference'
      })), 3);
    const distinctions = rank([
      { kind: 'distinction', label: 'Turing Award', value: 'Turing Award', detail: 'Faculty distinction' },
      { kind: 'distinction', label: 'ACM Fellows', value: 'ACM Fellows', detail: 'Faculty distinction' }
    ], 2);

    const groups = [
      ['Universities', schools],
      ['Professors', professors],
      ['Research areas', areas],
      ['Conferences', conferences],
      ['Distinctions', distinctions]
    ].filter(([, items]) => items.length);
    suggestions = groups.flatMap(([, items]) => items);
    activeSuggestion = -1;

    if (!suggestions.length) {
      suggestionsEl.innerHTML = '<div class="universal-suggestion-empty">No matching CSRankings result</div>';
    } else {
      let index = 0;
      suggestionsEl.innerHTML = groups.map(([label, items]) => `
        <div class="universal-suggestion-group">${label}</div>
        ${items.map(item => {
          const itemIndex = index++;
          return `<button type="button" id="universal-suggestion-${itemIndex}" class="universal-suggestion" role="option" data-index="${itemIndex}" aria-selected="false"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.detail)}</small></button>`;
        }).join('')}
      `).join('');
    }
    suggestionsEl.hidden = false;
    mainSearch.setAttribute('aria-expanded', 'true');
  };

  const updateActiveSuggestion = nextIndex => {
    if (!suggestions.length) return;
    activeSuggestion = (nextIndex + suggestions.length) % suggestions.length;
    suggestionsEl.querySelectorAll('.universal-suggestion').forEach((element, index) => {
      const active = index === activeSuggestion;
      element.classList.toggle('active', active);
      element.setAttribute('aria-selected', String(active));
    });
    const activeElement = document.getElementById(`universal-suggestion-${activeSuggestion}`);
    if (activeElement) {
      mainSearch.setAttribute('aria-activedescendant', activeElement.id);
      activeElement.scrollIntoView({ block: 'nearest' });
    }
  };

  const selectSuggestion = item => {
    if (!item) return;
    showingAllResults = false;
    mainSearch.value = item.label;
    closeSuggestions();
    const query = item.value.toLowerCase();
    searchProfessors(query);
    searchSchools(query);
    searchAreaPeople(query);
    document.getElementById('dblp-results').innerHTML = '';
    if (item.target) displayIntegratedAnalysis(item.target);
    else displayIntegratedAnalysis(null);
    updateURL();
  };

  suggestionsEl.addEventListener('pointerdown', event => event.preventDefault());
  suggestionsEl.addEventListener('click', event => {
    const option = event.target.closest('.universal-suggestion');
    if (option) selectSuggestion(suggestions[Number(option.dataset.index)]);
  });

  let debounceTimer;
  mainSearch.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.toLowerCase();
    showingAllResults = false;

    displayIntegratedAnalysis(null);
    updateURL();
    document.body.classList.toggle('has-search-query', Boolean(query.trim()));
    renderSuggestions(query);

    if (query.length < 2) {
      clearMainResults();
      return;
    }


    debounceTimer = setTimeout(() => {
      searchProfessors(query);
      searchSchools(query);
      searchAreaPeople(query);
      if (!getDistinctionFilter(query)) searchDBLPAuthors(query);
      else document.getElementById('dblp-results').innerHTML = '';
      updateIntegratedAnalysis(query);
      updateURL();
    }, 300);
  });

  mainSearch.addEventListener('focus', () => renderSuggestions(mainSearch.value));
  mainSearch.addEventListener('blur', () => window.setTimeout(closeSuggestions, 120));
  mainSearch.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (suggestionsEl.hidden) renderSuggestions(mainSearch.value);
      updateActiveSuggestion(activeSuggestion + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      updateActiveSuggestion(activeSuggestion - 1);
    } else if (event.key === 'Enter' && activeSuggestion >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeSuggestion]);
    } else if (event.key === 'Escape') {
      closeSuggestions();
    }
  });

  document.getElementById('search-example-items')?.addEventListener('click', event => {
    const allButton = event.target.closest('[data-show-all]');
    if (allButton) {
      mainSearch.value = '';
      showingAllResults = true;
      closeSuggestions();
      document.body.classList.remove('has-search-query');
      showDefaultRankings();
      updateURL();
      mainSearch.focus();
      return;
    }

    const exampleButton = event.target.closest('[data-search-example]');
    if (exampleButton) {
      mainSearch.value = exampleButton.dataset.searchExample;
      mainSearch.dispatchEvent(new Event('input', { bubbles: true }));
      mainSearch.focus();
    }
  });

  document.querySelector('main')?.addEventListener('click', event => {
    if (event.target.closest('[data-show-more-people]')) showMorePeople();
    if (event.target.closest('[data-show-more-schools]')) showMoreSchools();
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
  const container = document.getElementById('search-example-items');
  if (!container || !rawData || !appData) return;

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

  if (selectedRegion === 'world') {
    ['us', 'europe', 'asia', 'australasia'].forEach(region => {
      addUniversity(sample(schoolsInRegion(region), 1)[0]);
    });
  } else {
    sample(schools, 3).forEach(school => addUniversity(school));
  }

  const rankedProfessors = Object.values(appData.professors)
    .filter(professor => professor.totalAdjusted > 0);
  const facultyExamples = sample(rankedProfessors, 2)
    .map(professor => ({ label: cleanName(professor.name), query: professor.name }));

  const areaExamples = sample(Object.values(areaLabels), 2)
    .map(label => ({ label, query: label }));
  const familiarConferences = ['pldi', 'nips', 'icml', 'cvpr', 'sigcomm', 'sosp', 'chi', 'sigmod', 'fse', 'icse']
    .filter(area => publicationMatchesConferenceSet({ area }, confSet));
  const conferenceExamples = sample(familiarConferences, 2).map(area => ({
    label: area === 'nips' ? 'NeurIPS' : area.toUpperCase(),
    query: area === 'nips' ? 'NeurIPS' : area.toUpperCase()
  }));

  const randomizedExamples = [...universityExamples, ...facultyExamples, ...areaExamples, ...conferenceExamples]
    .map(item => `<button type="button" data-search-example="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>`)
    .join('');
  container.innerHTML = `
    <button type="button" class="search-all" data-show-all>All</button>
    <button type="button" class="search-persistent" data-search-example="Turing Award">🏆 Turing Award</button>
    <button type="button" class="search-persistent" data-search-example="ACM Fellows">ACM Fellows</button>
    ${randomizedExamples}
  `;
}

function getDistinctionFilter(query) {
  const normalized = query.trim().toLowerCase();
  if (['turing', 'turing award', 'turing awards', 'turing winner', 'turing winners'].includes(normalized)) {
    return professor => Boolean(professor.turingAwardYear);
  }
  if (['acm fellow', 'acm fellows'].includes(normalized)) {
    return professor => Boolean(professor.acmFellowYear);
  }
  return null;
}

function getDistinctionYearField(query) {
  const normalized = query.trim().toLowerCase();
  if (['turing', 'turing award', 'turing awards', 'turing winner', 'turing winners'].includes(normalized)) {
    return 'turingAwardYear';
  }
  if (['acm fellow', 'acm fellows'].includes(normalized)) {
    return 'acmFellowYear';
  }
  return null;
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
  const detail = target ? { ...target, historical: historicalMode } : null;
  document.body.classList.toggle('has-analysis-target', Boolean(target));
  window.__cspicksAnalysisTarget = detail;
  window.dispatchEvent(new CustomEvent('cspicks:analysis-target', { detail }));
}

function updateIntegratedAnalysis(query) {
  displayIntegratedAnalysis(resolveAnalysisTarget(query));
}

window.showIntegratedAnalysis = function (type, name) {
  showingAllResults = false;
  const input = document.getElementById('main-search');
  input.value = type === 'researcher' ? cleanName(name) : name;
  document.body.classList.add('has-search-query');
  const query = name.toLowerCase();
  searchProfessors(query);
  searchSchools(query);
  searchAreaPeople(query);
  document.getElementById('dblp-results').innerHTML = '';
  displayIntegratedAnalysis({ type, name });
  updateURL();
};

function clearMainResults() {
  displayIntegratedAnalysis(null);
  document.querySelectorAll('#conference-results, #school-results, #area-people-results, #prof-results, #dblp-results')
    .forEach(container => { container.innerHTML = ''; });
  document.getElementById('prof-results')?.classList.remove('single-result');
  const header = document.getElementById('search-context-header');
  if (header) header.style.display = 'none';
}

function showDefaultRankings() {
  displayIntegratedAnalysis(null);
  const schools = Object.values(appData.schools)
    .filter(school => school.name && Number.isFinite(school.rank))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, 50);
  const professors = Object.values(appData.professors)
    .sort((a, b) => b.totalAdjusted - a.totalAdjusted || a.name.localeCompare(b.name))
    .slice(0, 50);

  document.getElementById('school-results').innerHTML = `
    <h2 class="section-title">Universities</h2>
    ${schools.map((school, index) => renderSchoolCard(school, null, index + 1)).join('')}
  `;
  document.getElementById('prof-results').classList.remove('single-result');
  document.getElementById('prof-results').innerHTML = `
    <h2 class="section-title">Professors</h2>
    ${professors.map(professor => renderProfessorCard(professor)).join('')}
  `;
  document.querySelectorAll('#conference-results, #area-people-results, #dblp-results')
    .forEach(container => { container.innerHTML = ''; });
  document.getElementById('search-context-header').style.display = 'none';
}

function findMatchingConference(query) {
  const normalized = (conferenceAliases[query] || query).toLowerCase();
  return Object.keys(getConferenceAreaMap(confSet)).find(key =>
    key.toLowerCase() === normalized && publicationMatchesConferenceSet({ area: key }, confSet)
  ) || null;
}

function searchAreaPeople(query) {
  const container = document.getElementById('area-people-results');
  container.innerHTML = '';

  let topProfs = [];
  const title = 'Professors';
  const confKey = findMatchingConference(query);

  if (confKey) {
    topProfs = Object.values(appData.professors)
      .map(p => {
        const confPubs = p.pubs.filter(pub => pub.area === confKey);
        if (confPubs.length === 0) return null;
        const count = confPubs.reduce((sum, pub) => sum + pub.count, 0);
        const adjusted = confPubs.reduce((sum, pub) => sum + pub.adjustedcount, 0);
        const parentArea = getConferenceAreaMap(confSet)[confKey];
        return {
          ...p,
          pubs: confPubs,
          areas: { [parentArea]: { count, adjusted } },
          totalCount: count,
          totalPapers: Math.ceil(count),
          totalAdjusted: adjusted,
          resultAdjusted: adjusted
        };
      })
      .filter(p => p && p.resultAdjusted > 0)
      .sort((a, b) => b.resultAdjusted - a.resultAdjusted || cleanName(a.name).localeCompare(cleanName(b.name)));
  } else {
    const areaMatch = Object.entries(areaLabels).find(([key, label]) =>
      label.toLowerCase().includes(query) || key.toLowerCase() === query
    );

    if (areaMatch) {
      const [areaKey] = areaMatch;
      topProfs = Object.values(appData.professors)
        .map(p => {
          const stats = p.areas[areaKey];
          if (!stats?.adjusted) return null;
          const areaMap = getConferenceAreaMap(confSet);
          const pubs = p.pubs.filter(pub => areaMap[pub.area] === areaKey);
          return {
            ...p,
            pubs,
            areas: { [areaKey]: stats },
            totalCount: stats.count,
            totalPapers: Math.ceil(stats.count),
            totalAdjusted: stats.adjusted,
            resultAdjusted: stats.adjusted
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.resultAdjusted - a.resultAdjusted || cleanName(a.name).localeCompare(cleanName(b.name)));
    }
  }

  if (topProfs.length === 0) return;
  const initialCount = 10;
  window._peopleResults = { results: topProfs, shown: initialCount, title };
  renderPeopleResults();
}

function renderPeopleResults() {
  const state = window._peopleResults;
  const container = document.getElementById('area-people-results');
  if (!state || !container) return;

  const visible = state.results.slice(0, state.shown);
  container.innerHTML = `
    <h2 class="section-title">${escapeHtml(state.title)}</h2>
    ${visible.map(professor => renderProfessorCard(professor)).join('')}
    ${state.results.length > state.shown ? `
      <div id="see-more-people" class="see-more-results">
        <button type="button" data-show-more-people class="btn-secondary">
          See more researchers (${state.results.length - state.shown} remaining)
        </button>
      </div>
    ` : ''}
  `;
}

function showMorePeople() {
  if (!window._peopleResults) return;
  window._peopleResults.shown += 10;
  renderPeopleResults();
}

function setSearchQuery(query) {
  const input = document.getElementById('main-search');
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function searchProfessorByAffiliation(name, affiliation) {
  const input = document.getElementById('main-search');
  input.value = cleanName(name);

  const query = name.toLowerCase();
  const tokens = query.split(/\s+/).filter(t => t.length > 0);

  const results = Object.values(appData.professors)
    .filter(p => {
      const profName = p.name.toLowerCase();
      return tokens.every(token => profName.includes(token));
    })
    .sort((a, b) => {
      const aMatch = a.affiliation === affiliation ? 1 : 0;
      const bMatch = b.affiliation === affiliation ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return b.totalAdjusted - a.totalAdjusted;
    });

  const container = document.getElementById('prof-results');
  container.classList.toggle('single-result', results.length === 1);
  container.innerHTML = results
    .slice(0, 50)
    .map(prof => renderProfessorCard(prof))
    .join('');

  document.getElementById('conference-results').innerHTML = '';
  document.getElementById('school-results').innerHTML = '';
  document.getElementById('area-people-results').innerHTML = '';
  document.getElementById('dblp-results').innerHTML = '';
  document.getElementById('search-context-header').style.display = 'none';

  const selectedProfessor = results.find(professor => professor.name === name)
    || (results.length === 1 ? results[0] : null);
  displayIntegratedAnalysis(selectedProfessor
    ? { type: 'researcher', name: selectedProfessor.name }
    : null);
  updateURL();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupFilters() {
  const regionSelect = document.getElementById('region-select');
  const startYearSelect = document.getElementById('start-year');
  const endYearSelect = document.getElementById('end-year');

  // Populate years (1970 - Current Year + 1)
  const currentYear = new Date().getFullYear();
  for (let y = 1970; y <= currentYear + 1; y++) {
    const optionStart = new Option(y, y);
    const optionEnd = new Option(y, y);
    startYearSelect.add(optionStart);
    endYearSelect.add(optionEnd);
  }

  // Set defaults
  startYearSelect.value = startYear;
  endYearSelect.value = endYear;

  const handleFilterChange = () => {
    const expandedCards = saveExpandedCards();

    selectedRegion = regionSelect.value;
    rememberRegion(selectedRegion);
    startYear = parseInt(startYearSelect.value);
    endYear = parseInt(endYearSelect.value);

    // Validate range
    if (startYear > endYear) {
      // Swap if invalid
      [startYear, endYear] = [endYear, startYear];
      startYearSelect.value = startYear;
      endYearSelect.value = endYear;
    }

    if (historicalMode && historyMap && aliasMap) {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, historyMap, aliasMap, confSet);
    } else {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, null, null, confSet);
    }
    updatePriorData();
    renderSearchExamples();
    console.log(`Filtered: Region=${selectedRegion}, Years=${startYear}-${endYear}, Historical=${historicalMode}, ConfSet=${confSet}`);

    // Re-run current search or show top rankings
    const query = document.getElementById('main-search').value.toLowerCase();

    if (query.length >= 2) {
      searchProfessors(query);
      searchSchools(query);
      searchAreaPeople(query);
      if (!getDistinctionFilter(query)) searchDBLPAuthors(query);
      else document.getElementById('dblp-results').innerHTML = '';
      updateIntegratedAnalysis(query);
    } else if (showingAllResults) {
      showDefaultRankings();
    } else {
      clearMainResults();
    }

    updateURL();

    window.dispatchEvent(new CustomEvent('cspicks:analysis-refresh', {
      detail: { historical: historicalMode }
    }));

    // Restore expanded state immediately
    requestAnimationFrame(() => {
      restoreExpandedCards(expandedCards);
    });
  };

  regionSelect.addEventListener('change', handleFilterChange);
  startYearSelect.addEventListener('change', handleFilterChange);
  endYearSelect.addEventListener('change', handleFilterChange);
}

let profObserver = null;

function searchProfessors(query) {
  if (profObserver) {
    profObserver.disconnect();
    profObserver = null;
  }

  const allProfs = Object.values(appData.professors);
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  const distinctionFilter = getDistinctionFilter(query);
  const distinctionYearField = getDistinctionYearField(query);

  const results = allProfs
    .filter(p => {
      if (distinctionFilter) return distinctionFilter(p);
      const searchableNames = [p.name, ...(p.aliases || [])].join(' ').toLowerCase();
      return tokens.every(token => searchableNames.includes(token));
    })
    .sort((a, b) => distinctionYearField
      ? Number(b[distinctionYearField] || 0) - Number(a[distinctionYearField] || 0)
        || cleanName(a.name).localeCompare(cleanName(b.name))
      : b.totalAdjusted - a.totalAdjusted);

  const container = document.getElementById('prof-results');
  container.classList.toggle('single-result', results.length === 1);
  container.innerHTML = distinctionFilter ? '<h2 class="section-title">Professors</h2>' : '';

  const CHUNK_SIZE = 20;
  let renderedCount = 0;

  const renderChunk = () => {
    const chunk = results.slice(renderedCount, renderedCount + CHUNK_SIZE);
    if (chunk.length === 0) return;

    const oldSentinel = document.getElementById('prof-sentinel');
    if (oldSentinel) oldSentinel.remove();

    const html = chunk.map(professor => renderProfessorCard(professor)).join('');
    container.insertAdjacentHTML('beforeend', html);
    renderedCount += CHUNK_SIZE;

    if (renderedCount < results.length) {
      const sentinel = document.createElement('div');
      sentinel.id = 'prof-sentinel';
      sentinel.style.height = '50px';
      container.appendChild(sentinel);

      if (profObserver) profObserver.observe(sentinel);
    }
  };

  profObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      profObserver.unobserve(entries[0].target);
      renderChunk();
    }
  }, { rootMargin: '400px' });

  renderChunk();
}

// DBLP URL generation
function findMatchingArea(query) {
  const q = query.toLowerCase();

  if (areaLabels[q]) return q;

  for (const key of Object.keys(areaLabels)) {
    if (key.startsWith(q)) return key;
  }

  for (const [key, label] of Object.entries(areaLabels)) {
    if (label.toLowerCase().startsWith(q)) return key;
  }
  for (const [key, label] of Object.entries(areaLabels)) {
    if (label.toLowerCase().includes(q)) return key;
  }

  return null;
}

function searchSchools(query) {
  const effectiveQuery = schoolAliases[query] || query;
  const confKeyMatch = findMatchingConference(query);
  const matchedArea = findMatchingArea(effectiveQuery);

  let results;

  document.getElementById('conference-results').innerHTML = '';
  const header = document.getElementById('search-context-header');

  if (confKeyMatch) {
    header.textContent = `Results for Conference: ${getConferenceLabel(confKeyMatch)}`;
    header.style.display = 'block';
  } else if (matchedArea) {
    header.textContent = `Results for Area: ${areaLabels[matchedArea]}`;
    header.style.display = 'block';
  } else {
    header.style.display = 'none';
  }

  if (confKeyMatch) {
    const schoolStats = {};

    Object.entries(appData.professors).forEach(([profName, prof]) => {
      const pubsInConf = prof.pubs.filter(p => p.area === confKeyMatch);
      if (pubsInConf.length === 0) return;

      pubsInConf.forEach(pub => {
        const publicationSchools = getPublicationSchools(
          prof,
          pub,
          historicalMode ? historyMap : null,
          historicalMode ? aliasMap : null
        ).filter(schoolName => appData.schools[schoolName]);

        publicationSchools.forEach(schoolName => {
          if (!schoolStats[schoolName]) {
            schoolStats[schoolName] = { adjusted: 0, count: 0, faculty: [] };
          }
          schoolStats[schoolName].adjusted += pub.adjustedcount;
          schoolStats[schoolName].count += pub.count;
          if (!schoolStats[schoolName].faculty.includes(profName)) {
            schoolStats[schoolName].faculty.push(profName);
          }
        });
      });
    });

    results = Object.entries(schoolStats)
      .map(([schoolName, stats]) => {
        const school = appData.schools[schoolName];
        if (!school) return null;

        return {
          ...school,
          areas: {
            [confKeyMatch]: { count: stats.count, adjusted: stats.adjusted, faculty: stats.faculty }
          },
          totalCount: stats.count,
          totalAdjusted: stats.adjusted
        };
      })
      .filter(s => s)
      .sort((a, b) => b.areas[confKeyMatch].adjusted - a.areas[confKeyMatch].adjusted);

  } else if (matchedArea) {
    // Area Search Mode
    results = Object.values(appData.schools)
      .filter(school => school.areas[matchedArea] && school.areas[matchedArea].adjusted > 0)
      .sort((a, b) => {
        const countA = a.areas[matchedArea]?.adjusted || 0;
        const countB = b.areas[matchedArea]?.adjusted || 0;
        return countB - countA;
      });
  } else {
    const allSchools = Object.values(appData.schools).filter(s => s.name); // Filter out null names
    const tokens = effectiveQuery.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const originalTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    results = allSchools
      .filter(s => {
        const name = s.name.toLowerCase();
        return tokens.every(token => name.includes(token)) ||
          originalTokens.every(token => name.includes(token));
      })
      .sort((a, b) => a.rank - b.rank);
  }

  const container = document.getElementById('school-results');
  const filterKey = confKeyMatch || matchedArea;
  const initialCount = 10;

  const resultTitle = filterKey ? 'Universities' : '';
  window._schoolResults = { results, filterKey, shown: initialCount, resultTitle };

  let html = resultTitle ? `<h2 class="section-title">${escapeHtml(resultTitle)}</h2>` : '';
  html += results
    .slice(0, initialCount)
    .map((school, index) => renderSchoolCard(school, filterKey, index + 1))
    .join('');

  if (results.length > initialCount) {
    html += `
      <div id="see-more-schools" class="see-more-results">
        <button type="button" data-show-more-schools class="btn-secondary">
          See more universities (${results.length - initialCount} remaining)
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

function showMoreSchools() {
  const { results, filterKey, shown } = window._schoolResults;
  const nextBatch = 10;
  const newShown = shown + nextBatch;

  document.getElementById('see-more-schools')?.remove();

  const container = document.getElementById('school-results');
  const newCards = results
    .slice(shown, newShown)
    .map((school, index) => renderSchoolCard(school, filterKey, shown + index + 1))
    .join('');

  container.insertAdjacentHTML('beforeend', newCards);

  window._schoolResults.shown = newShown;

  if (results.length > newShown) {
    container.insertAdjacentHTML('beforeend', `
      <div id="see-more-schools" class="see-more-results">
        <button type="button" data-show-more-schools class="btn-secondary">
          See more universities (${results.length - newShown} remaining)
        </button>
      </div>
    `);
  }
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
