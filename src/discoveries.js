import { filterByYears, loadAffiliationData, loadData } from './data.js';
import { buildPriorPeriodData, calculateDiscoveryInsights } from './metrics.js';
import { areaLabels, escapeHtml, getInstitutionShortName } from './shared.js';

let rawData = null;
let affiliationHistory = null;
let schoolAliases = null;

const regionLabels = {
  world: 'worldwide',
  us: 'US',
  europe: 'European',
  asia: 'Asian',
  canada: 'Canadian',
  australasia: 'Australasian'
};

function setupYearSelectors() {
  const start = document.getElementById('discoveries-start-year');
  const end = document.getElementById('discoveries-end-year');
  const currentYear = new Date().getFullYear();
  for (let year = 2000; year <= currentYear; year++) {
    start.insertAdjacentHTML('beforeend', `<option value="${year}" ${year === currentYear - 10 ? 'selected' : ''}>${year}</option>`);
    end.insertAdjacentHTML('beforeend', `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`);
  }
}

async function ensureHistoricalData() {
  if (affiliationHistory !== null && schoolAliases !== null) return;
  const data = await loadAffiliationData();
  affiliationHistory = data.historyMap;
  schoolAliases = data.aliasMap;
}

function schoolLink(name) {
  const shortName = getInstitutionShortName(name);
  const target = encodeURIComponent(name);
  return `<a class="discovery-school" href="analysis.html?target=${target}" title="${escapeHtml(name)}" aria-label="Analyze ${escapeHtml(name)}">${escapeHtml(shortName)}</a>`;
}

function renderDiscoveries() {
  const container = document.getElementById('discovery-stats');
  const start = Number(document.getElementById('discoveries-start-year').value);
  const end = Number(document.getElementById('discoveries-end-year').value);
  const region = document.getElementById('discoveries-region').value;
  const confSet = document.getElementById('discoveries-conf-set').value;
  const useHistory = document.getElementById('discoveries-history').checked;
  const history = useHistory ? affiliationHistory : null;
  const aliases = useHistory ? schoolAliases : null;

  if (start > end) {
    container.innerHTML = '<p class="data-caveat">The start year must not be later than the end year.</p>';
    return;
  }

  const current = filterByYears(rawData, start, end, region, history, aliases, confSet);
  const prior = buildPriorPeriodData(rawData, start, end, region, history, aliases, confSet);
  const insights = calculateDiscoveryInsights(current, prior);
  const span = end - start + 1;
  const priorStart = start - span;
  const priorEnd = start - 1;
  const number = value => Number(value || 0).toFixed(1);
  const empty = '<p class="discovery-empty">No university met the minimum evidence threshold.</p>';
  const list = (items, row) => items.length
    ? `<ol class="discovery-list">${items.map((item, index) => `<li><span class="discovery-position">${index + 1}</span>${row(item)}</li>`).join('')}</ol>`
    : empty;
  const card = (title, help, body, className = '') => `
    <section class="discovery-card ${className}">
      <h3>${escapeHtml(title)} <span class="tooltip-trigger discovery-info" tabindex="0" aria-label="About ${escapeHtml(title)}">ⓘ<span class="tooltip-content">${escapeHtml(help)}</span></span></h3>
      ${body}
    </section>`;

  container.innerHTML = `
    <h2>Notable patterns across ${escapeHtml(regionLabels[region] || region)} universities</h2>
    <p class="summary-note">Current period: ${start}–${end}. Comparison period: ${priorStart}–${priorEnd}. Select a university to explore it in Analysis.</p>
    <div class="discovery-grid">
      ${card('Fastest rank climbers', 'Change in overall rank relative to the preceding equal-length period. Both periods must contain at least 2 fractional publication credits.', list(insights.rankClimbers, item => `
        <span>${schoolLink(item.name)}<small>#${item.prior.rank} → #${item.metrics.rank}</small></span>
        <strong class="confidence-high">+${item.metrics.rankDelta} places</strong>`), 'discovery-featured')}
      ${card('Strongest momentum', 'Largest percentage increase in fractional publication credit versus the preceding period, requiring at least 2 credits in both periods.', list(insights.momentum, item => `
        <span>${schoolLink(item.name)}<small>${number(item.prior.totalAdjusted)} → ${number(item.school.totalAdjusted)} credits</small></span>
        <strong>+${item.metrics.growth.toFixed(0)}%</strong>`), 'discovery-featured')}
      ${card('Largest output gains', 'Largest absolute increase in fractional publication credit. This complements percentage momentum, which favors smaller starting points.', list(insights.outputGains, item => `
        <span>${schoolLink(item.name)}<small>${number(item.school.totalAdjusted)} current credits</small></span>
        <strong>+${number(item.outputGain)}</strong>`))}
      ${card('Breadth builders', 'Universities adding the most active top-level research areas compared with the preceding period.', list(insights.breadthBuilders, item => `
        <span>${schoolLink(item.name)}<small>${item.metrics.activeAreas} active areas now</small></span>
        <strong>+${item.breadthGain} areas</strong>`))}
      ${card('Most distributed portfolios', 'Lowest share of output produced by the top three faculty, among universities with at least 5 credits and 3 active faculty. Lower means output is less dependent on a few people.', list(insights.balancedPortfolios, item => `
        <span>${schoolLink(item.name)}<small>${item.metrics.facultyCount} active faculty</small></span>
        <strong>${item.metrics.top3Share.toFixed(0)}% top-3</strong>`))}
      ${card('Focused powerhouses', 'Highest share of a university\'s output concentrated in one research area, among universities with at least 5 credits and 3 active faculty.', list(insights.focusedPowerhouses, item => `
        <span>${schoolLink(item.name)}<small>${escapeHtml(areaLabels[item.topArea.area] || item.topArea.area)}</small></span>
        <strong>${item.topAreaShare.toFixed(0)}%</strong>`))}
      ${card('Breakout research areas', 'Largest university-and-area increases in fractional publication credit versus the preceding period; current area output must be at least 2 credits.', list(insights.areaBreakouts, item => `
        <span>${schoolLink(item.name)}<small>${escapeHtml(areaLabels[item.area] || item.area)} · ${number(item.priorCredit)} → ${number(item.currentCredit)}</small></span>
        <strong>+${number(item.gain)}</strong>`), 'discovery-wide')}
    </div>
    <div class="data-caveat"><strong>Interpret carefully:</strong> these are descriptive signals, not measures of department quality or causal claims. Results change with the selected years, region, venues, and historical-affiliation setting.</div>
  `;
}

async function refresh() {
  const historyToggle = document.getElementById('discoveries-history');
  const container = document.getElementById('discovery-stats');
  try {
    if (historyToggle.checked) {
      historyToggle.disabled = true;
      await ensureHistoricalData();
    }
    renderDiscoveries();
  } catch (error) {
    console.error('Failed to load historical affiliation data:', error);
    historyToggle.checked = false;
    container.innerHTML = '<p class="data-caveat">Historical affiliation data could not be loaded. Showing current affiliations instead.</p>';
    renderDiscoveries();
  } finally {
    historyToggle.disabled = false;
  }
}

async function init() {
  setupYearSelectors();
  rawData = await loadData();
  document.getElementById('discoveries-loading').classList.add('hidden');
  document.getElementById('discovery-stats').classList.remove('hidden');
  document.querySelectorAll('.discoveries-filters select, #discoveries-history').forEach(control => {
    control.addEventListener('change', refresh);
  });
  renderDiscoveries();
}

init().catch(error => {
  console.error('Discoveries load error:', error);
  document.getElementById('discoveries-loading').textContent = 'Could not load discovery data.';
});
