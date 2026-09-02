import { filterByYears } from './data.js';
import { applyPerCapitaRanks, buildPriorPeriodData, calculateCorpusDiagnostics, calculateDiscoveryInsights, calculateSubfieldDiscoveries } from './metrics.js';
import { buildFundingIndex, calculateFundingDiscoveries, formatFunding, parseNsfDataset } from './nsf.js';
import { SITE_NAME } from './seo.js';
import { shareUrl } from './share.js';
import { trackDiscoveryShare } from './analytics.js';
import { areaLabels, escapeHtml, getInstitutionShortName } from './shared.js';
import type { FilterController } from './filters.js';
import type { NsfDataset, RawData } from './types.js';

const shareIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const regionLabels: Record<string, string> = {
  world: 'worldwide',
  us: 'US',
  europe: 'European',
  asia: 'Asian',
  canada: 'Canadian',
  australasia: 'Australasian'
};

// Every page that reads or writes the Discoveries URL agrees on this shape:
// the shared filter params plus `view=discoveries`.
export function discoveriesParams(filters: FilterController) {
  const params = filters.toParams();
  params.set('view', 'discoveries');
  return params;
}

// Each card's own shareable URL: current filters plus a fragment that
// scrollToHashDiscovery() below picks up on load, so "share this card" reaches
// the one the reader meant, not just the top of the page.
function discoveryCardUrl(id: string, filters: FilterController) {
  return `${window.location.origin}${window.location.pathname}?${discoveriesParams(filters)}#${id}`;
}

export function getDiscoveriesMeta(filters: FilterController) {
  const region = regionLabels[filters.region] || filters.region;
  return {
    title: `Discoveries: ${filters.startYear}-${filters.endYear} ${region} CS trends - ${SITE_NAME}`,
    description: `Notable, reproducible patterns in ${region} CS research from ${filters.startYear} to ${filters.endYear}: fastest-growing subfields, departments on the rise, funding trends, and more.`
  };
}

export async function fetchDiscoveriesNsfData() {
  const response = await fetch('./nsf-awards.json');
  if (!response.ok) throw new Error(`NSF dataset returned ${response.status}`);
  return parseNsfDataset(await response.json());
}

// One flash for whichever share button was just clicked, matching the label
// swap createShareButton uses elsewhere, so all "Copy link" controls behave
// identically regardless of which page rendered them.
const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function flashShareButton(button: HTMLElement, message: string) {
  const original = button.getAttribute('title');
  button.setAttribute('title', message);
  button.classList.add('is-flashed');
  clearTimeout(flashTimers.get(button));
  flashTimers.set(button, setTimeout(() => {
    if (original === null) button.removeAttribute('title');
    else button.setAttribute('title', original);
    button.classList.remove('is-flashed');
  }, 1800));
}

export function scrollToHashDiscovery() {
  const id = window.location.hash.slice(1);
  if (!id) return;
  const card = document.getElementById(id);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('discovery-highlighted');
  setTimeout(() => card.classList.remove('discovery-highlighted'), 2200);
}

function schoolLink(name: string) {
  const shortName = getInstitutionShortName(name);
  const target = encodeURIComponent(name);
  return `<a class="discovery-school" href="index.html?q=${target}" title="${escapeHtml(name)}" aria-label="Explore ${escapeHtml(name)}">${escapeHtml(shortName)}</a>`;
}

function fundingSchoolLink(name: string) {
  return `<a class="discovery-school" href="nsf.html?q=${encodeURIComponent(name)}" title="Explore NSF funding for ${escapeHtml(name)}">${escapeHtml(getInstitutionShortName(name))}</a>`;
}

function areaLink(area: string) {
  const label = areaLabels[area] || area;
  return `<a class="discovery-school" href="index.html?q=${encodeURIComponent(label)}" title="Explore ${escapeHtml(label)}">${escapeHtml(label)}</a>`;
}

