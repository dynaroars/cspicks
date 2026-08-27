import { buildFundingIndex, formatFunding, fundingFacultyNameMatches, fundingMatches, fundingSchoolNameMatches, renderFundingFacultyCard, renderFundingSchoolCard } from './nsf.js';
import { parseComparisonQuery } from './comparison.js';
import { compareNumber, renderComparisonNotice, renderScoreboard } from './compare-view.js';
import { createFilterBar } from './filters.js';
import { renderInfiniteLists } from './search-results.js';
import { cleanName, escapeHtml, fetchLatestRepoCommit, formatRelativeTime, getInstitutionShortName } from './shared.js';
import { createSuggestionBox, rankSuggestions } from './suggestion-box.js';
import { initTooltipPositioning } from './tooltip-position.js';
import { SITE_NAME, updatePageMeta } from './seo.js';
import { trackComparison, trackView } from './analytics.js';

const params = new URLSearchParams(window.location.search);
const currentYear = new Date().getFullYear();
const SUGGESTION_LIMITS = { schools: 12, faculty: 25, programs: 8 };
let filters = null;
let dataset = null;
let index = null;
let suggestionItems = null;

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
    <p class="summary-note">This audit reports the freshness and field coverage of the nationwide NSF snapshot matched to the current CS faculty roster.</p>
    <div class="diagnostic-grid">
      <div class="diagnostic-stat tooltip-trigger">
        <span>Roster sync</span>
        <strong class="${coverageComplete ? 'confidence-high' : 'confidence-review'}">${coverageComplete ? 'Complete' : 'Review'}</strong>
        <small>${Number(coverage.failures || 0).toLocaleString()} API failures</small>
        <span class="tooltip-content" role="tooltip">Status of NSF API award matching across current CS faculty roster.</span>
      </div>
      <div class="diagnostic-stat tooltip-trigger">
        <span>Universities checked</span>
        <strong>${Number(coverage.institutionsChecked || 0).toLocaleString()} / ${Number(coverage.institutionsTotal || 0).toLocaleString()}</strong>
        <small>current roster institutions</small>
        <span class="tooltip-content" role="tooltip">Number of CS institutions evaluated for NSF award records.</span>
      </div>
      <div class="diagnostic-stat tooltip-trigger">
        <span>Faculty checked</span>
        <strong>${Number(coverage.facultyChecked || 0).toLocaleString()} / ${Number(coverage.facultyTotal || 0).toLocaleString()}</strong>
        <small>current-roster faculty</small>
        <span class="tooltip-content" role="tooltip">Number of individual faculty members queried against NSF investigator awards.</span>
      </div>
      <div class="diagnostic-stat tooltip-trigger">
        <span>Matched awards</span>
        <strong>${awards.length.toLocaleString()}</strong>
        <small>nationwide NSF snapshot</small>
        <span class="tooltip-content" role="tooltip">Total NSF awards matched to current CS faculty in the dataset snapshot.</span>
      </div>
      <div class="diagnostic-stat tooltip-trigger">
        <span>Program managers</span>
        <strong>${percentage(managerCount)}%</strong>
        <small>${managerCount.toLocaleString()} awards populated</small>
        <span class="tooltip-content" role="tooltip">Percentage of matched awards with identified NSF program managers.</span>
      </div>
      <div class="diagnostic-stat tooltip-trigger">
        <span>Project dates</span>
        <strong>${percentage(datedCount)}%</strong>
        <small>${datedCount.toLocaleString()} awards with start and end dates</small>
        <span class="tooltip-content" role="tooltip">Percentage of matched awards with valid project start and end dates.</span>
      </div>
      <div class="diagnostic-stat tooltip-trigger">
        <span>Snapshot synchronized</span>
        <strong>${escapeHtml(syncText)}</strong>
        <small>schema version ${escapeHtml(String(dataset.schemaVersion || 'unknown'))}</small>
        <span class="tooltip-content" role="tooltip">Timestamp of the latest nationwide NSF snapshot rebuild.</span>
      </div>
      <div class="diagnostic-stat tooltip-trigger">
        <span>Repository updated</span>
        <strong id="nsf-repo-updated">Checking...</strong>
        <small><a id="nsf-repo-link" href="https://github.com/dynaroars/cspicks" target="_blank" rel="noopener noreferrer">dynaroars/cspicks</a></small>
        <span class="tooltip-content" role="tooltip">Latest commit and relative update time for the dynaroars/cspicks GitHub repository.</span>
      </div>
    </div>
    <div class="data-caveat"><strong>Scope limitation:</strong> Matching is limited to current CS faculty on the roster and may miss name variants or prior affiliations. Intended amounts are divided equally among listed PIs and co-PIs.</div>
  `;

  fetchLatestRepoCommit().then(commit => {
    const updatedEl = document.getElementById('nsf-repo-updated');
    const linkEl = document.getElementById('nsf-repo-link');
    if (updatedEl && commit?.date) {
      updatedEl.textContent = formatRelativeTime(commit.date);
    } else if (updatedEl) {
      updatedEl.textContent = 'Active';
    }
    if (linkEl && commit?.sha) {
      linkEl.href = commit.url || 'https://github.com/dynaroars/cspicks';
      linkEl.textContent = `commit ${commit.sha}`;
    }
  });
}

// The panel floats in a fixed corner instead of sitting inline in the page,
// so opening it never has to scroll the reader away from wherever they were.
function setupDataHealth() {
  const panel = document.getElementById('nsf-data-health');
  const toggle = document.getElementById('nsf-data-health-toggle');
  if (!panel || !toggle) return;
  const hide = () => { panel.hidden = true; };
  const reveal = () => {
    panel.hidden = false;
    renderDataHealth();
  };
  if (params.get('dataHealth') === 'true') reveal();
  // Blocking default on mousedown (not click) stops the browser's own
  // focus-follows-click from scrolling this off-screen toggle back into
  // view, which would undo the point of a panel that doesn't move scroll.
  toggle.addEventListener('mousedown', event => event.preventDefault());
  toggle.addEventListener('click', event => {
    event.preventDefault();
    if (panel.hidden) reveal();
    else hide();
  });
  document.getElementById('nsf-data-health-close')?.addEventListener('click', hide);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
  });
  document.addEventListener('click', event => {
    if (panel.hidden || panel.contains(event.target) || event.target.closest('#nsf-data-health-toggle')) return;
    hide();
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
  updateSeoForCurrentView(query);
}

function updateSeoForCurrentView(query) {
  if (!query) {
    updatePageMeta({ title: `${SITE_NAME} - NSF Funding Explorer` });
    trackView('default', 'funding');
    return;
  }
  const isComparison = Boolean(parseComparisonQuery(query));
  if (isComparison) trackComparison('funding', 'funding'); else trackView('search-results', 'funding');
  updatePageMeta({
    title: `${query} - NSF Funding - ${SITE_NAME}`,
    description: isComparison
      ? `NSF funding comparison: ${query}. Award totals, growth, and matched faculty from official NSF Award Search data.`
      : `NSF funding results for "${query}" on CS Picks, built from official NSF Award Search data.`
  });
}

// "A vs B" compares two universities or two people, as on Search.
function resolveFundingTarget(name) {
  const wanted = cleanName(name).toLowerCase();
  const school = index.schools.find(record => record.name.toLowerCase() === wanted);
  if (school) return { type: 'school', name: school.name, record: school };
  const person = index.faculty.find(record => cleanName(record.name).toLowerCase() === wanted);
  return person ? { type: 'faculty', name: cleanName(person.name), record: person } : null;
}

function renderFundingComparison(parsed) {
  const section = document.getElementById('funding-comparison');
  const summary = document.getElementById('funding-comparison-summary');
  section.hidden = false;
  document.getElementById('funding-comparison-title').textContent = `${parsed.left} vs ${parsed.right}`;
  document.body.classList.remove('showing-rankings');
  ['funding-school-results', 'funding-faculty-results'].forEach(id => {
    document.getElementById(id).innerHTML = '';
  });

  const a = resolveFundingTarget(parsed.left);
  const b = resolveFundingTarget(parsed.right);
  if (!a || !b) {
    const missing = a ? parsed.right : parsed.left;
    renderComparisonNotice(summary, 'No match found',
      `Could not match "${missing}" to a university or professor with matched NSF awards in this year range.`);
    return;
  }
  if (a.type !== b.type) {
    renderComparisonNotice(summary, 'Mixed comparison',
      'Compare two universities or two professors — not one of each.');
    return;
  }
  if (a.name === b.name) {
    renderComparisonNotice(summary, 'Identical selection',
      'Pick two different targets to generate a head-to-head comparison.');
    return;
  }

  const money = value => formatFunding(value || 0);
  const rows = a.type === 'school'
    ? [
      { label: 'NSF awards', help: 'Distinct NSF awards matched to current CSRankings faculty at this university within the selected award years.', a: a.record.awards.length, b: b.record.awards.length },
      { label: 'Intended funding attributed', help: 'Sum of intended award amounts fractionally attributed to matched faculty. Each award is divided equally among its listed investigators before matched shares are assigned to universities.', a: a.record.attributedAmount, b: b.record.attributedAmount, format: money },
      { label: 'CS faculty with awards', help: 'Distinct current CSRankings faculty matched to at least one included NSF award.', a: a.record.faculty.length, b: b.record.faculty.length },
      {
        label: 'Average per matched faculty',
        help: 'Attributed intended funding divided by the number of matched CS faculty with awards. Faculty without a matched award are not included in the denominator.',
        a: a.record.attributedAmount / Math.max(1, a.record.faculty.length),
        b: b.record.attributedAmount / Math.max(1, b.record.faculty.length),
        format: money
      }
    ]
    : [
      { label: 'University', help: 'The investigator’s current CSRankings affiliation used for conservative award matching.', a: a.record.affiliation || '—', b: b.record.affiliation || '—', format: value => String(value) },
      { label: 'NSF awards', help: 'Distinct NSF awards matched to this faculty member within the selected award years.', a: a.record.awards.length, b: b.record.awards.length },
      { label: 'Intended share', help: 'The faculty member’s fractional share of intended award amounts, dividing each award equally among all listed investigators.', a: a.record.attributedAmount, b: b.record.attributedAmount, format: money },
      { label: 'Full project value', help: 'Sum of the complete intended values of matched projects before fractional attribution. This can include portions belonging to other investigators or institutions.', a: a.record.totalAwardAmount, b: b.record.totalAwardAmount, format: money }
    ];

  summary.innerHTML = renderScoreboard(escapeHtml(a.name), escapeHtml(b.name), rows.map(row => ({ format: compareNumber, ...row })))
    + `<div class="results-grid comparison-cards">
        ${[a, b].map(side => (side.type === 'school'
          ? renderFundingSchoolCard(side.record, { collapsible: false })
          : renderFundingFacultyCard(side.record, { collapsible: false }))).join('')}
      </div>`;
}

function hideFundingComparison() {
  const section = document.getElementById('funding-comparison');
  if (!section || section.hidden) return;
  section.hidden = true;
  document.getElementById('funding-comparison-summary').innerHTML = '';
}

function render(query = '') {
  const normalized = query.trim();
  const comparison = parseComparisonQuery(normalized);
  if (comparison) {
    document.getElementById('funding-status').textContent = '';
    renderFundingComparison(comparison);
    updateUrl();
    return;
  }
  hideFundingComparison();
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

// The autocomplete rows only change when the year range does, so they are built
// with the index rather than on every keystroke.
function setIndex() {
  index = buildFundingIndex(dataset, filters.startYear, filters.endYear);
  const awardCount = count => `${count} NSF ${count === 1 ? 'award' : 'awards'}`;
  const programs = new Map();
  index.awards.forEach(award => {
    if (award.program) programs.set(award.program, (programs.get(award.program) || 0) + 1);
  });
  suggestionItems = {
    schools: index.schools.map(school => {
      const shortName = getInstitutionShortName(school.name);
      return {
        label: school.name,
        detail: `${awardCount(school.awards.length)} · ${formatFunding(school.attributedAmount)}`,
        searchTerms: shortName === school.name ? '' : shortName
      };
    }),
    faculty: index.faculty.map(record => ({
      label: cleanName(record.name),
      detail: `${record.affiliation || 'Professor'} · ${awardCount(record.awards.length)}`
    })),
    programs: [...programs.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([program, count]) => ({ label: program, detail: `NSF program · ${awardCount(count)}` }))
  };
}

function setupSuggestions(input) {
  return createSuggestionBox({
    input,
    listbox: document.getElementById('universal-suggestions'),
    emptyText: 'No matching NSF funding record',
    getGroups: (query, { comparing }) => {
      if (!suggestionItems) return null;
      const groups = [
        ['Universities', rankSuggestions(suggestionItems.schools, query, SUGGESTION_LIMITS.schools)],
        ['Professors', rankSuggestions(suggestionItems.faculty, query, SUGGESTION_LIMITS.faculty)]
      ];
      // Only universities and people can be compared, so "A vs …" drops programs.
      if (comparing) return groups;
      return [...groups, ['NSF programs', rankSuggestions(suggestionItems.programs, query, SUGGESTION_LIMITS.programs)]];
    },
    onSelect: (item, comparePrefix) => {
      input.value = `${comparePrefix}${item.label}`;
      render(input.value);
    }
  });
}

function rebuild() {
  setIndex();
  render(document.getElementById('funding-search').value);
}

function renderExamples() {
  const examples = document.getElementById('funding-examples');
  const chip = (query, label) =>
    `<button type="button" data-query="${escapeHtml(query)}">${escapeHtml(label)}</button>`;
  // Two best-funded universities that have a short name, so the "A vs B" chip
  // advertising head-to-head mode stays one line — as on Search.
  const abbreviated = index.schools
    .map(school => ({ label: getInstitutionShortName(school.name), query: school.name }))
    .filter(entry => entry.label !== entry.query)
    .slice(0, 2);
  examples.innerHTML = `${index.schools.slice(0, 2).map(record =>
    chip(record.name, record.name)
  ).join('')}${index.faculty.slice(0, 3).map(record =>
    chip(record.name, record.name.replace(/\s+\d{4}$/, ''))
  ).join('')}${abbreviated.length === 2
    ? chip(`${abbreviated[0].query} vs ${abbreviated[1].query}`, `${abbreviated[0].label} vs ${abbreviated[1].label}`)
    : ''}`;
}

async function init() {
  initTooltipPositioning();
  setupYears();
  const response = await fetch('./nsf-awards.json');
  if (!response.ok) throw new Error(`NSF dataset returned ${response.status}`);
  dataset = await response.json();
  setIndex();
  const input = document.getElementById('funding-search');
  input.disabled = false;
  input.placeholder = 'Search university, professor, award, or NSF program';
  input.value = params.get('q') || '';
  setupDataHealth();
  renderExamples();
  render(input.value);
  const suggestionBox = setupSuggestions(input);
  input.addEventListener('input', () => {
    suggestionBox.render(input.value);
    render(input.value);
  });
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
