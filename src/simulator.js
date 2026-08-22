import { loadData, getConferenceAreaMap, publicationMatchesConferenceSet, DEFAULT_END_YEAR } from './data.js';
import { createFilterBar } from './filters.js';
import { areaLabels, cleanName, escapeHtml } from './shared.js';
import { searchAuthor, fetchAuthorStats, parseDblpProfileUrl } from './dblp.js';
import { calculateRankImpact, fuzzyMatch, parseCandidateNames } from './simulation.js';
import { calculatePerCapita } from './metrics.js';
import { syncCsrankingsRules } from './csrankings-rules.js';
import { initTooltipPositioning } from './tooltip-position.js';
import { SITE_NAME, updatePageMeta } from './seo.js';
import { trackView } from './analytics.js';
import './styles/pages/simulator.css';
import { performCandidatesAnalysis } from './simulator/candidate-analysis.js';
import { renderCandidateResults } from './simulator/candidate-results.js';

let rawData = null;
let appData = { professors: {}, schools: {} };
let filters = null;

let simFacultyArr = [];
let facultyFilter = '';
let dblpFacultyResults = [];
let dblpFacultyLoading = false;
let dblpSearchTimer = null;
let dblpSearchSequence = 0;
const selectedDblpProfiles = new Map();

function resetFacultySearch() {
  clearTimeout(dblpSearchTimer);
  dblpSearchSequence++;
  facultyFilter = '';
  dblpFacultyResults = [];
  dblpFacultyLoading = false;
}

function populateFacultyList(school) {
  const facultySet = new Set();
  Object.values(school.areas).forEach(a => a.faculty.forEach(f => facultySet.add(f)));
  simFacultyArr = Array.from(facultySet).sort((a, b) => {
    const profA = appData.professors[a];
    const profB = appData.professors[b];
    return (profB?.totalAdjusted || 0) - (profA?.totalAdjusted || 0);
  });

  resetFacultySearch();
  selectedDblpProfiles.clear();
  renderFacultyList();
}

function addCandidate(name, dblpProfile = null) {
  const candidatesInput = document.getElementById('sim-candidates-input');
  const names = parseCandidateNames(candidatesInput.value);
  if (dblpProfile) selectedDblpProfiles.set(name.toLowerCase(), dblpProfile);
  if (!names.some(candidate => candidate.toLowerCase() === name.toLowerCase())) {
    names.push(name);
    candidatesInput.value = names.join('\n');
  }
}

function findLocalFaculty(filter) {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) return simFacultyArr;

  return Object.keys(appData.professors)
    .filter(name => cleanName(name).toLowerCase().includes(normalized)
      || (appData.professors[name].aliases || []).some(alias => cleanName(alias).toLowerCase().includes(normalized)))
    .sort((a, b) => {
      const nameA = cleanName(a).toLowerCase();
      const nameB = cleanName(b).toLowerCase();
      const startsA = nameA.startsWith(normalized) ? 0 : 1;
      const startsB = nameB.startsWith(normalized) ? 0 : 1;
      return startsA - startsB || nameA.localeCompare(nameB);
    })
    .slice(0, 20);
}

