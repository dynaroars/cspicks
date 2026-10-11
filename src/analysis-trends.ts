// Per-tab chart renderers for the Search-page analysis panel (state and orchestration live in analysis.ts).
import { getAnalysisData, getConferenceSet, getResearcherPatterns, getTargetName, isPublicationForTarget, renderMetricCards, renderResearcherActivityMetrics, renderResearcherAreaInsights, renderResearcherVenueInsights, state } from './analysis.js';
import { drawChart } from './charts.js';
import { filterByYears, getConferenceAreaMap, getPublicationSchools, publicationMatchesConferenceSet } from './data.js';
import { calculatePublishingEffort, calculateSchoolMetrics } from './metrics.js';
import { areaLabels, escapeHtml } from './shared.js';
import type { FilteredData, Professor, Publication, RawData } from './types.js';

export function renderSchoolAnalysisSummary(current: FilteredData, prior: FilteredData, schoolName: string) {
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

export async function renderSchoolTrends() {
    try {
        const canvas = document.querySelector<HTMLCanvasElement>('#rankingChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const targetName = getTargetName();
        const { startYear, endYear } = state.filters;
        if (startYear > endYear) return;

        if (state.selectedTarget?.type === 'researcher') {
            renderResearcherActivityMetrics(getResearcherPatterns());
            const professor = state.rawData.professors[targetName];
            const confSet = getConferenceSet();
            const labels: number[] = [];
            const paperCounts: number[] = [];
            const adjustedCounts: number[] = [];
            for (let year = startYear; year <= endYear; year++) {
                labels.push(year);
                const yearlyPublications = (professor?.pubs || [])
                    .filter(pub => pub.year === year && publicationMatchesConferenceSet(pub, confSet));
                paperCounts.push(yearlyPublications.reduce((sum, pub) => sum + (pub.count || 0), 0));
                adjustedCounts.push(yearlyPublications.reduce((sum, pub) => sum + (pub.adjustedcount || 0), 0));
            }

            state.chartInstance = drawChart(ctx, state.chartInstance, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Papers',
                        data: paperCounts,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.08)',
                        tension: 0.2,
                        fill: false,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }, {
                        label: 'Adjusted count',
                        data: adjustedCounts,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.2,
                        fill: true,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    scales: {
                        y: {
                            title: { display: true, text: 'Publication count' },
                            beginAtZero: true
                        }
                    },
                    plugins: {
                        title: { display: true, text: 'Publication trends · papers and adjusted count' },
                        tooltip: {
                            callbacks: {
                                footer: items => {
                                    const index = items[0]?.dataIndex;
                                    return index === undefined ? '' : `${paperCounts[index]} papers (${(adjustedCounts[index] || 0).toFixed(1)} adjusted)`;
                                }
                            }
                        }
                    }
                }
            });
            return;
        }

        const targetSchool = targetName;
        const { current, prior } = getAnalysisData();
        renderSchoolAnalysisSummary(current, prior, targetSchool);

        const labels: number[] = [];
        const rankPoints: Array<number | null> = [];
        const publicationPoints: number[] = [];
        const region = state.filters.region;
        const regionLabel = state.filters.element.querySelector<HTMLSelectElement>('#region-select')?.selectedOptions?.[0]?.textContent || 'US';

        const windowSize = 10;
        const overallMinYear = startYear - (windowSize - 1);
        const overallMaxYear = endYear;

        // Pre-filter publications once to drastically improve loop performance
        const preFilteredData: RawData = {
            schools: state.rawData.schools,
            professors: {}
        };
        Object.entries(state.rawData.professors).forEach(([name, prof]) => {
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

            const result = filterByYears(preFilteredData, wStart, wEnd, region, state.filters.historyMap, state.filters.aliasMap, getConferenceSet());
            const school = result.schools[targetSchool];

            labels.push(y);
            rankPoints.push(school?.rank ?? null);
            publicationPoints.push(Object.values(state.rawData.professors).reduce((total, professor) => {
                const yearlyOutput = professor.pubs
                    .filter(pub => pub.year === y
                        && publicationMatchesConferenceSet(pub, getConferenceSet())
                        && isPubAtSchool(professor, pub, targetSchool))
                    .reduce((sum, pub) => sum + pub.adjustedcount, 0);
                return total + yearlyOutput;
            }, 0));
        }

        state.chartInstance = drawChart(ctx, state.chartInstance, {
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

export function isPubAtSchool(prof: Professor, pub: Publication, targetSchool: string) {
    if (!state.filters.historical) return prof.affiliation === targetSchool;
    return getPublicationSchools(prof, pub, state.filters.historyMap, state.filters.aliasMap).includes(targetSchool);
}

// ------------------
//    AREA TRENDS
// ------------------
export function renderAreaTrends() {
    const canvas = document.querySelector<HTMLCanvasElement>('#areaChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const years: number[] = [];
    const { startYear, endYear } = state.filters;

    const stats: Record<number, Record<string, number>> = {};
    for (let y = startYear; y <= endYear; y++) {
        years.push(y);
        stats[y] = {};
    }

    if (!state.rawData || !state.rawData.professors) {
        console.error('No state.rawData available for Area Trends');
        return;
    }

    const confSet = getConferenceSet();
    const confMap = getConferenceAreaMap(confSet);

    Object.values(state.rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year >= startYear && pub.year <= endYear && publicationMatchesConferenceSet(pub, confSet)) {
                if (isPublicationForTarget(prof, pub)) {
                    const area = confMap[pub.area] || pub.area;
                    const yearStats = stats[pub.year]!;
                    yearStats[area] = (yearStats[area] || 0) + pub.adjustedcount;
                }
            }
        });
    });

    const areaTotals: Record<string, number> = {};
    Object.values(stats).forEach(yearStats => {
        Object.entries(yearStats).forEach(([area, count]) => {
            areaTotals[area] = (areaTotals[area] || 0) + count;
        });
    });

    const topAreas = Object.entries(areaTotals)
        .sort(([, a], [, b]) => b - a)

        .map(([area]) => area);

    const datasets = topAreas.map((area, index) => {
        const data = years.map(y => stats[y]![area] || 0);

        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
            '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6',
            '#06b6d4', '#f97316'
        ];

        return {
            label: areaLabels[area] || area,
            data: data,
            borderColor: colors[index % colors.length]!,
            backgroundColor: colors[index % colors.length]!,
            tension: 0.3,
            fill: false,
            pointRadius: 3,
            borderWidth: 2
        };
    });

    state.chartInstance = drawChart(ctx, state.chartInstance, {
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
        const researcherMode = state.selectedTarget?.type === 'researcher';
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

        legendContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const input = e.currentTarget as HTMLInputElement;
                const index = parseInt(input.dataset.index || '', 10);
                state.chartInstance?.setDatasetVisibility(index, input.checked);
                state.chartInstance?.update();
            });
        });
    }
    renderResearcherAreaInsights(getResearcherPatterns());
}

