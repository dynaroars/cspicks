import { isPubAtSchool, renderAreaTrends, renderConferenceFilters, renderConferenceTrends, renderFacultyTrends, renderSchoolTrends, renderSubfieldEffort, setupConferenceFilterButtons } from './analysis-trends.js';
import { onThemeChange } from './charts.js';
import bundledRules from './csrankings-rules.generated.js';
import { syncCsrankingsRules } from './csrankings-rules.js';
import { filterByYears, getConferenceAreaMap } from './data.js';
import { fetchFrequentCoauthors } from './dblp.js';
import { applyPerCapitaRanks, buildPriorPeriodData, calculateAreaMomentum, calculateFragility, calculateParityReport, calculateResearcherPatterns, calculateSchoolMetrics, collectVariantRanks, rankStabilityVariants, summarizeRankStability } from './metrics.js';
import { areaLabels, cleanName, escapeHtml, fetchLatestRepoCommit, formatRelativeTime, getConferenceLabel, getInstitutionShortName } from './shared.js';
import type { Chart } from './charts.js';
import type { CsrankingsRules } from './csrankings-rules.js';
import type { ConferenceSetId } from './data/conference-sets.js';
import type { FilterController } from './filters.js';
import type { RankStabilitySample } from './metrics.js';
import type { Professor, Publication, RawData } from './types.js';

export interface AnalysisTarget {
  type: 'school' | 'researcher';
  name: string;
}

interface AnalysisState {
  rawData: RawData;
  filters: FilterController;
  chartInstance: Chart | null;
  currentTab: string;
  selectedTarget: AnalysisTarget | null;
  activeVenueRules: CsrankingsRules;
  venueRulesCheckedAt: Date | null;
  conferenceFilterContext: string | null;
  analysisReady: boolean;
}

export const state: AnalysisState = {
  rawData: { professors: {}, schools: {} },
  filters: null!,
  chartInstance: null,
  currentTab: 'schools',
  selectedTarget: null,
  activeVenueRules: bundledRules as CsrankingsRules,
  venueRulesCheckedAt: null,
  conferenceFilterContext: null,
  analysisReady: false
};

interface MetricCard {
  label: string;
  value: string | number;
  help?: string;
  className?: string;
  detail?: string;
}

function metricLabel(label: string, help?: string) {
  if (!help) return `<span>${escapeHtml(label)}</span>`;
  return `<span class="metric-label-row">
    <span class="metric-label">${escapeHtml(label)}</span>
    <span class="tooltip-trigger metric-info" tabindex="0" aria-label="About ${escapeHtml(label)}">ⓘ
      <span class="tooltip-content">${escapeHtml(help)}</span>
    </span>
  </span>`;
}

export function renderMetricCards(metrics: MetricCard[], ariaLabel = 'Statistics') {
  return `<div class="school-metrics analysis-school-metrics" aria-label="${escapeHtml(ariaLabel)}">
    ${metrics.map(metric => `<div class="school-metric">
      ${metricLabel(metric.label, metric.help)}
      <strong${metric.className ? ` class="${escapeHtml(metric.className)}"` : ''}>${escapeHtml(metric.value)}</strong>
      ${metric.detail ? `<small>${escapeHtml(metric.detail)}</small>` : ''}
    </div>`).join('')}
  </div>`;
}

function renderInsightList(insights: string[] | null | undefined, title = 'Notable patterns', rawHtml = false) {
  if (!insights?.length) return '';
  return `<section class="analysis-insights">
    <h3>${escapeHtml(title)}</h3>
    <ul>${insights.map(insight => `<li>${rawHtml ? insight : escapeHtml(insight)}</li>`).join('')}</ul>
  </section>`;
}

type ResearcherPatterns = NonNullable<ReturnType<typeof calculateResearcherPatterns>>;
type FrequentCoauthors = Awaited<ReturnType<typeof fetchFrequentCoauthors>>;

function refreshActiveTabChart() {
    if (!state.selectedTarget) return;
    renderResearcherHighlights();
    if (state.currentTab === 'schools') renderSchoolTrends();
    else if (state.currentTab === 'areas') renderAreaTrends();
    else if (state.currentTab === 'faculty') renderFacultyTrends();
    else if (state.currentTab === 'effort') renderSubfieldEffort();
    else if (state.currentTab === 'conf-trends') renderConferenceTrends();
    else if (state.currentTab === 'collaboration') renderCollaborationStats();
    else if (state.currentTab === 'stability') renderRankStability();
}

onThemeChange(refreshActiveTabChart);


