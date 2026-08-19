import { drawChart } from '../charts.js';
import { filterByYears, getConferenceAreaMap, getPublicationSchools, parentMap, publicationMatchesConferenceSet } from '../data.js';
import { areaLabels, cleanName, escapeHtml, getConferenceLabel } from '../shared.js';
import { buildPriorPeriodData, calculateAreaMomentum, calculateFragility, calculateParityReport, calculatePerCapita, calculatePublishingEffort, calculateSchoolMetrics, collectVariantRanks, rankStabilityVariants, summarizeRankStability } from '../metrics.js';
import { renderInsightList, renderMetricCards } from '../analysis-ui.js';
import { state } from './state.js';
import { getAnalysisData, getConferenceSet, getTargetName, isPublicationForTarget } from '../analysis.js';
import { renderConferenceTrends } from './conference-trends.js';

export function setupConferenceFilterButtons() {
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

export function publishedVenues() {
    const { startYear, endYear } = state.filters;
    const confSet = getConferenceSet();
    const venues = new Set();
    Object.values(state.rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year < startYear || pub.year > endYear) return;
            if (!publicationMatchesConferenceSet(pub, confSet)) return;
            if (isPublicationForTarget(prof, pub)) venues.add(pub.area);
        });
    });
    return venues;
}

export function renderConferenceFilters() {
    const container = document.getElementById('conf-checkbox-groups');
    const panel = document.getElementById('conference-filter-panel');
    if (!container) return;
    // A single researcher publishes at few venues; picking among them adds
    // controls without adding information.
    const researcherMode = state.selectedTarget?.type === 'researcher';
    if (panel) panel.hidden = researcherMode;
    if (researcherMode) {
        container.innerHTML = '';
        state.conferenceFilterContext = null;
        return;
    }
    if (!state.selectedTarget) {
        container.innerHTML = '';
        state.conferenceFilterContext = null;
        return;
    }

    const { startYear, endYear } = state.filters;
    const confSet = getConferenceSet();
    const context = [
        state.selectedTarget.type,
        state.selectedTarget.name,
        startYear,
        endYear,
        confSet,
        state.filters.historical
    ].join('|');

    // Preserve checkbox choices while merely redrawing the chart. A changed
    // analysis context gets a fresh list with all actually published venues
    // selected by default.
    if (state.conferenceFilterContext === context) return;
    state.conferenceFilterContext = context;

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