// --------------------------------------------------------------------------
// FACULTY DIVERSITY TRENDS
// --------------------------------------------------------------------------

export function renderFacultyTrends() {
    const canvas = document.querySelector<HTMLCanvasElement>('#diversityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const years: number[] = [];
    const { startYear, endYear } = state.filters;
    const windowSize = 3; // 3-year window for diversity check

    const diversityRates: number[] = [];
    const facultyCounts: number[] = [];
    const multiAreaCounts: number[] = [];
    const targetSchool = getTargetName();
    const confSet = getConferenceSet();
    const confMap = getConferenceAreaMap(confSet);

    for (let y = startYear; y <= endYear; y++) {
        years.push(y);

        const wStart = y - windowSize + 1;
        const wEnd = y;

        // Count distinct areas per author in this window
        const authorAreas: Record<string, Set<string>> = {};

        Object.values(state.rawData.professors).forEach(prof => {
            prof.pubs.forEach(pub => {
                if (pub.year >= wStart && pub.year <= wEnd && publicationMatchesConferenceSet(pub, confSet)) {
                    if (isPubAtSchool(prof, pub, targetSchool)) {
                        const areas = authorAreas[prof.name] || new Set<string>();
                        authorAreas[prof.name] = areas;
                        const area = confMap[pub.area] || pub.area;
                        areas.add(area);
                    }
                }
            });
        });

        let multiAreaCount = 0;
        const authors = Object.keys(authorAreas);
        const activeAuthors = authors.length;

        if (activeAuthors > 0) {
            authors.forEach(name => {
                if (authorAreas[name]!.size > 1) multiAreaCount++;
            });
            diversityRates.push((multiAreaCount / activeAuthors) * 100);
        } else {
            diversityRates.push(0);
        }

        facultyCounts.push(activeAuthors);
        multiAreaCounts.push(multiAreaCount);
    }

    state.chartInstance = drawChart(ctx, state.chartInstance, {
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
                            const idx = context[0]?.dataIndex;
                            if (idx === undefined) return '';
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

export function renderSubfieldEffort() {
    const canvas = document.querySelector<HTMLCanvasElement>('#effortChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const { startYear, endYear } = state.filters;
    const targetSchool = getTargetName();
    const confSet = getConferenceSet();
    const effort = calculatePublishingEffort(state.rawData.professors, {
        startYear,
        endYear,
        parentAreas: getConferenceAreaMap(confSet),
        includesPublication: (prof, pub) => publicationMatchesConferenceSet(pub, confSet) && isPubAtSchool(prof, pub, targetSchool)
    });
    const chartData = effort.subfields.map(item => ({
        ...item,
        label: areaLabels[item.subfield] || item.subfield
    }));

    const isDark = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
    const barColor = isDark ? '#36c5f0' : '#475569';

    state.chartInstance = drawChart(ctx, state.chartInstance, {
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
                            if (!d) return [];
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

export function setupConferenceFilterButtons() {
    const selectAllBtn = document.getElementById('conf-select-all');
    const clearAllBtn = document.getElementById('conf-clear-all');

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            document.querySelectorAll<HTMLInputElement>('#conf-trends-view input[type="checkbox"]:not(:disabled)').forEach(cb => {
                cb.checked = true;
            });
            renderConferenceTrends();
        });
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            document.querySelectorAll<HTMLInputElement>('#conf-trends-view input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            renderConferenceTrends();
        });
    }

    // The checkbox list is rebuilt when the target, years, or conference set
    // changes, so listen on its stable parent rather than on individual inputs.
    document.getElementById('conf-checkbox-groups')?.addEventListener('change', event => {
        if (event.target instanceof Element && event.target.matches('input[type="checkbox"]')) {
            renderConferenceTrends();
        }
    });
}

export function publishedVenues() {
    const { startYear, endYear } = state.filters;
    const confSet = getConferenceSet();
    const venues = new Set<string>();
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
    const displayNames: Record<string, string> = {
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
                <h4>${escapeHtml(group.title)}</h4>
                <div class="conf-group-items">
                    ${group.venues.map(([venue, area]) => `
                        <label>
                            <input type="checkbox" value="${escapeHtml(venue)}" checked>
                            ${escapeHtml(displayNames[venue] || venue.toUpperCase())} (${escapeHtml(areaLabels[area] || area)})
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

export function renderConferenceTrends() {
    const canvas = document.querySelector<HTMLCanvasElement>('#confTrendsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const { startYear, endYear } = state.filters;
    const confSet = getConferenceSet();

    renderConferenceFilters();

    // get list of selected conferences
    const checkedCheckboxes = document.querySelectorAll<HTMLInputElement>('#conf-trends-view input[type="checkbox"]:checked:not(:disabled)');
    const selectedConfs = state.selectedTarget?.type === 'researcher'
        ? [...publishedVenues()]
        : Array.from(checkedCheckboxes).map(cb => cb.value);

    const years: number[] = [];
    const stats: Record<number, Record<string, number>> = {}; // year -> { conf -> count }
    for (let y = startYear; y <= endYear; y++) {
        years.push(y);
        stats[y] = {};
        selectedConfs.forEach(conf => {
            stats[y]![conf] = 0;
        });
    }

    // Aggregate conference publication volume
    Object.values(state.rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year >= startYear && pub.year <= endYear && publicationMatchesConferenceSet(pub, confSet)) {
                if (!isPublicationForTarget(prof, pub)) {
                    return;
                }
                const conf = pub.area;
                if (stats[pub.year] && Object.prototype.hasOwnProperty.call(stats[pub.year], conf)) {
                    stats[pub.year]![conf] = (stats[pub.year]![conf] || 0) + pub.adjustedcount;
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
        const data = years.map(y => stats[y]![conf] || 0);
        return {
            label: conf.toUpperCase(),
            data: data,
            borderColor: colors[index % colors.length]!,
            backgroundColor: colors[index % colors.length]!,
            tension: 0.3,
            fill: false,
            pointRadius: 3,
            borderWidth: 2
        };
    });

    state.chartInstance = drawChart(ctx, state.chartInstance, {
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