function renderFacultyList(filter = facultyFilter) {
  const listEl = document.getElementById('sim-faculty-list');
  const candidatesInput = document.getElementById('sim-candidates-input');
  if (!listEl || !candidatesInput) return;

  const filtered = findLocalFaculty(filter);

  const currentNames = candidatesInput.value.split('\n').map(n => n.trim()).filter(n => n);

  const localHtml = filtered.map(f => {
    const displayName = cleanName(f);
    const candidateName = f;
    const checked = currentNames.some(n => n.toLowerCase() === candidateName.toLowerCase());
    const prof = appData.professors[f];
    const areas = prof ? Object.keys(prof.areas).length : 0;
    const papers = prof ? prof.totalPapers : 0;
    const adj = prof ? prof.totalAdjusted.toFixed(1) : '0';
    const affiliation = prof?.affiliation || 'University unavailable';
    return `
      <label class="sim-faculty-option" data-name="${escapeHtml(candidateName)}">
        <input type="checkbox" ${checked ? 'checked' : ''}>
        <span class="sim-faculty-identity">
          <span>${escapeHtml(displayName)}</span>
          <small>${escapeHtml(affiliation)}</small>
        </span>
        <small class="sim-faculty-stats">${areas} areas, ${papers} papers, ${adj} adj</small>
      </label>
    `;
  }).join('');

  let dblpHtml = '';
  if (filter.trim().length >= 2 && filtered.length === 0) {
    const resultHtml = dblpFacultyResults.map((result, index) => {
      const selectedProfile = selectedDblpProfiles.get(result.name.toLowerCase());
      const added = selectedProfile?.pid === result.pid;
      return `
        <button type="button" class="sim-dblp-result" data-index="${index}" ${added ? 'disabled' : ''}>
          <span>${escapeHtml(result.name)}</span>
          <small>${added ? 'Selected' : '+ Use this DBLP profile'}</small>
        </button>
      `;
    }).join('');

    const status = dblpFacultyLoading
      ? '<div class="sim-search-status">Searching DBLP…</div>'
      : (resultHtml || '<div class="sim-search-status">No DBLP matches</div>');
    dblpHtml = `<div class="sim-list-heading">DBLP results · affiliation unavailable</div>${status}${resultHtml}`;
  }

  const localHeading = filter
    ? (filtered.length ? `<div class="sim-list-heading">Matching faculty (${filtered.length})</div>` : '')
    : `<div class="sim-list-heading">Faculty at the selected university (${filtered.length})</div>`;
  listEl.innerHTML = `${localHeading}${localHtml}${dblpHtml}`;

  listEl.querySelectorAll('label').forEach(label => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      const name = label.dataset.name;
      const lines = candidatesInput.value.split('\n').map(n => n.trim()).filter(n => n);
      if (checkbox.checked) {
        addCandidate(name);
      } else {
        const idx = lines.findIndex(n => n.toLowerCase() === name.toLowerCase());
        if (idx >= 0) lines.splice(idx, 1);
        selectedDblpProfiles.delete(name.toLowerCase());
        candidatesInput.value = lines.join('\n');
      }
    });
  });

  listEl.querySelectorAll('.sim-dblp-result').forEach(button => {
    button.addEventListener('click', () => {
      const profile = dblpFacultyResults[Number(button.dataset.index)];
      addCandidate(profile.name, profile);
      renderFacultyList();
    });
  });
}

function searchFaculty(filter) {
  facultyFilter = filter.trim();
  dblpFacultyResults = [];
  const localMatches = findLocalFaculty(facultyFilter);
  dblpFacultyLoading = facultyFilter.length >= 2 && localMatches.length === 0;
  const sequence = ++dblpSearchSequence;
  clearTimeout(dblpSearchTimer);
  renderFacultyList();

  if (facultyFilter.length < 2 || localMatches.length > 0) return;
  dblpSearchTimer = setTimeout(async () => {
    const results = await searchAuthor(facultyFilter);
    if (sequence !== dblpSearchSequence) return;
    dblpFacultyResults = results.slice(0, 10);
    dblpFacultyLoading = false;
    renderFacultyList();
  }, 350);
}



function resetSimulation() {
  resetFacultySearch();
  selectedDblpProfiles.clear();
  selectedUniv = null;
  document.getElementById('step-univ-first').classList.remove('hidden');
  document.getElementById('step-candidates').classList.add('hidden');
  document.getElementById('step-results').classList.add('hidden');
  document.getElementById('sim-univ-search').value = '';
  document.getElementById('sim-candidates-input').value = '';
  document.getElementById('sim-univ-results').innerHTML = '';
  document.getElementById('sim-candidates-results').innerHTML = '';
  document.getElementById('sim-faculty-list').innerHTML = '';
  document.getElementById('sim-faculty-search').value = '';
  if (filters) updateSimulatorUrl();
}