// Called once by the Search page, which owns the data load and the filter bar.
export async function initAnalysis(data: RawData, filterBar: FilterController) {
    state.rawData = data;
    state.filters = filterBar;
    try {
        state.activeVenueRules = await syncCsrankingsRules();
        state.venueRulesCheckedAt = new Date();

        renderConferenceFilters();
        setupTabs();
        document.getElementById('integrated-analysis')?.addEventListener('toggle', () => {
            const panel = document.querySelector<HTMLDetailsElement>('#integrated-analysis');
            if (panel?.open && state.selectedTarget) showSelectedTarget();
        });
        setupConferenceFilterButtons();
        state.analysisReady = true;
        if (new URLSearchParams(window.location.search).get('dataHealth') === 'true') {
            revealDataHealth();
        } else if (!document.getElementById('site-data-health')?.hidden) {
            renderDataHealth();
        }
        if (state.selectedTarget) showSelectedTarget();
        else showTargetPrompt();
    } catch (err) {
        console.error('Analysis load error:', err);
    }
}

function updateTargetMode() {
    const researcherMode = state.selectedTarget?.type === 'researcher';
    document.body.classList.toggle('researcher-analysis', researcherMode);
    document.querySelectorAll<HTMLElement>('[data-school-only]').forEach(tab => {
        tab.style.display = researcherMode ? 'none' : 'inline-flex';
    });
    const activeTab = document.querySelector(`.nav-tab[data-tab="${state.currentTab}"]`);
    const incompatible = researcherMode && activeTab?.hasAttribute('data-school-only');
    if (incompatible) {
        document.querySelector<HTMLElement>('.nav-tab[data-tab="schools"]')?.click();
    }
}

export function getTargetName() {
    return state.selectedTarget?.name || '';
}

export function isPublicationForTarget(prof: Professor, pub: Publication) {
    if (!state.selectedTarget) return false;
    if (state.selectedTarget.type === 'researcher') return prof.name === state.selectedTarget.name;
    return isPubAtSchool(prof, pub, state.selectedTarget.name);
}

function showTargetPrompt() {
    state.chartInstance?.destroy();
    state.chartInstance = null;
    document.querySelectorAll<HTMLElement>('.view-section').forEach(view => { view.hidden = true; });
    const integratedSection = document.getElementById('integrated-analysis');
    if (integratedSection) integratedSection.hidden = true;
    const highlights = document.getElementById('researcher-highlights');
    if (highlights) highlights.hidden = true;
}

function showSelectedTarget() {
    const integratedSection = document.getElementById('integrated-analysis');
    if (integratedSection) {
        integratedSection.hidden = false;
        const summary = integratedSection.querySelector(':scope > summary');
        if (summary) summary.textContent = `Analysis · ${state.selectedTarget?.name || ''}`;
    }
    if (!(integratedSection as HTMLDetailsElement | null)?.open) return;
    renderResearcherHighlights();
    renderConferenceFilters();
    document.querySelector<HTMLElement>(`.nav-tab[data-tab="${state.currentTab}"]`)?.click();
}

export function setAnalysisTarget(target: Partial<AnalysisTarget> | null | undefined) {
    if (!target?.name || !target?.type) {
        state.selectedTarget = null;
        if (state.analysisReady) showTargetPrompt();
        return;
    }
    if (target.type !== 'school' && target.type !== 'researcher') return;
    state.selectedTarget = { type: target.type, name: target.name };
    state.conferenceFilterContext = null;
    updateTargetMode();
    if (state.analysisReady) showSelectedTarget();
}

// Called when the shared filter bar changes.
export function refreshAnalysis() {
    if (state.selectedTarget && document.querySelector<HTMLDetailsElement>('#integrated-analysis')?.open) {
        state.conferenceFilterContext = null;
        renderConferenceFilters();
        refreshActiveTabChart();
    }
    if (!document.getElementById('site-data-health')?.hidden) renderDataHealth();
}

// The panel floats in a fixed corner instead of sitting inline in the page,
// so opening it never has to scroll the reader away from wherever they were
// (in particular, away from the middle of the lazy-loaded rankings lists).
function revealDataHealth() {
    const panel = document.getElementById('site-data-health');
    if (!panel) return;
    panel.hidden = false;
    if (state.analysisReady) renderDataHealth();
}

function hideDataHealth() {
    const panel = document.getElementById('site-data-health');
    if (panel) panel.hidden = true;
}

// Clicking a link the page has scrolled away from otherwise focuses it and
// the browser scrolls it back into view - exactly the jump this panel is
// meant to avoid. Blocking the default on mousedown (rather than click)
// suppresses that focus-driven scroll while still letting the click fire;
// keyboard activation (Enter/Space, no mousedown) is unaffected.
document.getElementById('data-health-toggle')?.addEventListener('mousedown', event => event.preventDefault());

document.getElementById('data-health-toggle')?.addEventListener('click', event => {
    event.preventDefault();
    const panel = document.getElementById('site-data-health');
    if (!panel) return;
    if (panel.hidden) revealDataHealth();
    else hideDataHealth();
});

