import { buildFundingIndex, fundingFacultyNameMatches, fundingMatches, fundingSchoolNameMatches, renderFundingFacultyCard, renderFundingSchoolCard } from './nsf.js';
import { createFilterBar } from './filters.js';
import { renderInfiniteLists } from './search-results.js';
import { cleanName, escapeHtml } from './shared.js';

const params = new URLSearchParams(window.location.search);
const currentYear = new Date().getFullYear();
let filters = null;
let dataset = null;
let index = null;

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
  filters = createFilterBar('#filter-bar', {
    label: 'Funding filters',
    fields: ['years'],
    years: { min: 1989, max: currentYear + 1 },
    prefix: 'NSF CS awards during',
    prefixId: 'funding-award-count',
    className: 'funding-filters',
    params,
    onChange: rebuild
  });
}

function updateUrl() {
  const next = filters.toParams();
  const query = document.getElementById('funding-search').value.trim();
  if (query) next.set('q', query);
  history.replaceState({}, '', `${location.pathname}?${next}`);
}

function render(query = '') {
  const normalized = query.trim();
  const schools = normalized ? index.schools.filter(record => fundingSchoolNameMatches(record, normalized)) : index.schools;
  const faculty = normalized ? [
    ...index.faculty.filter(record => fundingFacultyNameMatches(record, normalized)),
    ...index.faculty.filter(record => !fundingFacultyNameMatches(record, normalized) && fundingMatches(record, normalized))
  ] : index.faculty;
  const schoolContainer = document.getElementById('funding-school-results');
  const facultyContainer = document.getElementById('funding-faculty-results');
  document.getElementById('funding-award-count').textContent = `${index.awards.length.toLocaleString()} NSF CS awards during`;
  // Universities left, people right, both growing on scroll — as on Search.
  document.body.classList.toggle('showing-rankings', !normalized);
  // The record you searched for opens; the rest stay as names.
  const isTarget = value => Boolean(normalized)
    && cleanName(String(value)).toLowerCase() === cleanName(normalized).toLowerCase();
  // Viewing one university: the people under it are its faculty, shown in full.
  const underOneSchool = schools.length === 1 && isTarget(schools[0].name);
  renderInfiniteLists([
    { container: schoolContainer, items: schools, renderItem: school => renderFundingSchoolCard(school, { expanded: isTarget(school.name) }) },
    { container: facultyContainer, items: faculty, renderItem: record => renderFundingFacultyCard(record, { expanded: isTarget(record.name), collapsible: !underOneSchool }) }
  ]);

  const status = document.getElementById('funding-status');
  status.textContent = normalized && !schools.length && !faculty.length
    ? `No matched funding records found for “${normalized}” in this year range.`
    : '';
  updateUrl();
}

function rebuild() {
  index = buildFundingIndex(dataset, filters.startYear, filters.endYear);
  render(document.getElementById('funding-search').value);
}

function renderExamples() {
  const examples = document.getElementById('funding-examples');
  const faculty = index.faculty.slice(0, 3);
  const schools = index.schools.slice(0, 2);
  examples.innerHTML = `${schools.map(record =>
    `<button type="button" data-query="${escapeHtml(record.name)}">${escapeHtml(record.name)}</button>`
  ).join('')}${faculty.map(record =>
    `<button type="button" data-query="${escapeHtml(record.name)}">${escapeHtml(record.name.replace(/\s+\d{4}$/, ''))}</button>`
  ).join('')}`;
}

async function init() {
  setupYears();
  const response = await fetch('./nsf-awards.json');
  if (!response.ok) throw new Error(`NSF dataset returned ${response.status}`);
  dataset = await response.json();
  index = buildFundingIndex(dataset, filters.startYear, filters.endYear);
  const input = document.getElementById('funding-search');
  input.disabled = false;
  input.placeholder = 'Search university, professor, award, or NSF program';
  input.value = params.get('q') || '';
  setupDataHealth();
  renderExamples();
  render(input.value);
  input.addEventListener('input', () => render(input.value));
  // Clicking a card searches for that university or professor, the way
  // clicking a Search result opens that target.
  document.querySelector('.funding-results-container')?.addEventListener('click', event => {
    const header = event.target.closest('[data-action="open-funding-target"]');
    const name = header?.closest('.card')?.dataset.name;
    if (!name || input.value.trim().toLowerCase() === name.toLowerCase()) return;
    input.value = name;
    render(input.value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('funding-examples').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    input.value = button.dataset.query;
    render(input.value);
  });
  input.focus();
}

init().catch(error => {
  console.error(error);
  document.getElementById('funding-status').textContent = 'NSF funding data could not be loaded.';
});
