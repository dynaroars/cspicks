import { drawChart, onThemeChange } from './charts.js';
import { fetchFrequentCoauthors } from './dblp.js';
import { filterByYears, getConferenceAreaMap, getPublicationSchools, parentMap, publicationMatchesConferenceSet } from './data.js';
import { areaLabels, cleanName, escapeHtml, getConferenceLabel } from './shared.js';
import { buildPriorPeriodData, calculateAreaMomentum, calculateFragility, calculateParityReport, calculatePerCapita, calculatePublishingEffort, calculateResearcherPatterns, calculateSchoolMetrics, collectVariantRanks, rankStabilityVariants, summarizeRankStability } from './metrics.js';
import { renderInsightList, renderMetricCards } from './analysis-ui.js';
import bundledRules from './csrankings-rules.generated.js';
import { syncCsrankingsRules } from './csrankings-rules.js';
import { state } from './analysis/state.js';
import { renderDataHealth, renderRankStability } from './analysis/diagnostics.js';
import { renderSchoolTrends } from './analysis/school-trends.js';
import { isPubAtSchool, renderAreaTrends } from './analysis/area-trends.js';
import { renderFacultyTrends } from './analysis/faculty-trends.js';
import { publishedVenues, renderConferenceFilters, setupConferenceFilterButtons } from './analysis/conference-filters.js';
import { renderSubfieldEffort } from './analysis/publishing-effort.js';
import { renderConferenceTrends } from './analysis/conference-trends.js';

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
export async function initAnalysis(data, filterBar) {
    state.rawData = data;
    state.filters = filterBar;
    try {
        state.activeVenueRules = await syncCsrankingsRules();
        state.venueRulesCheckedAt = new Date();

        renderConferenceFilters();
        setupTabs();
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
    document.querySelectorAll('[data-school-only]').forEach(tab => {
        tab.style.display = researcherMode ? 'none' : 'inline-flex';
    });
    const activeTab = document.querySelector(`.nav-tab[data-tab="${state.currentTab}"]`);
    const incompatible = researcherMode && activeTab?.hasAttribute('data-school-only');
    if (incompatible) {
        document.querySelector('.nav-tab[data-tab="schools"]')?.click();
    }
}

export function getTargetName() {
    return state.selectedTarget?.name || '';
}

export function isPublicationForTarget(prof, pub) {
    if (!state.selectedTarget) return false;
    if (state.selectedTarget.type === 'researcher') return prof.name === state.selectedTarget.name;
    return isPubAtSchool(prof, pub, state.selectedTarget.name);
}

function showTargetPrompt() {
    state.chartInstance?.destroy();
    state.chartInstance = null;
    document.querySelectorAll('.view-section').forEach(view => { view.hidden = true; });
    const integratedSection = document.getElementById('integrated-analysis');
    if (integratedSection) integratedSection.hidden = true;
    const highlights = document.getElementById('researcher-highlights');
    if (highlights) highlights.hidden = true;
}

function showSelectedTarget() {
    const integratedSection = document.getElementById('integrated-analysis');
    if (integratedSection) {
        integratedSection.hidden = false;
    }
    renderResearcherHighlights();
    renderConferenceFilters();
    document.querySelector(`.nav-tab[data-tab="${state.currentTab}"]`)?.click();
}

export function setAnalysisTarget(target) {
    if (!target?.name || !target?.type) {
        state.selectedTarget = null;
        if (state.analysisReady) showTargetPrompt();
        return;
    }
    state.selectedTarget = { type: target.type, name: target.name };
    state.conferenceFilterContext = null;
    updateTargetMode();
    if (state.analysisReady) showSelectedTarget();
}

// Called when the shared filter bar changes.
export function refreshAnalysis() {
    if (state.selectedTarget) {
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
    if (panel.contains(event.target) || event.target.closest('#data-health-toggle')) return;
    hideDataHealth();
});

export function getConferenceSet() {
    return state.filters?.confSet || 'all-union';
}

function setupTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const scrollPosition = { left: window.scrollX, top: window.scrollY };
            // UI Toggle
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // View Toggle
            document.querySelectorAll('.view-section').forEach(view => { view.hidden = true; });
            const tabName = tab.dataset.tab;
            state.currentTab = tabName;

            if (!state.selectedTarget) {
                showTargetPrompt();
                return;
            }

            if (tabName === 'schools') {
                document.getElementById('school-trends-view').hidden = false;
                renderSchoolTrends();
            } else if (tabName === 'areas') {
                document.getElementById('area-growth-view').hidden = false;
                renderAreaTrends();
            } else if (tabName === 'faculty') {
                document.getElementById('faculty-diversity-view').hidden = false;
                renderFacultyTrends();
            } else if (tabName === 'effort') {
                document.getElementById('effort-view').hidden = false;
                renderSubfieldEffort();
            } else if (tabName === 'conf-trends') {
                document.getElementById('conf-trends-view').hidden = false;
                renderConferenceTrends();
            } else if (tabName === 'collaboration') {
                document.getElementById('collaboration-view').hidden = false;
                renderCollaborationStats();
            } else if (tabName === 'stability') {
                document.getElementById('stability-view').hidden = false;
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
    const { startYear: start, endYear: end, region, confSet, historyMap, aliasMap } = state.filters;
    const current = filterByYears(state.rawData, start, end, region, historyMap, aliasMap, confSet);
    const prior = buildPriorPeriodData(state.rawData, start, end, region, historyMap, aliasMap, confSet);
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

const peerNames = peers => peers.map(peer => `${cleanName(peer.name)} (${peer.affiliation})`).join('; ');

function researcherHighlightText(patterns) {
    if (!patterns) return [];
    const insights = [];
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
const coauthorsByResearcher = new Map();

function coauthorHighlight(name) {
    const state = coauthorsByResearcher.get(name);
    if (state === 'loading') return ['Looking up coauthors on DBLP…'];
    if (!state) return [];
    if (!state.length) return ['No DBLP coauthors found for this name and period.'];
    return [`Most frequent coauthors: ${state.map(person =>
        `${person.name} (${person.papers} ${person.papers === 1 ? 'paper' : 'papers'})`).join('; ')}.`];
}

function loadCoauthors(name) {
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
    if (event.target.closest('[data-action="load-coauthors"]')) loadCoauthors(getTargetName());
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
    container.innerHTML = renderInsightList(insights, 'Profile highlights')
        + (coauthorsByResearcher.has(name)
            ? ''
            : '<button type="button" class="inline-link" data-action="load-coauthors">Show most frequent coauthors (from DBLP)</button>');
}

export function renderResearcherActivityMetrics(patterns) {
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
        { label: 'Peak year', value: `${patterns.peak.year}`, detail: `${Math.ceil(patterns.peak.count)} papers (${patterns.peak.adjusted.toFixed(1)} adjusted)`, help: 'Year with the highest adjusted pub count.' },
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
            const sign = value => `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`;
            const verdict = entry.delta >= 0 ? 'outpacing' : 'trailing';
            return `${label}: ${sign(entry.growth)} here versus ${sign(entry.fieldGrowth)} across the selected region — ${verdict} the field by ${Math.abs(entry.delta).toFixed(0)} points (${entry.prior.toFixed(1)} → ${entry.current.toFixed(1)} adjusted).`;
        }),
        `Area growth against the field (vs. the preceding ${priorLength} years)`);
}