document.getElementById('data-health-close')?.addEventListener('click', hideDataHealth);

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideDataHealth();
});

document.addEventListener('click', event => {
    const panel = document.getElementById('site-data-health');
    if (!panel || panel.hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && (panel.contains(target) || target.closest('#data-health-toggle'))) return;
    hideDataHealth();
});

export function getConferenceSet(): ConferenceSetId {
    return state.filters?.confSet || 'all-union';
}

function setupTabs() {
    document.querySelectorAll<HTMLElement>('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const scrollPosition = { left: window.scrollX, top: window.scrollY };
            // UI Toggle
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // View Toggle
            document.querySelectorAll<HTMLElement>('.view-section').forEach(view => { view.hidden = true; });
            const tabName = tab.dataset.tab;
            if (!tabName) return;
            state.currentTab = tabName;

            if (!state.selectedTarget) {
                showTargetPrompt();
                return;
            }

            if (tabName === 'schools') {
                document.getElementById('school-trends-view')!.hidden = false;
                renderSchoolTrends();
            } else if (tabName === 'areas') {
                document.getElementById('area-growth-view')!.hidden = false;
                renderAreaTrends();
            } else if (tabName === 'faculty') {
                document.getElementById('faculty-diversity-view')!.hidden = false;
                renderFacultyTrends();
            } else if (tabName === 'effort') {
                document.getElementById('effort-view')!.hidden = false;
                renderSubfieldEffort();
            } else if (tabName === 'conf-trends') {
                document.getElementById('conf-trends-view')!.hidden = false;
                renderConferenceTrends();
            } else if (tabName === 'collaboration') {
                document.getElementById('collaboration-view')!.hidden = false;
                renderCollaborationStats();
            } else if (tabName === 'stability') {
                document.getElementById('stability-view')!.hidden = false;
                renderRankStability();
            }

            requestAnimationFrame(() => {
                if (Math.abs(window.scrollY - scrollPosition.top) > 1) {
                    window.scrollTo({ ...scrollPosition, behavior: 'auto' });
                }
            });
        });
    });
}

export function getAnalysisData() {
    const { startYear: start, endYear: end, region, confSet, historyMap, aliasMap, perCapita } = state.filters;
    const current = filterByYears(state.rawData, start, end, region, historyMap, aliasMap, confSet);
    const prior = buildPriorPeriodData(state.rawData, start, end, region, historyMap, aliasMap, confSet);
    if (perCapita) {
        applyPerCapitaRanks(current);
        applyPerCapitaRanks(prior);
    }
    return { current, prior, start, end, confSet };
}

export function getResearcherPatterns() {
    if (state.selectedTarget?.type !== 'researcher') return null;
    const professor = state.rawData.professors?.[getTargetName()];
    if (!professor) return null;
    const { current, start, end, confSet } = getAnalysisData();
    return calculateResearcherPatterns(professor, current.professors, {
        startYear: start,
        endYear: end,
        confSet,
        areaMap: getConferenceAreaMap(confSet)
    });
}

function nameLink(name: string) {
    return `<a class="inline-link" href="index.html?q=${encodeURIComponent(name)}">${escapeHtml(cleanName(name))}</a>`;
}

function schoolLink(name: string) {
    return `<a class="inline-link" href="index.html?q=${encodeURIComponent(name)}" title="${escapeHtml(name)}">${escapeHtml(getInstitutionShortName(name))}</a>`;
}

const peerNames = (peers: ResearcherPatterns['similarPeers']) => peers
    .map(peer => `${nameLink(peer.name)} (${schoolLink(peer.affiliation)})`).join('; ');

function researcherHighlightText(patterns: ResearcherPatterns | null) {
    if (!patterns) return [];
    const insights: string[] = [];
    if (patterns.pivot) {
        insights.push(`Research emphasis shifted from ${areaLabels[patterns.pivot.from] || patterns.pivot.from} to ${areaLabels[patterns.pivot.to] || patterns.pivot.to} between the earlier and later halves of this period.`);
    }
    if (patterns.momentum !== null && Math.abs(patterns.momentum) >= 25) {
        insights.push(`Recent three-year adjusted output is ${Math.abs(patterns.momentum).toFixed(0)}% ${patterns.momentum > 0 ? 'higher' : 'lower'} than the preceding three-year window.`);
    }
    if (patterns.primaryArea && patterns.primaryAreaShare >= 60) {
        insights.push(`${patterns.primaryAreaShare.toFixed(0)}% of adjusted output is in ${areaLabels[patterns.primaryArea[0]] || patterns.primaryArea[0]}.`);
    }
    if (patterns.similarPeers.length) {
        insights.push(`Closest area profiles at other universities: ${peerNames(patterns.similarPeers)}.`);
    }
    if (!insights.length) insights.push(`Eligible publications appear in ${patterns.activeYears.length} selected years across ${patterns.breadth} research areas.`);
    return insights.slice(0, 3);
}

