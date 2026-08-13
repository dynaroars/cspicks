import { drawChart, onThemeChange } from './charts.js';
import { fetchFrequentCoauthors } from './dblp.js';
import { filterByYears, getConferenceAreaMap, getPublicationSchools, parentMap, publicationMatchesConferenceSet } from './data.js';
import { areaLabels, cleanName, escapeHtml, getConferenceLabel } from './shared.js';
import { buildPriorPeriodData, calculateAreaMomentum, calculateFragility, calculateParityReport, calculatePerCapita, calculatePublishingEffort, calculateResearcherPatterns, calculateSchoolMetrics, collectVariantRanks, rankStabilityVariants, summarizeRankStability } from './metrics.js';
import { renderInsightList, renderMetricCards } from './analysis-ui.js';
import bundledRules from './csrankings-rules.generated.js';
import { syncCsrankingsRules } from './csrankings-rules.js';

function refreshActiveTabChart() {
    if (!selectedTarget) return;
    renderResearcherHighlights();
    if (currentTab === 'schools') renderSchoolTrends();
    else if (currentTab === 'areas') renderAreaTrends();
    else if (currentTab === 'faculty') renderFacultyTrends();
    else if (currentTab === 'effort') renderSubfieldEffort();
    else if (currentTab === 'conf-trends') renderConferenceTrends();
    else if (currentTab === 'collaboration') renderCollaborationStats();
    else if (currentTab === 'stability') renderRankStability();
}

onThemeChange(refreshActiveTabChart);

// State
let rawData = [];
let filters = null;
let chartInstance = null;
let currentTab = 'schools';
let selectedTarget = null;
let activeVenueRules = bundledRules;
let venueRulesCheckedAt = null;
let conferenceFilterContext = null;
let analysisReady = false;

// Called once by the Search page, which owns the data load and the filter bar.
export async function initAnalysis(data, filterBar) {
    rawData = data;
    filters = filterBar;
    try {
        activeVenueRules = await syncCsrankingsRules();
        venueRulesCheckedAt = new Date();

        renderConferenceFilters();
        setupTabs();
        setupConferenceFilterButtons();
        analysisReady = true;
        if (new URLSearchParams(window.location.search).get('dataHealth') === 'true') {
            revealDataHealth();
        } else if (!document.getElementById('site-data-health')?.hidden) {
            renderDataHealth();
        }
        if (selectedTarget) showSelectedTarget();
        else showTargetPrompt();
    } catch (err) {
        console.error('Analysis load error:', err);
    }
}

function updateTargetMode() {
    const researcherMode = selectedTarget?.type === 'researcher';
    document.body.classList.toggle('researcher-analysis', researcherMode);
    document.querySelectorAll('[data-school-only]').forEach(tab => {
        tab.style.display = researcherMode ? 'none' : 'inline-flex';
    });
    const activeTab = document.querySelector(`.nav-tab[data-tab="${currentTab}"]`);
    const incompatible = researcherMode && activeTab?.hasAttribute('data-school-only');
    if (incompatible) {
        document.querySelector('.nav-tab[data-tab="schools"]')?.click();
    }
}

function getTargetName() {
    return selectedTarget?.name || '';
}

function isPublicationForTarget(prof, pub) {
    if (!selectedTarget) return false;
    if (selectedTarget.type === 'researcher') return prof.name === selectedTarget.name;
    return isPubAtSchool(prof, pub, selectedTarget.name);
}

function showTargetPrompt() {
    chartInstance?.destroy();
    chartInstance = null;
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
    document.querySelector(`.nav-tab[data-tab="${currentTab}"]`)?.click();
}

export function setAnalysisTarget(target) {
    if (!target?.name || !target?.type) {
        selectedTarget = null;
        if (analysisReady) showTargetPrompt();
        return;
    }
    selectedTarget = { type: target.type, name: target.name };
    conferenceFilterContext = null;
    updateTargetMode();
    if (analysisReady) showSelectedTarget();
}

