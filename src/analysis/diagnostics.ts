import { filterByYears } from '../data.js';
import { escapeHtml, fetchLatestRepoCommit, formatRelativeTime } from '../shared.js';
import { calculateCorpusDiagnostics, calculateFragility, calculateParityReport, collectVariantRanks, rankStabilityVariants, summarizeRankStability } from '../metrics.js';
import { renderMetricCards } from '../analysis-ui.js';
import { state } from './state.js';
import { CONF_SET_LABELS, getAnalysisData, getTargetName } from '../analysis.js';
import type { RankStabilitySample } from '../metrics/stability.js';
import type { ConferenceSetId } from '../data/conference-sets.js';

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

export function buildStabilitySweep(cacheKey: string, onProgress: (done: number, total: number) => void) {
    if (stabilityCache.has(cacheKey)) return Promise.resolve(stabilityCache.get(cacheKey));
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
export function renderFragility(schoolName: string) {
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

export async function renderRankStability() {
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
    const syncDate = state.venueRulesCheckedAt || new Date(state.activeVenueRules.syncedAt);
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