// Coauthors come from DBLP, which rate-limits bursts, so the lookup happens
// only when the reader asks for it rather than on every profile view.
const coauthorsByResearcher = new Map<string, 'loading' | FrequentCoauthors>();

function coauthorHighlight(name: string) {
    const coauthorState = coauthorsByResearcher.get(name);
    if (coauthorState === 'loading') return ['Looking up coauthors on DBLP…'];
    if (!coauthorState) return [];
    if (!coauthorState.length) return ['No DBLP coauthors found for this name and period.'];
    return [`Most frequent coauthors: ${coauthorState.map(person =>
        `${nameLink(person.name)} (${person.papers} ${person.papers === 1 ? 'paper' : 'papers'})`).join('; ')}.`];
}

function loadCoauthors(name: string) {
    if (coauthorsByResearcher.has(name)) return;
    coauthorsByResearcher.set(name, 'loading');
    renderResearcherHighlights();
    fetchFrequentCoauthors(name, { startYear: state.filters.startYear, endYear: state.filters.endYear })
        .then(coauthors => {
            coauthorsByResearcher.set(name, coauthors);
            // The user may have moved on while DBLP was answering.
            if (state.selectedTarget?.type === 'researcher' && getTargetName() === name) renderResearcherHighlights();
        })
        .catch(() => {
            coauthorsByResearcher.delete(name);
        });
}

document.getElementById('researcher-highlights')?.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-action="load-coauthors"]')) loadCoauthors(getTargetName());
});

function renderResearcherHighlights() {
    const container = document.getElementById('researcher-highlights');
    if (!container) return;
    const patterns = getResearcherPatterns();
    container.hidden = !patterns;
    if (!patterns) {
        container.innerHTML = '';
        return;
    }

    const name = getTargetName();
    const insights = [...researcherHighlightText(patterns), ...coauthorHighlight(name)];
    container.innerHTML = renderInsightList(insights, 'Profile highlights', true)
        + (coauthorsByResearcher.has(name)
            ? ''
            : '<button type="button" class="inline-link" data-action="load-coauthors">Show most frequent coauthors (from DBLP)</button>');
}

export function renderResearcherActivityMetrics(patterns: ResearcherPatterns | null) {
    const container = document.getElementById('ranking-stats');
    if (!container) return;
    if (!patterns) {
        container.innerHTML = '';
        return;
    }
    const selectedYears = state.filters.endYear - state.filters.startYear + 1;
    const momentum = patterns.momentum === null ? '—' : `${patterns.momentum >= 0 ? '+' : ''}${patterns.momentum.toFixed(0)}%`;
    container.innerHTML = renderMetricCards([
        { label: 'Active years', value: `${patterns.activeYears.length} / ${selectedYears}`, help: 'Years with at least one eligible pub in the selected conference set.' },
        { label: 'Consistency', value: `${patterns.consistency.toFixed(0)}%`, help: 'Share of selected years with at least one eligible pub.' },
        { label: 'Peak year', value: patterns.peak ? `${patterns.peak.year}` : '—', detail: patterns.peak ? `${Math.ceil(patterns.peak.count)} papers (${patterns.peak.adjusted.toFixed(1)} adjusted)` : 'No eligible publications', help: 'Year with the highest adjusted pub count.' },
        { label: 'Active streak', value: `${patterns.activeStreak} ${patterns.activeStreak === 1 ? 'year' : 'years'}`, detail: `ending ${patterns.activeYears.at(-1)}`, help: 'Consecutive active years ending at the latest active year in the selection.' },
        { label: 'Recent momentum', value: momentum, detail: 'latest 3 years vs previous 3', help: 'Percentage change in adjusted count between the latest three-year window and the preceding three-year window.' },
        { label: 'Yearly variability', value: `${(patterns.volatility * 100).toFixed(0)}%`, detail: 'relative to mean output', help: 'Variation in annual adjusted count relative to its yearly mean. Lower values indicate steadier output across the selected period.' }
    ], 'Researcher activity statistics');
}