// Called when the shared filter bar changes.
export function refreshAnalysis() {
    if (selectedTarget) {
        conferenceFilterContext = null;
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
    if (analysisReady) renderDataHealth();
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

function getConferenceSet() {
    return filters?.confSet || 'csrankings-default';
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
            currentTab = tabName;

            if (!selectedTarget) {
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

function getAnalysisData() {
    const { startYear: start, endYear: end, region, confSet, historyMap, aliasMap } = filters;
    const current = filterByYears(rawData, start, end, region, historyMap, aliasMap, confSet);
    const prior = buildPriorPeriodData(rawData, start, end, region, historyMap, aliasMap, confSet);
    return { current, prior, start, end, confSet };
}

function getResearcherPatterns() {
    if (selectedTarget?.type !== 'researcher') return null;
    const professor = rawData.professors?.[getTargetName()];
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
    fetchFrequentCoauthors(name, { startYear: filters.startYear, endYear: filters.endYear })
        .then(coauthors => {
            coauthorsByResearcher.set(name, coauthors);
            // The user may have moved on while DBLP was answering.
            if (selectedTarget?.type === 'researcher' && getTargetName() === name) renderResearcherHighlights();
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

function renderResearcherActivityMetrics(patterns) {
    const container = document.getElementById('ranking-stats');
    if (!container) return;
    if (!patterns) {
        container.innerHTML = '';
        return;
    }
    const selectedYears = filters.endYear - filters.startYear + 1;
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

function renderResearcherAreaInsights(patterns) {
    const container = document.getElementById('area-insights');
    if (!container) return;
    if (!patterns || selectedTarget?.type !== 'researcher') {
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

function renderResearcherVenueInsights(patterns) {
    const container = document.getElementById('venue-insights');
    if (!container) return;
    if (!patterns || selectedTarget?.type !== 'researcher') {
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
    if (!container || !rawData?.professors) return;
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
    core: 'CORE A* only'
};

// One sweep serves every school, so it is cached per region rather than per
// school. Historical mode changes which school a publication counts for, so it
// is part of the key too.
const stabilityCache = new Map();
// A sweep takes over a second, and re-entering the tab or picking another
// school during it would otherwise start a second identical one. In-flight
// sweeps are shared so the later caller joins the running one.
const stabilitySweeps = new Map();
let stabilityToken = 0;

function buildStabilitySweep(cacheKey, onProgress) {
    if (stabilityCache.has(cacheKey)) return Promise.resolve(stabilityCache.get(cacheKey));
    const running = stabilitySweeps.get(cacheKey);
    if (running) {
        running.listeners.add(onProgress);
        return running.promise;
    }

    const listeners = new Set([onProgress]);
    const { region, historyMap, aliasMap, endYear } = filters;
    const promise = (async () => {
        const variants = rankStabilityVariants(endYear);
        const samples = [];
        for (const variant of variants) {
            // Each pass is ~100ms over the full dataset; yielding between them keeps
            // the page responsive instead of freezing it for a second and a half.
            await new Promise(resolve => setTimeout(resolve, 0));
            samples.push(collectVariantRanks(rawData, variant, { region, historyMap, aliasMap }));
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
function renderFragility(schoolName) {
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
    if (!container || !rawData?.professors) return;
    const schoolName = getTargetName();
    const { region, historical, endYear } = filters;
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
    const cell = (span, confSet) => {
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

function renderDataHealth() {
    const container = document.getElementById('data-health-stats');
    if (!container || !rawData?.professors) return;
    const { current, start, end, confSet } = getAnalysisData();
    const report = calculateParityReport(rawData, current, confSet, {
        perCapita: Boolean(filters?.perCapita),
        historical: Boolean(filters?.historical)
    });
    const syncDate = venueRulesCheckedAt || new Date(activeVenueRules.syncedAt);
    const syncText = Number.isNaN(syncDate.getTime()) ? 'Unknown' : syncDate.toLocaleString();
    const internalOk = report.totalMismatches === 0 && report.rankOrderIssues === 0;

    container.innerHTML = `
        <h2>Publication data health · ${start}–${end}</h2>
        <p class="summary-note">This audit checks the canonical source inputs, selected venue mode, source coverage, and ranking invariants used by CSPicks.</p>
        <div class="diagnostic-grid">
            <div class="diagnostic-stat"><span>Matches CSRankings</span><strong class="${report.matchesCsrankings ? 'confidence-high' : 'confidence-review'}">${report.matchesCsrankings ? 'Yes' : 'No'}</strong><small>${report.matchesCsrankings ? 'default settings reproduce csrankings.org' : `differs by ${escapeHtml(report.divergences.join(', '))}`}</small></div>
            <div class="diagnostic-stat"><span>Parity checks</span><strong class="${internalOk ? 'confidence-high' : 'confidence-review'}">${internalOk ? 'Pass' : 'Review'}</strong><small>${report.totalMismatches + report.rankOrderIssues} inconsistencies</small></div>
            <div class="diagnostic-stat"><span>Ranked schools</span><strong>${report.rankedSchools}</strong><small>from ${report.sourceFaculty} source faculty</small></div>
            <div class="diagnostic-stat"><span>Institution metadata</span><strong>${report.institutionCoverage.toFixed(0)}%</strong><small>country or region present</small></div>
            <div class="diagnostic-stat"><span>Author profiles</span><strong>${report.profileCoverage.toFixed(0)}%</strong><small>homepage or Scholar ID present</small></div>
            <div class="diagnostic-stat"><span>Venue rules checked</span><strong>${escapeHtml(syncText)}</strong><small>upstream venue parser · ${escapeHtml(activeVenueRules.sourceVersion || 'bundled fallback')}</small></div>
        </div>
        <div class="data-caveat">${report.matchesCsrankings
            ? 'With the default settings this view reproduces csrankings.org. The official site can still differ temporarily when its deployed data updates before this page reloads.'
            : `This view intentionally differs from csrankings.org because it uses ${escapeHtml(report.divergences.join(' and '))}. Reset those filters to compare like for like.`}</div>
    `;
}

function renderSchoolAnalysisSummary(current, prior, schoolName) {
    const container = document.getElementById('ranking-stats');
    if (!container) return;
    const school = current.schools[schoolName];
    const metrics = calculateSchoolMetrics(current, prior, schoolName);
    if (!school || !metrics) {
        container.innerHTML = '';
        return;
    }

    const rankMovement = metrics.rankDelta === null
        ? '—'
        : metrics.rankDelta === 0 ? 'No change' : `${metrics.rankDelta > 0 ? '▲' : '▼'} ${Math.abs(metrics.rankDelta)}`;
    const growth = `${metrics.growth >= 0 ? '+' : ''}${metrics.growth.toFixed(0)}%`;
    const confidenceClass = metrics.confidence.toLowerCase();
    container.innerHTML = renderMetricCards([
        { label: 'Rank movement', value: rankMovement, help: 'Change in rank versus the immediately preceding period of the same length. An upward arrow means the univ improved.' },
        { label: 'Momentum', value: growth, help: 'Percentage change in adjusted pub count versus the preceding period of the same length.' },
        { label: 'Median / faculty', value: metrics.medianPerFaculty.toFixed(1), help: 'Median adjusted pub count among the univ’s active faculty in the selected period.' },
        { label: 'Top-3 concentration', value: `${metrics.top3Share.toFixed(0)}%`, help: `Share of adjusted pub count produced by the three highest-output faculty. Top one: ${metrics.top1Share.toFixed(0)}%; top five: ${metrics.top5Share.toFixed(0)}%.` },
        { label: 'Breadth', value: `${metrics.activeAreas} active · ${metrics.sustainedAreas} sustained`, help: `Active is the number of areas with output. Sustained means active in this and the preceding period. ${metrics.topTenAreas} areas currently rank in the top 10.` },
        { label: 'Team-size proxy', value: `${metrics.impliedTeamSize.toFixed(1)}×`, help: 'Raw pub count divided by adjusted pub count. This estimates coauthor intensity, not cross-univ collaboration.' },
        { label: 'Profile completeness', value: metrics.confidence, className: `confidence-${confidenceClass}`, help: `Completeness of author homepage and Google Scholar profile fields. Coverage: ${metrics.profileCoverage.toFixed(0)}%.` }
    ], 'University statistics');
}

async function renderSchoolTrends() {
    try {
        const targetName = getTargetName();
        const { startYear, endYear } = filters;
        if (startYear > endYear) return;

        if (selectedTarget.type === 'researcher') {
            // Researcher profiles get the stat cards only — no line chart. The
            // school branch below still draws one, so drop any chart left over
            // from a previous school target.
            chartInstance?.destroy();
            chartInstance = null;
            renderResearcherActivityMetrics(getResearcherPatterns());
            return;
        }

        const canvas = document.getElementById('rankingChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const targetSchool = targetName;
        const { current, prior } = getAnalysisData();
        renderSchoolAnalysisSummary(current, prior, targetSchool);

        const labels = [];
        const rankPoints = [];
        const publicationPoints = [];
        const region = filters.region;
        const regionLabel = filters.element.querySelector('#region-select')?.selectedOptions?.[0]?.textContent || 'US';

        console.log('Calculating trends for', targetSchool, 'from', startYear, 'to', endYear);

        const windowSize = 10;
        const overallMinYear = startYear - (windowSize - 1);
        const overallMaxYear = endYear;

        // Pre-filter publications once to drastically improve loop performance
        const preFilteredData = {
            schools: rawData.schools,
            professors: {}
        };
        Object.entries(rawData.professors).forEach(([name, prof]) => {
            const filteredPubs = prof.pubs.filter(p => p.year >= overallMinYear && p.year <= overallMaxYear);
            if (filteredPubs.length > 0) {
                preFilteredData.professors[name] = {
                    ...prof,
                    pubs: filteredPubs
                };
            }
        });

        for (let y = startYear; y <= endYear; y++) {
            const wStart = y - (windowSize - 1);
            const wEnd = y;

            const result = filterByYears(preFilteredData, wStart, wEnd, region, filters.historyMap, filters.aliasMap, getConferenceSet());
            const school = result.schools[targetSchool];

            labels.push(y);
            rankPoints.push(school ? school.rank : null);
            publicationPoints.push(Object.values(rawData.professors).reduce((total, professor) => {
                const yearlyOutput = professor.pubs
                    .filter(pub => pub.year === y
                        && publicationMatchesConferenceSet(pub, getConferenceSet())
                        && isPubAtSchool(professor, pub, targetSchool))
                    .reduce((sum, pub) => sum + pub.adjustedcount, 0);
                return total + yearlyOutput;
            }, 0));
        }

        chartInstance = drawChart(ctx, chartInstance, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Adjusted publication count',
                    data: publicationPoints,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    yAxisID: 'y',
                    tension: 0.2,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }, {
                    label: `Rank in ${regionLabel}`,
                    data: rankPoints,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                    yAxisID: 'y1',
                    tension: 0.2,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Adjusted Publication Count' }
                    },
                    y1: {
                        reverse: true,
                        title: { display: true, text: `${regionLabel} Rank (10-year window)` },
                        suggestedMin: 1,
                        suggestedMax: 100,
                        position: 'right',
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    title: { display: true, text: 'Publication output and regional rank' }
                }
            }
        });
    } catch (e) {
        console.error('Error rendering school trends:', e);
    }
}

function isPubAtSchool(prof, pub, targetSchool) {
    if (!filters.historical) return prof.affiliation === targetSchool;
    return getPublicationSchools(prof, pub, filters.historyMap, filters.aliasMap).includes(targetSchool);
}

// ------------------
//    AREA TRENDS
// ------------------
function renderAreaTrends() {
    const canvas = document.getElementById('areaChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const years = [];
    const { startYear, endYear } = filters;

    const stats = {};
    for (let y = startYear; y <= endYear; y++) {
        years.push(y);
        stats[y] = {};
    }

    if (!rawData || !rawData.professors) {
        console.error('No rawData available for Area Trends');
        return;
    }

    const targetName = getTargetName();
    const confSet = getConferenceSet();
    const confMap = getConferenceAreaMap(confSet);

    Object.values(rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year >= startYear && pub.year <= endYear && publicationMatchesConferenceSet(pub, confSet)) {
                if (isPublicationForTarget(prof, pub)) {
                    const area = confMap[pub.area] || pub.area;
                    if (!stats[pub.year][area]) stats[pub.year][area] = 0;
                    stats[pub.year][area] += pub.adjustedcount;
                }
            }
        });
    });

    const areaTotals = {};
    Object.values(stats).forEach(yearStats => {
        Object.entries(yearStats).forEach(([area, count]) => {
            areaTotals[area] = (areaTotals[area] || 0) + count;
        });
    });

    const topAreas = Object.entries(areaTotals)
        .sort(([, a], [, b]) => b - a)

        .map(([area]) => area);

    const datasets = topAreas.map((area, index) => {
        const data = years.map(y => stats[y][area] || 0);

        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
            '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6',
            '#06b6d4', '#f97316'
        ];

        return {
            label: areaLabels[area] || area,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            tension: 0.3,
            fill: false,
            pointRadius: 3,
            borderWidth: 2
        };
    });

    chartInstance = drawChart(ctx, chartInstance, {
        type: 'line',
        data: {
            labels: years,
            datasets: datasets
        },
        options: {
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            scales: {
                y: {
                    title: { display: true, text: 'Adjusted Publication Count' },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Research-area growth'
                }
            }
        }
    });

    const legendContainer = document.getElementById('area-legend');
    if (legendContainer) {
        // Researchers get a colour key; schools keep the per-area toggles.
        const researcherMode = selectedTarget?.type === 'researcher';
        legendContainer.innerHTML = `
            <div class="analysis-area-legend-title">Areas</div>
            <div class="analysis-area-options">
              ${datasets.map((ds, i) => (researcherMode
                ? `<span class="analysis-area-option is-static">
                    <span class="analysis-area-swatch" style="background: ${ds.borderColor};"></span>
                    <span>${ds.label}</span>
                  </span>`
                : `<label class="analysis-area-option">
                    <input type="checkbox" checked data-index="${i}" style="accent-color: ${ds.borderColor};">
                    <span>${ds.label}</span>
                  </label>`)).join('')}
            </div>
        `;

        legendContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                chartInstance.setDatasetVisibility(index, e.target.checked);
                chartInstance.update();
            });
        });
    }
    renderResearcherAreaInsights(getResearcherPatterns());
}

// --------------------------------------------------------------------------
// FACULTY DIVERSITY TRENDS
// --------------------------------------------------------------------------
function renderFacultyTrends() {
    const canvas = document.getElementById('diversityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const years = [];
    const { startYear, endYear } = filters;
    const windowSize = 3; // 3-year window for diversity check

    const diversityRates = [];
    const facultyCounts = [];
    const multiAreaCounts = [];
    const targetSchool = getTargetName();
    const confSet = getConferenceSet();
    const confMap = getConferenceAreaMap(confSet);

    for (let y = startYear; y <= endYear; y++) {
        years.push(y);

        const wStart = y - windowSize + 1;
        const wEnd = y;

        // Count distinct areas per author in this window
        const authorAreas = {};

        Object.values(rawData.professors).forEach(prof => {
            prof.pubs.forEach(pub => {
                if (pub.year >= wStart && pub.year <= wEnd && publicationMatchesConferenceSet(pub, confSet)) {
                    if (isPubAtSchool(prof, pub, targetSchool)) {
                        if (!authorAreas[prof.name]) authorAreas[prof.name] = new Set();
                        const area = confMap[pub.area] || pub.area;
                        authorAreas[prof.name].add(area);
                    }
                }
            });
        });

        let multiAreaCount = 0;
        const authors = Object.keys(authorAreas);
        const activeAuthors = authors.length;

        if (activeAuthors > 0) {
            authors.forEach(name => {
                if (authorAreas[name].size > 1) multiAreaCount++;
            });
            diversityRates.push((multiAreaCount / activeAuthors) * 100);
        } else {
            diversityRates.push(0);
        }

        facultyCounts.push(activeAuthors);
        multiAreaCounts.push(multiAreaCount);
    }

    chartInstance = drawChart(ctx, chartInstance, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: '% Multi-Area Faculty',
                    data: diversityRates,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4,
                    yAxisID: 'y'
                },
                {
                    label: 'Active Faculty Count',
                    data: facultyCounts,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 3,
                    borderDash: [5, 5],
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: '% Multi-Area' },
                    beginAtZero: true,
                    suggestedMax: 60
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Faculty Count' },
                    beginAtZero: true,
                    grid: {
                        drawOnChartArea: false
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        afterBody: function (context) {
                            const idx = context[0].dataIndex;
                            return `Multi-Area: ${multiAreaCounts[idx]} of ${facultyCounts[idx]} faculty`;
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Faculty publishing in 2+ research areas (3-year rolling window)'
                }
            }
        }
    });
}

function setupConferenceFilterButtons() {
    const selectAllBtn = document.getElementById('conf-select-all');
    const clearAllBtn = document.getElementById('conf-clear-all');

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('#conf-trends-view input[type="checkbox"]:not(:disabled)').forEach(cb => {
                cb.checked = true;
            });
            renderConferenceTrends();
        });
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            document.querySelectorAll('#conf-trends-view input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            renderConferenceTrends();
        });
    }

    // The checkbox list is rebuilt when the target, years, or conference set
    // changes, so listen on its stable parent rather than on individual inputs.
    document.getElementById('conf-checkbox-groups')?.addEventListener('change', event => {
        if (event.target.matches('input[type="checkbox"]')) {
            renderConferenceTrends();
        }
    });
}

function publishedVenues() {
    const { startYear, endYear } = filters;
    const confSet = getConferenceSet();
    const venues = new Set();
    Object.values(rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year < startYear || pub.year > endYear) return;
            if (!publicationMatchesConferenceSet(pub, confSet)) return;
            if (isPublicationForTarget(prof, pub)) venues.add(pub.area);
        });
    });
    return venues;
}

