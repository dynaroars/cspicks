import { buildFundingIndex, fundingFacultyNameMatches, fundingMatches, fundingSchoolNameMatches, renderFundingFacultyCard, renderFundingSchoolCard } from './nsf.js';
import { schoolAliases } from './data.js';
import { cleanName, escapeHtml } from './shared.js';

const params = new URLSearchParams(window.location.search);
const currentYear = new Date().getFullYear();
let startYear = Number(params.get('start')) || currentYear - 10;
let endYear = Number(params.get('end')) || currentYear;
let dataset = null;
let index = null;
let showingAll = params.get('view') === 'all';

function renderDataHealth() {
  const container = document.getElementById('nsf-data-health-stats');
  if (!container || !dataset) return;
  const awards = dataset.awards || [];
  const coverage = dataset.coverage || {};
  const managerCount = awards.filter(award => award.programManager).length;
  const datedCount = awards.filter(award => award.startDate && award.endDate).length;
  const percentage = count => awards.length ? (count / awards.length * 100).toFixed(1) : '0.0';
  const syncDate = new Date(dataset.syncedAt);
  const syncText = Number.isNaN(syncDate.getTime()) ? 'Unknown' : syncDate.toLocaleString();
  const coverageComplete = coverage.complete && coverage.failures === 0;

  container.innerHTML = `
    <h2>NSF funding data health</h2>
    <p class="summary-note">This audit reports the freshness and field coverage of the nationwide NSF snapshot matched to the current CSRankings roster.</p>
    <div class="diagnostic-grid">
      <div class="diagnostic-stat"><span>Roster sync</span><strong class="${coverageComplete ? 'confidence-high' : 'confidence-review'}">${coverageComplete ? 'Complete' : 'Review'}</strong><small>${Number(coverage.failures || 0).toLocaleString()} API failures</small></div>
      <div class="diagnostic-stat"><span>Universities checked</span><strong>${Number(coverage.institutionsChecked || 0).toLocaleString()} / ${Number(coverage.institutionsTotal || 0).toLocaleString()}</strong><small>current CSRankings institutions</small></div>
      <div class="diagnostic-stat"><span>Faculty checked</span><strong>${Number(coverage.facultyChecked || 0).toLocaleString()} / ${Number(coverage.facultyTotal || 0).toLocaleString()}</strong><small>current-roster faculty</small></div>
      <div class="diagnostic-stat"><span>Matched awards</span><strong>${awards.length.toLocaleString()}</strong><small>nationwide NSF snapshot</small></div>
      <div class="diagnostic-stat"><span>Program managers</span><strong>${percentage(managerCount)}%</strong><small>${managerCount.toLocaleString()} awards populated</small></div>
      <div class="diagnostic-stat"><span>Project dates</span><strong>${percentage(datedCount)}%</strong><small>${datedCount.toLocaleString()} awards with start and end dates</small></div>
      <div class="diagnostic-stat"><span>Snapshot synchronized</span><strong>${escapeHtml(syncText)}</strong><small>schema version ${escapeHtml(String(dataset.schemaVersion || 'unknown'))}</small></div>
    </div>
    <div class="data-caveat"><strong>Scope limitation:</strong> Matching is limited to current CSRankings faculty and may miss name variants or prior affiliations. Intended amounts are divided equally among listed PIs and co-PIs.</div>
  `;
}