export function renderResearcherAreaInsights(patterns) {
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
        { label: 'Primary area', value: areaLabels[patterns.primaryArea[0]] || patterns.primaryArea[0], detail: `${patterns.primaryAreaShare.toFixed(0)}% of adjusted output`, help: 'Research area with the largest adjusted pub count.' },
        { label: 'Research breadth', value: `${patterns.breadth} ${patterns.breadth === 1 ? 'area' : 'areas'}`, help: 'Number of research areas with eligible output.' },
        { label: 'Area balance', value: `${patterns.balance.toFixed(0)}%`, help: 'Normalized entropy of adjusted output across active areas. Higher means output is more evenly distributed.' },
        { label: 'Trajectory', value: trajectory, help: 'Compares the primary area in the earlier and later halves of the selected period; small totals are ignored.' },
        { label: 'Emerging', value: emerging, help: 'Areas appearing in the later half but not the earlier half, with at least 0.5 adjusted count.' },
        { label: 'Dormant', value: dormant, help: 'Areas present in the earlier half but absent from the later half, with at least 0.5 adjusted count earlier.' }
    ], 'Research-area patterns');
}

export function renderResearcherVenueInsights(patterns) {
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
        { label: 'Primary venue', value: getConferenceLabel(patterns.topVenue[0]), detail: `${patterns.venueConcentration.toFixed(0)}% of adjusted output`, help: 'Conference with the largest adjusted pub count.' },
        { label: 'Venue persistence', value: getConferenceLabel(patterns.mostPersistentVenue[0]), detail: `${patterns.mostPersistentVenue[1].years.size} active years`, help: 'Conference appearing in the greatest number of distinct years.' },
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
        .sort((a, b) => b.metrics.impliedTeamSize - a.metrics.impliedTeamSize)
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
        <div class="metric-table">${leaders.map((item, index) => `<div><span>${index + 1}. ${escapeHtml(item.school.name)}</span><strong>${item.metrics.impliedTeamSize.toFixed(2)}×</strong></div>`).join('')}</div>
    `;
}

const CONF_SET_LABELS = {
    'csrankings-default': 'CSRankings default',
    csrankings: 'CSRankings all',
    'core-a': 'CORE A + A*',
    core: 'CORE A* only',
    'all-union': 'All (union)'
};