function renderConferenceFilters() {
    const container = document.getElementById('conf-checkbox-groups');
    const panel = document.getElementById('conference-filter-panel');
    if (!container) return;
    // A single researcher publishes at few venues; picking among them adds
    // controls without adding information.
    const researcherMode = selectedTarget?.type === 'researcher';
    if (panel) panel.hidden = researcherMode;
    if (researcherMode) {
        container.innerHTML = '';
        conferenceFilterContext = null;
        return;
    }
    if (!selectedTarget) {
        container.innerHTML = '';
        conferenceFilterContext = null;
        return;
    }

    const { startYear, endYear } = filters;
    const confSet = getConferenceSet();
    const context = [
        selectedTarget.type,
        selectedTarget.name,
        startYear,
        endYear,
        confSet,
        filters.historical
    ].join('|');

    // Preserve checkbox choices while merely redrawing the chart. A changed
    // analysis context gets a fresh list with all actually published venues
    // selected by default.
    if (conferenceFilterContext === context) return;
    conferenceFilterContext = context;

    const publishedConferences = publishedVenues();

    const groups = [
        { title: 'AI, Data & Language', areas: ['ai', 'vision', 'mlmining', 'nlp', 'inforet'] },
        { title: 'Computer Systems', areas: ['arch', 'ops', 'comm', 'mobile', 'metrics', 'hpc', 'bed', 'da'] },
        { title: 'Theory, Security & DB', areas: ['act', 'crypt', 'log', 'sec', 'mod'] },
        { title: 'Programming & SE', areas: ['plan', 'soft'] },
        { title: 'Interdisciplinary', areas: ['graph', 'chi', 'robotics', 'visualization', 'bio', 'ecom', 'csed'] }
    ];
    const displayNames = {
        nips: 'NeurIPS',
        oakland: 'IEEE S&P',
        usenixsec: 'USENIX Security',
        usenixatc: 'USENIX ATC',
        chiconf: 'CHI',
        'siggraph-asia': 'SIGGRAPH Asia'
    };
    const venues = Object.entries(getConferenceAreaMap(confSet))
        .filter(([venue]) => publishedConferences.has(venue));

    if (venues.length === 0) {
        container.innerHTML = '<p class="data-caveat">No publications at conferences in this set and time range.</p>';
        return;
    }

    container.innerHTML = groups.map(group => ({
        ...group,
        venues: venues
            .filter(([, area]) => group.areas.includes(area))
            .sort(([venueA], [venueB]) => venueA.localeCompare(venueB))
    })).filter(group => group.venues.length > 0).map(group => {
        return `
            <div class="conf-group">
                <h4 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">${escapeHtml(group.title)}</h4>
                <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem;">
                    ${group.venues.map(([venue, area]) => `
                        <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                            <input type="checkbox" value="${escapeHtml(venue)}" checked>
                            ${escapeHtml(displayNames[venue] || venue.toUpperCase())} (${escapeHtml(areaLabels[area] || area)})
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}
function renderSubfieldEffort() {
    const canvas = document.getElementById('effortChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const { startYear, endYear } = filters;
    const targetSchool = getTargetName();
    const confSet = getConferenceSet();
    const effort = calculatePublishingEffort(rawData.professors, {
        startYear,
        endYear,
        parentAreas: getConferenceAreaMap(confSet),
        includesPublication: (prof, pub) => publicationMatchesConferenceSet(pub, confSet) && isPubAtSchool(prof, pub, targetSchool)
    });
    const chartData = effort.subfields.map(item => ({
        ...item,
        label: areaLabels[item.subfield] || item.subfield
    }));

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const barColor = isDark ? '#36c5f0' : '#475569';

    chartInstance = drawChart(ctx, chartInstance, {
        type: 'bar',
        data: {
            labels: chartData.map(d => d.label),
            datasets: [{
                label: 'Adjusted Count/Active Faculty/Year',
                data: chartData.map(d => d.effort),
                backgroundColor: barColor,
                borderColor: barColor,
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            scales: {
                x: {
                    title: { display: true, text: 'Adjusted Count / Active Faculty / Year' },
                    beginAtZero: true
                },
                y: {
                    ticks: {
                        font: { size: 10 }
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Publishing effort (${startYear}-${endYear})`
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function (context) {
                            const dataIndex = context.dataIndex;
                            const d = chartData[dataIndex];
                            return [
                                `Adjusted count: ${d.total.toFixed(2)}`,
                                `Researchers in area: ${d.activeResearchers}`,
                                `Active school faculty: ${effort.activeFaculty}`
                            ];
                        }
                    }
                }
            }
        }
    });
}

function renderConferenceTrends() {
    const canvas = document.getElementById('confTrendsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const { startYear, endYear } = filters;
    const targetName = getTargetName();
    const confSet = getConferenceSet();

    renderConferenceFilters();

    // get list of selected conferences
    const checkedCheckboxes = document.querySelectorAll('#conf-trends-view input[type="checkbox"]:checked:not(:disabled)');
    const selectedConfs = selectedTarget?.type === 'researcher'
        ? [...publishedVenues()]
        : Array.from(checkedCheckboxes).map(cb => cb.value);

    const years = [];
    const stats = {}; // year -> { conf -> count }
    for (let y = startYear; y <= endYear; y++) {
        years.push(y);
        stats[y] = {};
        selectedConfs.forEach(conf => {
            stats[y][conf] = 0;
        });
    }

    // Aggregate conference publication volume
    Object.values(rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year >= startYear && pub.year <= endYear && publicationMatchesConferenceSet(pub, confSet)) {
                if (!isPublicationForTarget(prof, pub)) {
                    return;
                }
                const conf = pub.area;
                if (stats[pub.year] && Object.prototype.hasOwnProperty.call(stats[pub.year], conf)) {
                    stats[pub.year][conf] += pub.adjustedcount;
                }
            }
        });
    });

    const colors = [
        '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
        '#ec4899', '#6366f1', '#14b8a6', '#06b6d4', '#f97316',
        '#84cc16', '#a855f7', '#0f172a', '#e11d48', '#34d399'
    ];

    const datasets = selectedConfs.map((conf, index) => {
        const data = years.map(y => stats[y][conf] || 0);
        return {
            label: conf.toUpperCase(),
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            tension: 0.3,
            fill: false,
            pointRadius: 3,
            borderWidth: 2
        };
    });

    chartInstance = drawChart(ctx, chartInstance, {
        type: 'line',
        data: {
            labels: years,
            datasets: datasets
        },
        options: {
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                y: {
                    title: { display: true, text: 'Adjusted Publication Count' },
                    beginAtZero: true
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Conference adjusted-count trends (${startYear}-${endYear})`
                }
            }
        }
    });
    renderResearcherVenueInsights(getResearcherPatterns());
}