function resetCandidates() {
  if (!selectedUniv) return;
  document.getElementById('step-results').classList.add('hidden');
  document.getElementById('step-candidates').classList.remove('hidden');
  document.getElementById('sim-candidates-input').value = '';
  selectedDblpProfiles.clear();
  document.getElementById('sim-candidates-results').innerHTML = '';
  document.getElementById('sim-faculty-search').value = '';
  populateFacultyList(selectedUniv);
  updateSimulatorUrl();
  document.getElementById('sim-faculty-search').focus();
}

let selectedUniv = null;
// Recomputed whenever appData changes; keyed by school name, same rule as the
// Per capita toggle on Search and Discoveries (calculatePerCapita).
let perCapitaRanks = new Map();

function refreshPerCapitaRanks() {
  perCapitaRanks = new Map(calculatePerCapita(appData).map(row => [row.name, row.rank]));
}

// The rank shown next to a school name, in whichever mode Per capita is set to.
function currentRankLabel(school) {
  if (!filters.perCapita) return `#${school.rank}`;
  const rank = perCapitaRanks.get(school.name);
  return rank ? `#${rank}` : 'not ranked — fewer than 5 faculty';
}

function setupSimulator() {
  const univSearch = document.getElementById('sim-univ-search');
  const candidatesInput = document.getElementById('sim-candidates-input');
  const analyzeBtn = document.getElementById('sim-analyze-btn');

  document.getElementById('sim-reset-btn').addEventListener('click', resetSimulation);
  document.getElementById('sim-change-candidates-btn').addEventListener('click', resetCandidates);
  document.getElementById('sim-faculty-search').addEventListener('input', event => searchFaculty(event.target.value));

  document.getElementById('sim-select-all').addEventListener('click', () => {
    document.querySelectorAll('#sim-faculty-list input[type="checkbox"]:not(:checked)').forEach(checkbox => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
    });
  });

  document.getElementById('sim-deselect-all').addEventListener('click', () => {
    document.querySelectorAll('#sim-faculty-list input[type="checkbox"]:checked').forEach(checkbox => {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
    });
  });

  univSearch.addEventListener('input', event => {
    const query = event.target.value.trim().toLowerCase();
    const container = document.getElementById('sim-univ-results');
    if (!query) {
      container.innerHTML = '';
      return;
    }

    const results = Object.values(appData.schools)
      .filter(school => school.name.toLowerCase().includes(query))
      .slice(0, 10);

    container.innerHTML = results.map(school => `
      <button type="button" class="sim-item" data-name="${escapeHtml(school.name)}">
        <strong>${escapeHtml(school.name)}</strong> <small>${escapeHtml(currentRankLabel(school))}</small>
      </button>
    `).join('');

    container.querySelectorAll('.sim-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedUniv = appData.schools[item.dataset.name];
        document.getElementById('selected-univ-display').textContent = `Target: ${selectedUniv.name} (${currentRankLabel(selectedUniv)})`;
        document.getElementById('step-univ-first').classList.add('hidden');
        document.getElementById('step-candidates').classList.remove('hidden');
        populateFacultyList(selectedUniv);
        updateSimulatorUrl();
        candidatesInput.focus();
      });
    });
  });

  candidatesInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      analyzeBtn.click();
    }
  });

  candidatesInput.addEventListener('input', () => {
    const currentNames = new Set(parseCandidateNames(candidatesInput.value).map(name => name.toLowerCase()));
    for (const name of selectedDblpProfiles.keys()) {
      if (!currentNames.has(name)) selectedDblpProfiles.delete(name);
    }
  });

  analyzeBtn.addEventListener('click', () => runAnalysis());
}

