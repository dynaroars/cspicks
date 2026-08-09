import { filterByYears, loadAffiliationData, loadData } from './data.js';
import { buildPriorPeriodData, calculateDiscoveryInsights } from './metrics.js';
import { areaLabels, escapeHtml, getInstitutionShortName, updateHistoryWarning } from './shared.js';

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
  return `<a class="discovery-school" href="index.html?q=${target}" title="${escapeHtml(name)}" aria-label="Explore ${escapeHtml(name)}">${escapeHtml(shortName)}</a>`;
}

function renderDiscoveries() {
  const container = document.getElementById('discovery-stats');
  const start = Number(document.getElementById('discoveries-start-year').value);
  const end = Number(document.getElementById('discoveries-end-year').value);
  const region = document.getElementById('discoveries-region').value;
  const confSet = document.getElementById('discoveries-conf-set').value;
  const useHistory = document.getElementById('discoveries-history').checked;
  updateHistoryWarning('discoveries-history-warning', useHistory);
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
    <p class="summary-note">Current period: ${start}–${end}. Comparison period: ${priorStart}–${priorEnd}. Select a university to explore its results and analysis.</p>
    <div class="discovery-grid">
      ${card('Biggest rank gains', 'Universities that moved up the most places compared with the preceding equal-length period. Both periods must have an adjusted publication count of at least 2.', list(insights.rankClimbers, item => `
        <span>${schoolLink(item.name)}<small>#${item.prior.rank} → #${item.metrics.rank}</small></span>
        <strong class="confidence-high">+${item.metrics.rankDelta} places</strong>`), 'discovery-featured')}
      ${card('Biggest rank declines', 'Universities that moved down the most places compared with the preceding equal-length period. Both periods must have an adjusted publication count of at least 2.', list(insights.rankDroppers, item => `
        <span>${schoolLink(item.name)}<small>#${item.prior.rank} → #${item.metrics.rank}</small></span>
        <strong class="confidence-review">${item.metrics.rankDelta} places</strong>`), 'discovery-risk')}
      ${card('Fastest-growing output', 'Compares the university\'s adjusted publication count in your selected years with the equally long period immediately before. Example: increasing from 10 to 15 is 50% growth. Both periods must have an adjusted count of at least 2.', list(insights.momentum, item => `
        <span>${schoolLink(item.name)}<small>${number(item.prior.totalAdjusted)} → ${number(item.school.totalAdjusted)} adjusted count</small></span>
        <strong>+${item.metrics.growth.toFixed(0)}%</strong>`), 'discovery-featured')}
      ${card('Fastest-shrinking output', 'Compares the university\'s adjusted publication count in your selected years with the equally long period immediately before. Example: decreasing from 10 to 6 is a 40% decline. Both periods must have an adjusted count of at least 2.', list(insights.slowdowns, item => `
        <span>${schoolLink(item.name)}<small>${number(item.prior.totalAdjusted)} → ${number(item.school.totalAdjusted)} adjusted count</small></span>
        <strong class="confidence-review">${item.metrics.growth.toFixed(0)}%</strong>`), 'discovery-risk')}
      ${card('Largest adjusted-count gains', 'Largest absolute increase in adjusted publication count. This complements percentage growth, which favors smaller starting points.', list(insights.outputGains, item => `
        <span>${schoolLink(item.name)}<small>${number(item.school.totalAdjusted)} current adjusted count</small></span>
        <strong>+${number(item.outputGain)}</strong>`), 'discovery-featured')}
      ${card('Largest adjusted-count losses', 'Largest absolute decrease in adjusted publication count compared with the preceding period.', list(insights.outputLosses, item => `
        <span>${schoolLink(item.name)}<small>${number(item.prior.totalAdjusted)} → ${number(item.school.totalAdjusted)} adjusted count</small></span>
        <strong class="confidence-review">${number(item.outputGain)}</strong>`), 'discovery-risk')}
      ${card('Expanding research breadth', 'Universities adding the most active top-level research areas compared with the preceding period.', list(insights.breadthBuilders, item => `
        <span>${schoolLink(item.name)}<small>${item.metrics.activeAreas} active areas now</small></span>
        <strong>+${item.breadthGain} areas</strong>`), 'discovery-featured')}
      ${card('Shrinking research breadth', 'Universities losing the most active top-level research areas compared with the preceding period.', list(insights.breadthContractions, item => `
        <span>${schoolLink(item.name)}<small>${item.metrics.activeAreas} active areas now</small></span>
        <strong class="confidence-review">${item.breadthGain} areas</strong>`), 'discovery-risk')}
      ${card('Fastest-growing research areas', 'Largest university-and-area increases in adjusted publication count versus the preceding period; the current area adjusted count must be at least 2.', list(insights.areaBreakouts, item => `
        <span>${schoolLink(item.name)}<small>${escapeHtml(areaLabels[item.area] || item.area)} · ${number(item.priorCredit)} → ${number(item.currentCredit)}</small></span>
        <strong>+${number(item.gain)}</strong>`), 'discovery-featured')}
      ${card('Fastest-declining research areas', 'Largest university-and-area decreases in adjusted publication count versus the preceding period; the prior area adjusted count must be at least 2.', list(insights.areaDeclines, item => `
        <span>${schoolLink(item.name)}<small>${escapeHtml(areaLabels[item.area] || item.area)} · ${number(item.priorCredit)} → ${number(item.currentCredit)}</small></span>
        <strong class="confidence-review">${number(item.gain)}</strong>`), 'discovery-risk')}
      ${card('Broad faculty participation', 'Lowest share of adjusted publication count produced by the top three faculty, among universities with an adjusted count of at least 5 and 5 active faculty. Lower means output is distributed across more people.', list(insights.balancedPortfolios, item => `
        <span>${schoolLink(item.name)}<small>${item.metrics.facultyCount} active faculty</small></span>
        <strong>${item.metrics.top3Share.toFixed(0)}% top-3</strong>`), 'discovery-featured')}
      ${card('Regional specializations', 'Areas where a university is much more focused than the selected region overall. The university must also rank in the region\'s top 25 for that area, with a total adjusted count of at least 5, 3 active faculty, and an area adjusted count of at least 2.', list(insights.focusedPowerhouses, item => `
        <span>${schoolLink(item.name)}<small>${escapeHtml(areaLabels[item.focusArea.area] || item.focusArea.area)} · ${item.focusArea.portfolioShare.toFixed(0)}% school vs ${item.focusArea.regionalBaseline.toFixed(0)}% region · #${item.focusArea.areaRank}</small></span>
        <strong>${item.focusArea.specialization.toFixed(1)}× region</strong>`), 'discovery-featured')}
    </div>
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
