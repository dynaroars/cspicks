import { filterByYears, loadAffiliationData, loadData } from './data.js';
import { buildPriorPeriodData, calculateDiscoveryInsights } from './metrics.js';
import { buildFundingIndex, calculateFundingDiscoveries, formatFunding } from './nsf.js';
import { areaLabels, escapeHtml, getInitialRegion, getInstitutionShortName, rememberRegion } from './shared.js';

let rawData = null;
let affiliationHistory = null;
let schoolAliases = null;
let nsfData = null;

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

function fundingSchoolLink(name) {
  return `<a class="discovery-school" href="funding.html?q=${encodeURIComponent(name)}" title="Explore NSF funding for ${escapeHtml(name)}">${escapeHtml(getInstitutionShortName(name))}</a>`;
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
  const funding = buildFundingIndex(nsfData, start, end);
  const priorFunding = buildFundingIndex(nsfData, priorStart, priorEnd);
  const fundingInsights = calculateFundingDiscoveries(funding, priorFunding, current.schools);
  const fundingList = (items, row) => items.length
    ? `<ol class="discovery-list">${items.map((item, index) => `<li><span class="discovery-position">${index + 1}</span>${row(item)}</li>`).join('')}</ol>`
    : empty;

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
    ${(region === 'us' || region === 'world') ? `
      <h2 class="discovery-section-heading">NSF funding patterns across US universities</h2>
      <p class="summary-note">These include only awards attached to matched current US CSRankings faculty—not every NSF award at each university. Dollar attribution remains local even when a matched faculty member’s collaborative project spans several institutions.</p>
      <div class="discovery-grid">
        ${card('Largest attributed NSF portfolios', 'Universities with the most intended NSF funding attributed to matched current CSRankings faculty in the selected years.', fundingList(fundingInsights.topFunding, school => `
          <span>${fundingSchoolLink(school.name)}<small>${school.awards.length} matched awards</small></span><strong>${formatFunding(school.attributedAmount)}</strong>`), 'discovery-featured')}
        ${card('Fastest-growing NSF funding', 'Largest percentage increases in attributed NSF funding versus the preceding equal-length period. Both periods must contain at least $100,000.', fundingList(fundingInsights.fastestGrowth, item => `
          <span>${fundingSchoolLink(item.school.name)}<small>${formatFunding(item.priorAmount)} → ${formatFunding(item.school.attributedAmount)}</small></span><strong>+${item.growth.toFixed(0)}%</strong>`), 'discovery-featured')}
        ${card('Fastest-declining NSF funding', 'Largest percentage decreases in attributed NSF funding versus the preceding equal-length period. Both periods must contain at least $100,000.', fundingList(fundingInsights.fastestDecline, item => `
          <span>${fundingSchoolLink(item.school.name)}<small>${formatFunding(item.priorAmount)} → ${formatFunding(item.school.attributedAmount)}</small></span><strong class="confidence-review">${item.growth.toFixed(0)}%</strong>`), 'discovery-risk')}
        ${card('Broadest funded participation', 'Universities with the most distinct current-roster faculty matched to NSF awards in the selected years.', fundingList(fundingInsights.broadParticipation, school => `
          <span>${fundingSchoolLink(school.name)}<small>${formatFunding(school.attributedAmount)} attributed</small></span><strong>${school.faculty.length} faculty</strong>`), 'discovery-featured')}
        ${card('Funding rank ahead of publication rank', 'Universities whose rank by attributed NSF funding is substantially stronger than their CSRankings-style publication rank. This is a descriptive mismatch, not a quality judgment.', fundingList(fundingInsights.fundingAhead, item => `
          <span>${fundingSchoolLink(item.school.name)}<small>funding #${item.fundingRank} · publications #${item.publicationRank}</small></span><strong>+${item.gap} places</strong>`), 'discovery-featured')}
        ${card('Publication rank ahead of funding rank', 'Universities whose CSRankings-style publication rank is substantially stronger than their rank by matched attributed NSF funding. Missing matches can affect this comparison.', fundingList(fundingInsights.publicationsAhead, item => `
          <span>${fundingSchoolLink(item.school.name)}<small>publications #${item.publicationRank} · funding #${item.fundingRank}</small></span><strong>${Math.abs(item.gap)} places</strong>`), 'discovery-risk')}
        ${card('Largest matched collaborative projects', 'Largest full project values involving at least one matched current CSRankings professor, reconstructed from exact-title NSF sibling awards. Other project portions can belong to collaborators outside the roster; transfer records for the same lead investigator count only once.', fundingList(fundingInsights.largestCollaborations, award => `
          <span><a class="discovery-school" href="funding.html?q=${encodeURIComponent(award.title)}" title="Explore this collaborative project">${escapeHtml(award.title.replace(/^Collaborative (?:Research|Resaerch):\s*/i, ''))}</a><small>${award.collaborativeAwardCount} institutional portions</small></span><strong>${formatFunding(award.collaborativeTotalAmount)}</strong>`), 'discovery-featured discovery-wide')}
      </div>` : ''}
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
  const regionSelect = document.getElementById('discoveries-region');
  regionSelect.value = getInitialRegion();
  regionSelect.addEventListener('change', () => rememberRegion(regionSelect.value));
  const [loadedData, nsfResponse] = await Promise.all([loadData(), fetch('./nsf-awards.json')]);
  if (!nsfResponse.ok) throw new Error(`NSF dataset returned ${nsfResponse.status}`);
  rawData = loadedData;
  nsfData = await nsfResponse.json();
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