export function renderDiscoveries(rawData: RawData, filters: FilterController, nsfData: NsfDataset) {
  const container = document.getElementById('discovery-stats');
  if (!container || !rawData || !nsfData) return;
  const { startYear: start, endYear: end, region, confSet, historyMap: history, aliasMap: aliases } = filters;

  if (start > end) {
    container.innerHTML = '<p class="data-caveat">The start year must not be later than the end year.</p>';
    return;
  }

  const current = filterByYears(rawData, start, end, region, history, aliases, confSet);
  const prior = buildPriorPeriodData(rawData, start, end, region, history, aliases, confSet);
  // Matches Search's Per capita toggle: rank-based insights (climbers,
  // droppers, and any area-rank guard) read `school.rank`, so re-ranking it
  // here by output-per-faculty is enough to carry the setting through
  // unchanged — same rule, same excluded small departments, no separate path.
  if (filters.perCapita) {
    applyPerCapitaRanks(current);
    applyPerCapitaRanks(prior);
  }
  const insights = calculateDiscoveryInsights(current, prior);
  const subfields = calculateSubfieldDiscoveries(current, prior);
  const corpusDiag = calculateCorpusDiagnostics(rawData, current);
  const topAreaName = corpusDiag.topArea ? (areaLabels[corpusDiag.topArea.key] || corpusDiag.topArea.key) : 'None';
  const span = end - start + 1;
  const priorStart = start - span;
  const priorEnd = start - 1;
  const number = (value: unknown) => Number(value || 0).toFixed(1);
  const empty = '<p class="discovery-empty">No university met the minimum evidence threshold.</p>';
  const emptySubfield = '<p class="discovery-empty">No subfield met the minimum evidence threshold.</p>';
  const list = <T>(items: T[], row: (item: T) => string, emptyText = empty) => items.length
    ? `<ol class="discovery-list">${items.map((item, index) => `<li><span class="discovery-position">${index + 1}</span>${row(item)}</li>`).join('')}</ol>`
    : emptyText;
  const card = (title: string, help: string, body: string, className = '') => {
    const id = `discovery-${slugify(title)}`;
    return `
    <section class="discovery-card ${className}" id="${id}">
      <h3>${escapeHtml(title)} <span class="tooltip-trigger discovery-info" tabindex="0" aria-label="About ${escapeHtml(title)}">ⓘ<span class="tooltip-content">${escapeHtml(help)}</span></span>
        <button type="button" class="share-button discovery-share" data-share-id="${id}" data-share-title="${escapeHtml(title)}" aria-label="Copy link to ${escapeHtml(title)}" title="Copy link">${shareIcon}</button>
      </h3>
      ${body}
    </section>`;
  };
  const funding = buildFundingIndex(nsfData, start, end);
  const priorFunding = buildFundingIndex(nsfData, priorStart, priorEnd);
  const fundingInsights = calculateFundingDiscoveries(funding, priorFunding, current.schools);
  const fundingList = <T>(items: T[], row: (item: T) => string) => items.length
    ? `<ol class="discovery-list">${items.map((item, index) => `<li><span class="discovery-position">${index + 1}</span>${row(item)}</li>`).join('')}</ol>`
    : empty;

  container.innerHTML = `
    <h2>Notable patterns across ${escapeHtml(regionLabels[region] || region)} universities</h2>
    <p class="summary-note">Current period: ${start}–${end}. Comparison period: ${priorStart}–${priorEnd}. Select a university to explore its results and analysis.</p>
    <div class="discovery-grid">
      ${card('Biggest rank gains', 'Universities that moved up the most places compared with the preceding equal-length period. Both periods must have an adjusted publication count of at least 2.', list(insights.rankClimbers, item => `
        <span>${schoolLink(item.name)}<small>#${item.prior!.rank} → #${item.metrics.rank}</small></span>
        <strong class="confidence-high">+${item.metrics.rankDelta} places</strong>`), 'discovery-featured')}
      ${card('Biggest rank declines', 'Universities that moved down the most places compared with the preceding equal-length period. Both periods must have an adjusted publication count of at least 2.', list(insights.rankDroppers, item => `
        <span>${schoolLink(item.name)}<small>#${item.prior!.rank} → #${item.metrics.rank}</small></span>
        <strong class="confidence-review">${item.metrics.rankDelta} places</strong>`), 'discovery-risk')}
      ${card('Fastest-growing output', 'Compares the university\'s adjusted publication count in your selected years with the equally long period immediately before. Example: increasing from 10 to 15 is 50% growth. Both periods must have an adjusted count of at least 2.', list(insights.momentum, item => `
        <span>${schoolLink(item.name)}<small>${number(item.prior!.totalAdjusted)} → ${number(item.school.totalAdjusted)} adjusted count</small></span>
        <strong>+${item.metrics.growth.toFixed(0)}%</strong>`), 'discovery-featured')}
      ${card('Fastest-shrinking output', 'Compares the university\'s adjusted publication count in your selected years with the equally long period immediately before. Example: decreasing from 10 to 6 is a 40% decline. Both periods must have an adjusted count of at least 2.', list(insights.slowdowns, item => `
        <span>${schoolLink(item.name)}<small>${number(item.prior!.totalAdjusted)} → ${number(item.school.totalAdjusted)} adjusted count</small></span>
        <strong class="confidence-review">${item.metrics.growth.toFixed(0)}%</strong>`), 'discovery-risk')}
      ${card('Largest adjusted-count gains', 'Largest absolute increase in adjusted publication count. This complements percentage growth, which favors smaller starting points.', list(insights.outputGains, item => `
        <span>${schoolLink(item.name)}<small>${number(item.school.totalAdjusted)} current adjusted count</small></span>
        <strong>+${number(item.outputGain)}</strong>`), 'discovery-featured')}
      ${card('Largest adjusted-count losses', 'Largest absolute decrease in adjusted publication count compared with the preceding period.', list(insights.outputLosses, item => `
        <span>${schoolLink(item.name)}<small>${number(item.prior!.totalAdjusted)} → ${number(item.school.totalAdjusted)} adjusted count</small></span>
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
        <span>${schoolLink(item.name)}<small>${escapeHtml(areaLabels[item.focusArea!.area] || item.focusArea!.area)} · ${item.focusArea!.portfolioShare.toFixed(0)}% school vs ${item.focusArea!.regionalBaseline.toFixed(0)}% region · #${item.focusArea!.areaRank}</small></span>
        <strong>${item.focusArea!.specialization.toFixed(1)}× region</strong>`), 'discovery-featured')}
    </div>
    <h2 class="discovery-section-heading">Notable patterns across subfields</h2>
    <p class="summary-note">Region-wide, not per university: how each research area itself is growing, shrinking, spreading across more departments, or changing leaders.</p>
    <div class="discovery-grid">
      ${card('Fastest-growing subfields', 'Largest percentage increase in region-wide adjusted output versus the preceding equal-length period. Both periods must have an adjusted count of at least 2.', list(subfields.growth, item => `
        <span>${areaLink(item.area)}<small>${number(item.priorTotal)} → ${number(item.currentTotal)} adjusted count</small></span>
        <strong>+${item.growth.toFixed(0)}%</strong>`, emptySubfield), 'discovery-featured')}
      ${card('Fastest-shrinking subfields', 'Largest percentage decrease in region-wide adjusted output versus the preceding equal-length period. Both periods must have an adjusted count of at least 2.', list(subfields.decline, item => `
        <span>${areaLink(item.area)}<small>${number(item.priorTotal)} → ${number(item.currentTotal)} adjusted count</small></span>
        <strong class="confidence-review">${item.growth.toFixed(0)}%</strong>`, emptySubfield), 'discovery-risk')}
      ${card('Subfields spreading to more departments', 'Largest increase in the number of universities with active output in this area versus the preceding period, among subfields with at least 3 active universities before.', list(subfields.expandingReach, item => `
        <span>${areaLink(item.area)}<small>${item.priorSchoolCount} → ${item.schoolCount} universities</small></span>
        <strong>+${item.schoolGain}</strong>`, emptySubfield), 'discovery-featured')}
      ${card('Subfields consolidating', 'Largest decrease in the number of universities with active output in this area versus the preceding period, among subfields with at least 3 active universities before.', list(subfields.narrowingReach, item => `
        <span>${areaLink(item.area)}<small>${item.priorSchoolCount} → ${item.schoolCount} universities</small></span>
        <strong class="confidence-review">${item.schoolGain}</strong>`, emptySubfield), 'discovery-risk')}
      ${card('Changing of the guard', 'Subfields whose single leading university (by area adjusted count) differs from the preceding period. Both periods must have an area adjusted count of at least 2 for the subfield overall.', list(subfields.leadershipChanges, item => `
        <span>${areaLink(item.area)}<small>${escapeHtml(getInstitutionShortName(item.formerLeader!))} → ${escapeHtml(getInstitutionShortName(item.newLeader!))}</small></span>
        <strong>new leader</strong>`, emptySubfield), 'discovery-featured discovery-wide')}
    </div>
    <h2 class="discovery-section-heading">Research diversity, concentration & collaboration</h2>
    <p class="summary-note">Macro field entropy across 26 subfields, publication inequality among faculty, and interdisciplinary collaboration depth for ${start}–${end}.</p>
    <div class="discovery-grid">
      ${card(
        'Research field diversity (Shannon Entropy)',
        'Shannon Entropy measures how evenly research output is distributed across all 26 computer science subfields. Higher entropy (closer to 100% uniformity) means research is well-balanced across Systems, AI, Theory, and Applications, rather than heavily dominated by a single discipline.',
        `<span>${corpusDiag.entropy.toFixed(2)} nats · ${corpusDiag.normalizedEntropy.toFixed(0)}% uniformity<small>Across 26 computer science subfields</small></span><strong class="${corpusDiag.normalizedEntropy >= 80 ? 'confidence-high' : ''}">${corpusDiag.normalizedEntropy >= 80 ? 'Well Balanced' : 'Field Skewed'}</strong>`,
        'discovery-featured'
      )}
      ${card(
        'Field concentration index (HHI)',
        'The Herfindahl–Hirschman Index (HHI) measures concentration among research areas. Scores under 1,500 indicate a diversified spread across subfields; scores above 2,500 indicate high concentration in a few dominant subfields.',
        `<span>HHI: ${corpusDiag.hhi.toLocaleString()} index<small>Dominant subfield: ${escapeHtml(topAreaName)} (${corpusDiag.topArea ? corpusDiag.topArea.share.toFixed(1) : '0'}% of output)</small></span><strong class="${corpusDiag.hhi < 1500 ? 'confidence-high' : 'confidence-review'}">${corpusDiag.hhi < 1500 ? 'Diversified' : 'Concentrated'}</strong>`,
        'discovery-featured'
      )}
      ${card(
        'Faculty output distribution (Gini)',
        'The Gini coefficient measures inequality of publication output among active faculty (0 = perfect equality where every professor published the same amount; 1 = maximum inequality where one person produced everything). Academic CS typically ranges between 0.45 and 0.60.',
        `<span>Gini: ${corpusDiag.gini.toFixed(2)}<small>Top 10% faculty authored ${corpusDiag.top10Concentration.toFixed(0)}% of adjusted output</small></span><strong>${corpusDiag.top10Concentration.toFixed(0)}% top-10% share</strong>`,
        'discovery-featured'
      )}
      ${card(
        'Cross-disciplinary bridge researchers',
        'The percentage of active professors who published papers across two or more distinct subfields in this period, reflecting interdisciplinary breadth and cross-area research connectivity.',
        `<span>${corpusDiag.bridgeRatio.toFixed(0)}% cross-field faculty<small>Average team depth: ${corpusDiag.coauthorshipDepth.toFixed(1)} authors per publication</small></span><strong class="confidence-high">${corpusDiag.activeFacultyCount.toLocaleString()} active faculty</strong>`,
        'discovery-featured'
      )}
    </div>
    ${(region === 'us' || region === 'world') ? `
      <h2 class="discovery-section-heading">NSF funding patterns across US universities</h2>
      <p class="summary-note">These include only awards attached to matched current US CS faculty—not every NSF award at each university. Dollar attribution remains local even when a matched faculty member’s collaborative project spans several institutions.</p>
      <div class="discovery-grid">
        ${card('Largest attributed NSF portfolios', 'Universities with the most intended NSF funding attributed to matched current CS faculty in the selected years.', fundingList(fundingInsights.topFunding, school => `
          <span>${fundingSchoolLink(school.name)}<small>${school.awards.length} matched awards</small></span><strong>${formatFunding(school.attributedAmount)}</strong>`), 'discovery-featured')}
        ${card('Fastest-growing NSF funding', 'Largest percentage increases in attributed NSF funding versus the preceding equal-length period. Both periods must contain at least $100,000.', fundingList(fundingInsights.fastestGrowth, item => `
          <span>${fundingSchoolLink(item.school.name)}<small>${formatFunding(item.priorAmount)} → ${formatFunding(item.school.attributedAmount)}</small></span><strong>+${item.growth!.toFixed(0)}%</strong>`), 'discovery-featured')}
        ${card('Fastest-declining NSF funding', 'Largest percentage decreases in attributed NSF funding versus the preceding equal-length period. Both periods must contain at least $100,000.', fundingList(fundingInsights.fastestDecline, item => `
          <span>${fundingSchoolLink(item.school.name)}<small>${formatFunding(item.priorAmount)} → ${formatFunding(item.school.attributedAmount)}</small></span><strong class="confidence-review">${item.growth!.toFixed(0)}%</strong>`), 'discovery-risk')}
        ${card('Broadest funded participation', 'Universities with the most distinct current-roster faculty matched to NSF awards in the selected years.', fundingList(fundingInsights.broadParticipation, school => `
          <span>${fundingSchoolLink(school.name)}<small>${formatFunding(school.attributedAmount)} attributed</small></span><strong>${school.faculty.length} faculty</strong>`), 'discovery-featured')}
        ${card('Funding rank ahead of publication rank', 'Universities whose rank by attributed NSF funding is substantially stronger than their publication rank. This is a descriptive mismatch, not a quality judgment.', fundingList(fundingInsights.fundingAhead, item => `
          <span>${fundingSchoolLink(item.school.name)}<small>funding #${item.fundingRank} · publications #${item.publicationRank}</small></span><strong>+${item.gap} places</strong>`), 'discovery-featured')}
        ${card('Publication rank ahead of funding rank', 'Universities whose publication rank is substantially stronger than their rank by matched attributed NSF funding. Missing matches can affect this comparison.', fundingList(fundingInsights.publicationsAhead, item => `
          <span>${fundingSchoolLink(item.school.name)}<small>publications #${item.publicationRank} · funding #${item.fundingRank}</small></span><strong>${Math.abs(item.gap)} places</strong>`), 'discovery-risk')}
        ${card('Largest matched collaborative projects', 'Largest full project values involving at least one matched current CS professor, reconstructed from exact-title NSF sibling awards. Other project portions can belong to collaborators outside the roster; transfer records for the same lead investigator count only once.', fundingList(fundingInsights.largestCollaborations, award => `
          <span><a class="discovery-school" href="nsf.html?q=${encodeURIComponent(award.title)}" title="Explore this collaborative project">${escapeHtml(award.title.replace(/^Collaborative (?:Research|Resaerch):\s*/i, ''))}</a><small>${award.collaborativeAwardCount} institutional portions</small></span><strong>${formatFunding(award.collaborativeTotalAmount || 0)}</strong>`), 'discovery-featured discovery-wide')}
      </div>` : ''}
  `;
}

export function setupCardSharing(filters: FilterController) {
  document.getElementById('discovery-stats')?.addEventListener('click', async event => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-share-id]')
      : null;
    if (!button) return;
    const shareId = button.dataset.shareId || '';
    const shareTitle = button.dataset.shareTitle || '';
    const outcome = await shareUrl(discoveryCardUrl(shareId, filters), {
      title: `${shareTitle} - CS Picks Discoveries`,
      text: shareTitle
    });
    if (outcome === 'copied') flashShareButton(button, 'Copied!');
    else if (outcome === 'failed') flashShareButton(button, 'Copy failed');
    trackDiscoveryShare(shareId);
  });
}