function setupDataHealth() {
  const panel = document.getElementById('nsf-data-health');
  const toggle = document.getElementById('nsf-data-health-toggle');
  if (!panel || !toggle) return;
  if (params.get('dataHealth') === 'true') {
    panel.hidden = false;
    renderDataHealth();
  }
  toggle.addEventListener('click', event => {
    event.preventDefault();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      renderDataHealth();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

function setupYears() {
  const start = document.getElementById('funding-start-year');
  const end = document.getElementById('funding-end-year');
  for (let year = 1989; year <= currentYear + 1; year++) {
    start.add(new Option(year, year));
    end.add(new Option(year, year));
  }
  start.value = startYear;
  end.value = endYear;
  const update = () => {
    startYear = Number(start.value);
    endYear = Number(end.value);
    if (startYear > endYear) [startYear, endYear] = [endYear, startYear];
    start.value = startYear;
    end.value = endYear;
    rebuild();
  };
  start.addEventListener('change', update);
  end.addEventListener('change', update);
}

function updateUrl() {
  const next = new URLSearchParams({ start: String(startYear), end: String(endYear) });
  const query = document.getElementById('funding-search').value.trim();
  if (query) next.set('q', query);
  if (showingAll) next.set('view', 'all');
  history.replaceState({}, '', `${location.pathname}?${next}`);
}

function render(query = '') {
  const normalized = query.trim();
  const matchingSchools = normalized ? index.schools.filter(record => fundingSchoolNameMatches(record, normalized)) : (showingAll ? index.schools : []);
  const matchingFaculty = normalized ? [
    ...index.faculty.filter(record => fundingFacultyNameMatches(record, normalized)),
    ...index.faculty.filter(record => !fundingFacultyNameMatches(record, normalized) && fundingMatches(record, normalized))
  ] : (showingAll ? index.faculty : []);
  const schools = matchingSchools.slice(0, 50);
  const faculty = matchingFaculty.slice(0, 50);
  const schoolContainer = document.getElementById('funding-school-results');
  const facultyContainer = document.getElementById('funding-faculty-results');
  document.getElementById('funding-award-count').textContent = `${index.awards.length.toLocaleString()} NSF CS awards during`;
  schoolContainer.innerHTML = schools.length ? `<h2 class="section-title">Universities</h2>${schools.map((school, index) => renderFundingSchoolCard(school, index)).join('')}` : '';
  facultyContainer.innerHTML = faculty.length ? `<h2 class="section-title">Professors</h2>${faculty.map(record => renderFundingFacultyCard(record)).join('')}` : '';

  const status = document.getElementById('funding-status');
  status.textContent = normalized && !schools.length && !faculty.length
    ? `No matched funding records found for “${normalized}” in this year range.`
    : '';
  updateUrl();
}

function rebuild() {
  index = buildFundingIndex(dataset, startYear, endYear);
  render(document.getElementById('funding-search').value);
}

function renderExamples() {
  const examples = document.getElementById('funding-examples');
  const faculty = index.faculty.slice(0, 3);
  const schools = index.schools.slice(0, 2);
  examples.innerHTML = `<button type="button" data-show-all>All</button>${schools.map(record =>
    `<button type="button" data-query="${escapeHtml(record.name)}">${escapeHtml(record.name)}</button>`
  ).join('')}${faculty.map(record =>
    `<button type="button" data-query="${escapeHtml(record.name)}">${escapeHtml(record.name.replace(/\s+\d{4}$/, ''))}</button>`
  ).join('')}`;
}

function setupSearchSuggestions(input) {
  const suggestionsEl = document.getElementById('funding-suggestions');
  let suggestions = [];
  let activeSuggestion = -1;

  const closeSuggestions = () => {
    suggestions = [];
    activeSuggestion = -1;
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const scoreMatch = (text, query) => {
    const normalized = text.toLowerCase();
    if (normalized.startsWith(query)) return 0;
    if (normalized.split(/\s+/).some(word => word.startsWith(query))) return 1;
    return normalized.includes(query) ? 2 : Infinity;
  };

  const rank = (items, query, limit) => items
    .map(item => ({ item, score: scoreMatch(`${item.label} ${item.searchTerms || ''}`, query) }))
    .filter(match => Number.isFinite(match.score))
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map(match => match.item);

  const renderSuggestions = queryValue => {
    if (!index) return closeSuggestions();
    const query = queryValue.trim().toLowerCase();
    if (!query) return closeSuggestions();

    const aliasesBySchool = new Map();
    Object.entries(schoolAliases).forEach(([alias, school]) => {
      if (!aliasesBySchool.has(school)) aliasesBySchool.set(school, []);
      aliasesBySchool.get(school).push(alias);
    });

    const schools = rank(index.schools.map(school => ({
      label: school.name,
      value: school.name,
      detail: `University · ${school.faculty.length} matched faculty`,
      searchTerms: (aliasesBySchool.get(school.name) || []).join(' ')
    })), query, 4);
    const faculty = rank(index.faculty.map(person => ({
      label: cleanName(person.name),
      value: person.name,
      detail: person.affiliation || 'Professor'
    })), query, 4);
    const programs = rank([...new Set(index.awards.flatMap(award => [award.program, award.division]).filter(Boolean))]
      .map(program => ({ label: program, value: program, detail: 'NSF program' })), query, 3);
    const groups = [
      ['Universities', schools],
      ['Professors', faculty],
      ['NSF programs', programs]
    ].filter(([, items]) => items.length);
    suggestions = groups.flatMap(([, items]) => items);
    activeSuggestion = -1;

    if (!suggestions.length) {
      suggestionsEl.innerHTML = '<div class="universal-suggestion-empty">No matching funding result</div>';
    } else {
      let itemIndex = 0;
      suggestionsEl.innerHTML = groups.map(([label, items]) => `
        <div class="universal-suggestion-group">${escapeHtml(label)}</div>
        ${items.map(item => {
          const index = itemIndex++;
          return `<button type="button" id="funding-suggestion-${index}" class="universal-suggestion" role="option" data-index="${index}" aria-selected="false"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.detail)}</small></button>`;
        }).join('')}
      `).join('');
    }
    suggestionsEl.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const updateActiveSuggestion = nextIndex => {
    if (!suggestions.length) return;
    activeSuggestion = (nextIndex + suggestions.length) % suggestions.length;
    suggestionsEl.querySelectorAll('.universal-suggestion').forEach((element, index) => {
      const active = index === activeSuggestion;
      element.classList.toggle('active', active);
      element.setAttribute('aria-selected', String(active));
    });
    const activeElement = document.getElementById(`funding-suggestion-${activeSuggestion}`);
    if (activeElement) {
      input.setAttribute('aria-activedescendant', activeElement.id);
      activeElement.scrollIntoView({ block: 'nearest' });
    }
  };

  const selectSuggestion = item => {
    if (!item) return;
    input.value = item.label;
    showingAll = false;
    closeSuggestions();
    render(item.value);
  };

  suggestionsEl.addEventListener('pointerdown', event => event.preventDefault());
  suggestionsEl.addEventListener('click', event => {
    const option = event.target.closest('.universal-suggestion');
    if (option) selectSuggestion(suggestions[Number(option.dataset.index)]);
  });
  input.addEventListener('input', () => renderSuggestions(input.value));
  input.addEventListener('focus', () => renderSuggestions(input.value));
  input.addEventListener('blur', () => window.setTimeout(closeSuggestions, 120));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (suggestionsEl.hidden) renderSuggestions(input.value);
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

  return { closeSuggestions };
}

async function init() {
  setupYears();
  const response = await fetch('./nsf-awards.json');
  if (!response.ok) throw new Error(`NSF dataset returned ${response.status}`);
  dataset = await response.json();
  index = buildFundingIndex(dataset, startYear, endYear);
  const input = document.getElementById('funding-search');
  input.disabled = false;
  input.placeholder = 'Search university, professor, award, or NSF program';
  input.value = params.get('q') || '';
  setupDataHealth();
  renderExamples();
  render(input.value);
  const searchSuggestions = setupSearchSuggestions(input);
  input.addEventListener('input', () => {
    showingAll = false;
    render(input.value);
  });
  document.getElementById('funding-examples').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-show-all')) {
      input.value = '';
      showingAll = true;
    } else {
      input.value = button.dataset.query;
      showingAll = false;
    }
    searchSuggestions.closeSuggestions();
    render(input.value);
  });
  input.focus();
}

init().catch(error => {
  console.error(error);
  document.getElementById('funding-status').textContent = 'NSF funding data could not be loaded.';
});
