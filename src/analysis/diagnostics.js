import { drawChart } from '../charts.js';
import { filterByYears, getConferenceAreaMap, getPublicationSchools, parentMap, publicationMatchesConferenceSet } from '../data.js';
import { areaLabels, cleanName, escapeHtml, getConferenceLabel } from '../shared.js';
import { buildPriorPeriodData, calculateAreaMomentum, calculateCorpusDiagnostics, calculateFragility, calculateParityReport, calculatePerCapita, calculatePublishingEffort, calculateSchoolMetrics, collectVariantRanks, rankStabilityVariants, summarizeRankStability } from '../metrics.js';
import { renderInsightList, renderMetricCards } from '../analysis-ui.js';
import { state } from './state.js';
import { getAnalysisData, getConferenceSet, getTargetName, isPublicationForTarget } from '../analysis.js';

export function buildStabilitySweep(cacheKey, onProgress) {
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
        const samples = [];
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
export function renderFragility(schoolName) {
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
    const corpusDiag = calculateCorpusDiagnostics(state.rawData, current);
    const syncDate = state.venueRulesCheckedAt || new Date(state.activeVenueRules.syncedAt);
    const syncText = Number.isNaN(syncDate.getTime()) ? 'Unknown' : syncDate.toLocaleString();
    const internalOk = selectedReport.totalMismatches === 0 && selectedReport.rankOrderIssues === 0;
    const selectedMode = selectedReport.divergences.length
        ? selectedReport.divergences.join(', ')
        : 'CSRankings default';
    const topAreaName = corpusDiag.topArea ? (areaLabels[corpusDiag.topArea.key] || corpusDiag.topArea.key) : 'None';
    container.innerHTML = `
        <h2>CS Picks health · ${start}–${end}</h2>
        <p class="summary-note">Health checks whether CS Picks’ source data, calculations, metadata, and venue rules are available, internally consistent, and informationally sound.</p>
        
        <h3>Engine Invariants & Parity</h3>
        <div class="diagnostic-grid">
            <div class="diagnostic-stat"><span>Matches CSRankings default</span><strong class="${defaultReport.matchesCsrankings ? 'confidence-high' : 'confidence-review'}">${defaultReport.matchesCsrankings ? 'Yes' : 'No'}</strong><small>${defaultReport.matchesCsrankings ? 'official venue set, current affiliations, and total ranking' : `${defaultReport.totalMismatches + defaultReport.rankOrderIssues} baseline inconsistencies`}</small></div>
            <div class="diagnostic-stat"><span>Current selection</span><strong>${selectedReport.divergences.length ? 'Customized' : 'Default'}</strong><small>${escapeHtml(selectedMode)}</small></div>
            <div class="diagnostic-stat"><span>Selected-view invariants</span><strong class="${internalOk ? 'confidence-high' : 'confidence-review'}">${internalOk ? 'Pass' : 'Review'}</strong><small>${selectedReport.totalMismatches + selectedReport.rankOrderIssues} total or rank-order inconsistencies</small></div>
            <div class="diagnostic-stat"><span>Institution metadata</span><strong>${selectedReport.institutionCoverage.toFixed(0)}%</strong><small>country or region present</small></div>
            <div class="diagnostic-stat"><span>Author profile links</span><strong>${selectedReport.profileCoverage.toFixed(0)}%</strong><small>homepage or scholar ID mapped</small></div>
            <div class="diagnostic-stat"><span>Venue rules checked</span><strong>${escapeHtml(syncText)}</strong><small>upstream venue parser · ${escapeHtml(state.activeVenueRules.sourceVersion || 'bundled fallback')}</small></div>
        </div>

        <h3>Field Diversity & Information Entropy</h3>
        <div class="diagnostic-grid">
            <div class="diagnostic-stat"><span>Shannon Area Entropy</span><strong>${corpusDiag.entropy.toFixed(2)} nats</strong><small>${corpusDiag.normalizedEntropy.toFixed(0)}% uniform across 26 subfields</small></div>
            <div class="diagnostic-stat"><span>Field Concentration (HHI)</span><strong>${corpusDiag.hhi.toLocaleString()}</strong><small>${corpusDiag.hhi < 1500 ? 'Low / highly diversified' : corpusDiag.hhi < 2500 ? 'Moderate' : 'Concentrated'}</small></div>
            <div class="diagnostic-stat"><span>Dominant Subfield</span><strong>${escapeHtml(topAreaName)}</strong><small>${corpusDiag.topArea ? `${corpusDiag.topArea.share.toFixed(1)}% of adjusted output` : 'None'}</small></div>
        </div>

        <h3>Faculty & Collaboration Graph</h3>
        <div class="diagnostic-grid">
            <div class="diagnostic-stat"><span>Faculty Output Gini</span><strong>${corpusDiag.gini.toFixed(2)}</strong><small>Top 10% faculty authored ${corpusDiag.top10Concentration.toFixed(0)}% of output</small></div>
            <div class="diagnostic-stat"><span>Interdisciplinary Bridge</span><strong>${corpusDiag.bridgeRatio.toFixed(0)}%</strong><small>active faculty publishing in ≥2 subfields</small></div>
            <div class="diagnostic-stat"><span>Co-authorship Depth</span><strong>${corpusDiag.coauthorshipDepth.toFixed(1)}</strong><small>avg team size (raw-to-adjusted ratio)</small></div>
            <div class="diagnostic-stat"><span>Disambiguated Authors</span><strong>${corpusDiag.disambiguatedAuthors.toLocaleString()}</strong><small>researchers with distinct unit/id tags</small></div>
        </div>

        <div class="data-caveat"><strong>What “matches” means:</strong> CSPicks recomputes the selected region and years with CSRankings’ default venues, current affiliations, total department scoring, and the same upstream CSV inputs. It verifies internal totals and rank ordering. CSRankings does not publish a static result table API, so a brief difference can still occur if csrankings.org has deployed newer source data than this browser session.</div>
    `;
}