// Schools get the against-the-field view; researchers get their own patterns.
function renderSchoolAreaInsights() {
    const container = document.getElementById('area-insights');
    if (!container) return;
    const { current, prior, start, end } = getAnalysisData();
    const momentum = calculateAreaMomentum(current, prior, getTargetName());
    const priorLength = end - start + 1;
    container.innerHTML = renderInsightList(
        momentum.map(entry => {
            const label = areaLabels[entry.area] || entry.area;
            const sign = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`;
            const verdict = entry.delta >= 0 ? 'outpacing' : 'trailing';
            return `${label}: ${sign(entry.growth!)} here versus ${sign(entry.fieldGrowth!)} across the selected region — ${verdict} the field by ${Math.abs(entry.delta).toFixed(0)} points (${entry.prior.toFixed(1)} → ${entry.current.toFixed(1)} adjusted).`;
        }),
        `Area growth against the field (vs. the preceding ${priorLength} years)`);
}

export function renderResearcherAreaInsights(patterns: ResearcherPatterns | null) {
    const container = document.getElementById('area-insights');
    if (!container) return;
    if (!patterns || state.selectedTarget?.type !== 'researcher') {
        renderSchoolAreaInsights();
        return;
    }
    const trajectory = patterns.pivot
        ? `${areaLabels[patterns.pivot.from] || patterns.pivot.from} → ${areaLabels[patterns.pivot.to] || patterns.pivot.to}`
        : 'No clear pivot';
    const emerging = patterns.emergingAreas.map(area => areaLabels[area] || area).join(', ') || 'None';
    const dormant = patterns.dormantAreas.map(area => areaLabels[area] || area).join(', ') || 'None';
    container.innerHTML = renderMetricCards([
        { label: 'Primary area', value: patterns.primaryArea ? areaLabels[patterns.primaryArea[0]] || patterns.primaryArea[0] : '—', detail: `${patterns.primaryAreaShare.toFixed(0)}% of adjusted output`, help: 'Research area with the largest adjusted pub count.' },
        { label: 'Research breadth', value: `${patterns.breadth} ${patterns.breadth === 1 ? 'area' : 'areas'}`, help: 'Number of research areas with eligible output.' },
        { label: 'Area balance', value: `${patterns.balance.toFixed(0)}%`, help: 'Normalized entropy of adjusted output across active areas. Higher means output is more evenly distributed.' },
        { label: 'Trajectory', value: trajectory, help: 'Compares the primary area in the earlier and later halves of the selected period; small totals are ignored.' },
        { label: 'Emerging', value: emerging, help: 'Areas appearing in the later half but not the earlier half, with at least 0.5 adjusted count.' },
        { label: 'Dormant', value: dormant, help: 'Areas present in the earlier half but absent from the later half, with at least 0.5 adjusted count earlier.' }
    ], 'Research-area patterns');
}

export function renderResearcherVenueInsights(patterns: ResearcherPatterns | null) {
    const container = document.getElementById('venue-insights');
    if (!container) return;
    if (!patterns || state.selectedTarget?.type !== 'researcher') {
        container.innerHTML = '';
        return;
    }
    const shift = patterns.venueShift
        ? `${getConferenceLabel(patterns.venueShift.from)} → ${getConferenceLabel(patterns.venueShift.to)}`
        : 'No clear shift';
    container.innerHTML = renderMetricCards([
        { label: 'Venue breadth', value: `${patterns.venueBreadth} venues`, help: 'Number of eligible conferences with output in the selected period.' },
        { label: 'Primary venue', value: patterns.topVenue ? getConferenceLabel(patterns.topVenue[0]) : '—', detail: `${patterns.venueConcentration.toFixed(0)}% of adjusted output`, help: 'Conference with the largest adjusted pub count.' },
        { label: 'Venue persistence', value: patterns.mostPersistentVenue ? getConferenceLabel(patterns.mostPersistentVenue[0]) : '—', detail: patterns.mostPersistentVenue ? `${patterns.mostPersistentVenue[1].years.size} active years` : 'No eligible venues', help: 'Conference appearing in the greatest number of distinct years.' },
        { label: 'Venue trajectory', value: shift, help: 'Compares the highest-output venue in the earlier and later halves of the selected period.' }
    ], 'Conference patterns');
}

function renderCollaborationStats() {
    const container = document.getElementById('collaboration-stats');
    if (!container || !state.rawData?.professors) return;
    const { current, prior } = getAnalysisData();
    const schoolName = getTargetName();
    const metrics = calculateSchoolMetrics(current, prior, schoolName);
    if (!metrics) {
        container.innerHTML = '<p>No collaboration statistics are available for this selection.</p>';
        return;
    }

    const leaders = Object.values(current.schools)
        .map(school => ({ school, metrics: calculateSchoolMetrics(current, prior, school.name) }))
        .filter(item => item.metrics)
        .sort((a, b) => b.metrics!.impliedTeamSize - a.metrics!.impliedTeamSize)
        .slice(0, 10);

    container.innerHTML = `
        <h2>${escapeHtml(schoolName)} collaboration profile</h2>
        <div class="diagnostic-grid">
            <div class="diagnostic-stat"><span>Team-size proxy</span><strong>${metrics.impliedTeamSize.toFixed(2)}×</strong><small>raw count ÷ adjusted count</small></div>
            <div class="diagnostic-stat"><span>Fraction retained</span><strong>${metrics.collaborationRetention.toFixed(0)}%</strong><small>after coauthor adjustment</small></div>
            <div class="diagnostic-stat"><span>Top-3 concentration</span><strong>${metrics.top3Share.toFixed(0)}%</strong><small>share of adjusted count</small></div>
            <div class="diagnostic-stat"><span>Median / faculty</span><strong>${metrics.medianPerFaculty.toFixed(1)}</strong><small>adjusted publication count</small></div>
        </div>
        <div class="data-caveat"><strong>Source limitation:</strong> The source data is aggregated per author and does not expose paper identifiers or coauthor affiliations, so CSPicks cannot reliably separate internal from cross-university collaborations. The proxy above measures coauthor intensity without inventing that split.</div>
        <h3>Highest team-size proxies</h3>
        <div class="metric-table">${leaders.map((item, index) => `<div><span>${index + 1}. ${escapeHtml(item.school.name)}</span><strong>${item.metrics!.impliedTeamSize.toFixed(2)}×</strong></div>`).join('')}</div>
    `;
}

const CONF_SET_LABELS = {
    'csrankings-default': 'CSRankings default',
    csrankings: 'CSRankings all',
    'core-a': 'CORE A + A*',
    'core-a-only': 'CORE A only',
    core: 'CORE A* only',
    'all-union': 'All (union)'
};

// One sweep serves every school, so it is cached per region rather than per
// school. Historical mode changes which school a publication counts for, so it
// is part of the key too.
const stabilityCache = new Map<string, RankStabilitySample[]>();
// A sweep takes over a second, and re-entering the tab or picking another
// school during it would otherwise start a second identical one. In-flight
// sweeps are shared so the later caller joins the running one.
const stabilitySweeps = new Map<string, {
    listeners: Set<(done: number, total: number) => void>;
    promise: Promise<RankStabilitySample[]>;
}>();
let stabilityToken = 0;

function buildStabilitySweep(cacheKey: string, onProgress: (done: number, total: number) => void): Promise<RankStabilitySample[]> {
    if (stabilityCache.has(cacheKey)) return Promise.resolve(stabilityCache.get(cacheKey)!);
    const running = stabilitySweeps.get(cacheKey);
    if (running) {
        running.listeners.add(onProgress);
        return running.promise;
    }

    const listeners = new Set([onProgress]);
    const { region, historyMap, aliasMap, endYear } = state.filters;
    const promise = (async () => {
        const variants = rankStabilityVariants(endYear);
        const samples: RankStabilitySample[] = [];
        for (const variant of variants) {
            // Each pass is ~100ms over the full dataset; yielding between them keeps
            // the page responsive instead of freezing it for a second and a half.
            await new Promise(resolve => setTimeout(resolve, 0));
            samples.push(collectVariantRanks(state.rawData, variant, { region, historyMap, aliasMap }));
            listeners.forEach(listener => listener?.(samples.length, variants.length));
        }
        stabilityCache.set(cacheKey, samples);
        stabilitySweeps.delete(cacheKey);
        return samples;
    })().catch(error => {
        stabilitySweeps.delete(cacheKey);
        throw error;
    });

    stabilitySweeps.set(cacheKey, { listeners, promise });
    return promise;
}

/**
 * Departures needed to leave a rank band. Deliberately reports counts and the
 * resulting positions only: which specific people carry a department is not
 * something this should publish, and naming them would invite exactly the
 * personnel conclusions the project does not support.
 */
function renderFragility(schoolName: string) {
    const { current } = getAnalysisData();
    const fragility = calculateFragility(current, schoolName);
    if (!fragility || !fragility.steps.length) return '';

    const bands = fragility.thresholds
        .filter(threshold => fragility.rank <= threshold)
        .map(threshold => {
            const departures = fragility.exits[threshold];
            return `<div class="diagnostic-stat"><span>Leaves the top ${threshold}</span><strong>${
                departures === undefined ? `more than ${fragility.steps.length}` : `${departures} ${departures === 1 ? 'departure' : 'departures'}`
            }</strong><small>of ${fragility.facultyCount} publishing faculty</small></div>`;
        });
    if (!bands.length) return '';

    const trajectory = fragility.steps.slice(0, 5)
        .map((step, index) => `<div><span>${index + 1} ${index === 0 ? 'departure' : 'departures'}</span><strong>#${step.rank}</strong></div>`)
        .join('');

    return `
        <h3>How much does this rank depend on a few people?</h3>
        <p class="summary-note">Removing the faculty whose absence would cost this university the most, one at a time, and re-ranking it against every other university unchanged.</p>
        <div class="diagnostic-grid">${bands.join('')}</div>
        <div class="metric-table fragility-trajectory">${trajectory}</div>
        <p class="summary-note">Individual names are deliberately omitted: this measures how concentrated a department's output is, not any person's worth.</p>`;
}

async function renderRankStability() {
    const container = document.getElementById('stability-stats');
    if (!container || !state.rawData?.professors) return;
    const schoolName = getTargetName();
    const { region, historical, endYear } = state.filters;
    const cacheKey = `${region}|${historical ? 'history' : 'current'}|${endYear}`;
    const token = ++stabilityToken;

    const cached = stabilityCache.get(cacheKey);
    if (!cached) {
        container.innerHTML = `<h2>${escapeHtml(schoolName)} rank stability</h2>
            <p class="summary-note" id="stability-progress">Recomputing the ranking under every setting…</p>`;
    }

    const samples = await buildStabilitySweep(cacheKey, (done, total) => {
        if (token !== stabilityToken) return;
        const progress = document.getElementById('stability-progress');
        if (progress) progress.textContent = `Recomputing the ranking under every setting… ${done} of ${total}`;
    });
    // A newer render (or a different target) started while this one was running.
    if (token !== stabilityToken || getTargetName() !== schoolName) return;

    const summary = summarizeRankStability(samples, schoolName);
    if (!summary) {
        container.innerHTML = `<h2>${escapeHtml(schoolName)} rank stability</h2>
            <p>This university does not rank under any of the settings tested.</p>`;
        return;
    }

    const spans = [...new Set(samples.map(sample => sample.variant.span))];
    const sets = [...new Set(samples.map(sample => sample.variant.confSet))];
    const cell = (span: number, confSet: ConferenceSetId) => {
        const row = summary.rows.find(item => item.span === span && item.confSet === confSet);
        if (!row || !Number.isFinite(row.rank)) return '<td class="stability-cell">—</td>';
        const extreme = row.rank === summary.best ? ' stability-best'
            : row.rank === summary.worst ? ' stability-worst' : '';
        return `<td class="stability-cell${extreme}"><strong>#${row.rank}</strong><small>of ${row.of}</small></td>`;
    };

    container.innerHTML = `
        <h2>${escapeHtml(schoolName)} rank stability</h2>
        <p class="summary-note">The same university, ranked ${summary.settings} ways: every look-back window against every conference set, with the region held at your current selection.</p>
        ${renderMetricCards([
            { label: 'Best case', value: `#${summary.best}`, help: 'The most favourable combination of look-back window and conference set.' },
            { label: 'Worst case', value: `#${summary.worst}`, help: 'The least favourable combination of look-back window and conference set.' },
            { label: 'Median', value: `#${summary.median}`, help: 'Middle rank across all settings tested — a more honest single number than any one of them.' },
            { label: 'Spread', value: `${summary.spread} places`, className: summary.stable ? 'confidence-high' : 'confidence-review', help: summary.stable ? 'The rank holds steady across settings, so it reflects the department rather than the choice of settings.' : 'The rank moves substantially across settings, so any single number — including the one on the search page — is largely an artifact of those choices.' }
        ], 'Rank stability')}
        <table class="stability-table">
            <caption>Rank by look-back window and conference set</caption>
            <thead><tr><th scope="col">Window</th>${sets.map(set => `<th scope="col">${escapeHtml(CONF_SET_LABELS[set] || set)}</th>`).join('')}</tr></thead>
            <tbody>${spans.map(span => `<tr><th scope="row">Last ${span} years</th>${sets.map(set => cell(span, set)).join('')}</tr>`).join('')}</tbody>
        </table>
        ${renderFragility(schoolName)}
        <div class="data-caveat"><strong>How to read this:</strong> ${summary.stable
            ? 'A narrow spread means the position is a property of the department, not of the settings.'
            : `A ${summary.spread}-place spread means the headline rank is largely a consequence of which years and venues are counted. Treat any single rank — including this site's — as one point in that range.`}${summary.unranked ? ` This university is unranked under ${summary.unranked} of the ${summary.settings} settings.` : ''} Region is held fixed because a rank among US universities and a rank worldwide answer different questions and cannot be pooled into one range.</div>
    `;
}

export function renderDataHealth() {
    const container = document.getElementById('data-health-stats');
    if (!container || !state.rawData?.professors) return;
    const { current, start, end, confSet } = getAnalysisData();
    const selectedReport = calculateParityReport(state.rawData, current, confSet, {
        perCapita: Boolean(state.filters?.perCapita),
        historical: Boolean(state.filters?.historical)
    });
    // This baseline is deliberately independent of the visible view. Selecting
    // CORE, per-capita, or History must not turn a healthy CSRankings-default
    // implementation into a false "No"; those are view customizations, not
    // parity failures.
    const defaultData = filterByYears(state.rawData, start, end, state.filters.region, null, null, 'csrankings-default');
    const defaultReport = calculateParityReport(state.rawData, defaultData, 'csrankings-default');
    const syncDate = state.venueRulesCheckedAt || new Date(state.activeVenueRules.syncedAt || '');
    const syncText = Number.isNaN(syncDate.getTime()) ? 'Unknown' : syncDate.toLocaleString();
    const internalOk = selectedReport.totalMismatches === 0 && selectedReport.rankOrderIssues === 0;
    const selectedMode = selectedReport.divergences.length
        ? selectedReport.divergences.join(', ')
        : 'CSRankings default';
    const disambiguatedCount = Object.keys(state.rawData.professors || {}).filter(name =>
        /\s+\d+$|\s+\[\d+\]|\s+\(.*\)/.test(name) || (state.rawData.professors[name]?.unitNotes && state.rawData.professors[name].unitNotes.length > 0)
    ).length;

    container.innerHTML = `
        <h2>CS Picks data health · ${start}–${end}</h2>
        <p class="summary-note">Health checks whether CS Picks’ source data, calculations, metadata, and venue rules are available and internally consistent.</p>

        <div class="diagnostic-grid">
            <div class="diagnostic-stat tooltip-trigger"><span>Matches CSRankings default</span><strong class="${defaultReport.matchesCsrankings ? 'confidence-high' : 'confidence-review'}">${defaultReport.matchesCsrankings ? 'Yes' : 'No'}</strong><small>${defaultReport.matchesCsrankings ? 'official venue set, current affiliations, and total ranking' : `${defaultReport.totalMismatches + defaultReport.rankOrderIssues} baseline inconsistencies`}</small><span class="tooltip-content" role="tooltip">Recomputes rankings with official default rules to verify zero baseline parity drift.</span></div>
            <div class="diagnostic-stat tooltip-trigger"><span>Current selection</span><strong>${selectedReport.divergences.length ? 'Customized' : 'Default'}</strong><small>${escapeHtml(selectedMode)}</small><span class="tooltip-content" role="tooltip">Active filter configuration (e.g. customized venue sets, historical affiliations, or per-capita).</span></div>
            <div class="diagnostic-stat tooltip-trigger"><span>Selected-view invariants</span><strong class="${internalOk ? 'confidence-high' : 'confidence-review'}">${internalOk ? 'Pass' : 'Review'}</strong><small>${selectedReport.totalMismatches + selectedReport.rankOrderIssues} total or rank-order inconsistencies</small><span class="tooltip-content" role="tooltip">Ensures mathematical consistency: strict rank monotonicity and subfield score conservation.</span></div>
            <div class="diagnostic-stat tooltip-trigger"><span>Institution metadata</span><strong>${selectedReport.institutionCoverage.toFixed(0)}%</strong><small>country or region present</small><span class="tooltip-content" role="tooltip">Coverage percentage of universities with mapped country and region attributes.</span></div>
            <div class="diagnostic-stat tooltip-trigger"><span>Author profile links</span><strong>${selectedReport.profileCoverage.toFixed(0)}%</strong><small>homepage or scholar ID mapped</small><span class="tooltip-content" role="tooltip">Coverage percentage of active faculty with verified homepage or Google Scholar ID links.</span></div>
            <div class="diagnostic-stat tooltip-trigger"><span>Disambiguated authors</span><strong>${disambiguatedCount.toLocaleString()}</strong><small>distinct unit/disambiguation tags</small><span class="tooltip-content" role="tooltip">Faculty disambiguated via numerical/unit suffixes to prevent multi-person publication collisions.</span></div>
            <div class="diagnostic-stat tooltip-trigger"><span>Venue rules checked</span><strong>${escapeHtml(syncText)}</strong><small>upstream venue parser · ${escapeHtml(state.activeVenueRules.sourceVersion || 'bundled fallback')}</small><span class="tooltip-content" role="tooltip">Timestamp and source version of the upstream CSRankings venue parser rules sync.</span></div>
            <div class="diagnostic-stat tooltip-trigger"><span>Repository updated</span><strong id="health-repo-updated">Checking...</strong><small><a id="health-repo-link" href="https://github.com/dynaroars/cspicks" target="_blank" rel="noopener noreferrer">dynaroars/cspicks</a></small><span class="tooltip-content" role="tooltip">Latest commit and relative update time for the dynaroars/cspicks GitHub repository.</span></div>
        </div>

        <div class="data-caveat"><strong>What “matches” means:</strong> CSPicks recomputes the selected region and years with CSRankings’ default venues, current affiliations, total department scoring, and the same upstream CSV inputs. It verifies internal totals and rank ordering. CSRankings does not publish a static result table API, so a brief difference can still occur if csrankings.org has deployed newer source data than this browser session.</div>
    `;

    fetchLatestRepoCommit().then(commit => {
        const updatedEl = document.getElementById('health-repo-updated');
        const linkEl = document.querySelector<HTMLAnchorElement>('#health-repo-link');
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