async function runAnalysis() {
  const candidatesInput = document.getElementById('sim-candidates-input');
  if (!selectedUniv) return;
  const names = parseCandidateNames(candidatesInput.value);
  if (names.length === 0) return;

  document.getElementById('step-candidates').classList.add('hidden');
  document.getElementById('step-results').classList.remove('hidden');
  document.getElementById('selected-univ-display-results').textContent = `Target: ${selectedUniv.name} (${currentRankLabel(selectedUniv)})`;
  updateSimulatorUrl();

  const loading = document.getElementById('sim-loading');
  const resultsContainer = document.getElementById('sim-candidates-results');
  loading.classList.remove('hidden');
  resultsContainer.innerHTML = '';

  const results = await performCandidatesAnalysis(selectedUniv, names, { filters, selectedDblpProfiles, appData });
  loading.classList.add('hidden');
  resultsContainer.innerHTML = renderCandidateResults(results);
  resultsContainer.querySelectorAll('.papers-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const list = button.nextElementSibling;
      list.classList.toggle('visible');
      button.textContent = list.classList.contains('visible') ? '▼ Hide Papers' : '▶ Show Papers';
    });
  });
}

// A shareable link for the current setup: filters, the selected university,
// and whatever candidate names/DBLP links are in the box - not a URL per
// computed result (that would mean re-resolving DBLP on every page load),
// but enough that opening the link reproduces the same inputs one click away.
function updateSimulatorUrl() {
  const params = filters.toParams();
  if (selectedUniv) params.set('univ', selectedUniv.name);
  const candidatesInput = document.getElementById('sim-candidates-input');
  const candidates = candidatesInput?.value.trim();
  if (candidates) params.set('candidates', candidates);
  window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  updatePageMeta({
    title: selectedUniv ? `${selectedUniv.name} ranking simulation - ${SITE_NAME}` : `${SITE_NAME} - Ranking Simulator`,
    description: selectedUniv
      ? `Model how adding, removing, or transferring faculty would change ${selectedUniv.name}'s ranking, overall and by research area.`
      : undefined
  });
  trackView(selectedUniv ? 'school' : 'default', 'simulator');
}

function setupFilters() {
  filters = createFilterBar('#filter-bar', {
    label: 'Simulator filters',
    fields: ['region', 'years', 'history', 'percapita', 'confSet'],
    years: { min: 2000, max: DEFAULT_END_YEAR },
    className: 'simulator-filters',
    onChange: () => {
      appData = filters.apply(rawData);
      refreshPerCapitaRanks();
      resetSimulation();
    }
  });
}

// Reproduces a shared setup: the university from ?univ= (if it still exists
// under these filters) and, if given, the candidate names/DBLP links from
// ?candidates= - left for the visitor to click Analyze on, rather than
// auto-run, since that would re-query DBLP for every open of the link.
function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const univName = params.get('univ');
  const school = univName && appData.schools[univName];
  if (!school) return;
  selectedUniv = school;
  document.getElementById('selected-univ-display').textContent = `Target: ${selectedUniv.name} (${currentRankLabel(selectedUniv)})`;
  document.getElementById('step-univ-first').classList.add('hidden');
  document.getElementById('step-candidates').classList.remove('hidden');
  populateFacultyList(selectedUniv);
  const candidates = params.get('candidates');
  if (candidates) document.getElementById('sim-candidates-input').value = candidates;
}

async function init() {
  initTooltipPositioning();
  try {
    [rawData] = await Promise.all([loadData(), syncCsrankingsRules()]);
    setupFilters();
    // History mode may already be on from a shared link or a stored choice,
    // and its affiliation data has to be in place before the first apply().
    await filters.ready();
    appData = filters.apply(rawData);
    refreshPerCapitaRanks();
    setupSimulator();
    restoreFromUrl();
    document.getElementById('sim-loading-page').classList.add('hidden');
    document.getElementById('simulator-workflow').classList.remove('hidden');
    document.getElementById('sim-univ-search').focus();
  } catch (error) {
    console.error('Failed to initialize simulator:', error);
    document.getElementById('sim-loading-page').textContent = 'Unable to load ranking data. Please try again.';
  }
}

init();
