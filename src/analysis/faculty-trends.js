import { drawChart } from '../charts.js';
import { filterByYears, getConferenceAreaMap, getPublicationSchools, parentMap, publicationMatchesConferenceSet } from '../data.js';
import { areaLabels, cleanName, escapeHtml, getConferenceLabel } from '../shared.js';
import { buildPriorPeriodData, calculateAreaMomentum, calculateFragility, calculateParityReport, calculatePerCapita, calculatePublishingEffort, calculateSchoolMetrics, collectVariantRanks, rankStabilityVariants, summarizeRankStability } from '../metrics.js';
import { renderInsightList, renderMetricCards } from '../analysis-ui.js';
import { state } from './state.js';
import { getAnalysisData, getConferenceSet, getTargetName, isPublicationForTarget } from '../analysis.js';

export function renderFacultyTrends() {
    const canvas = document.getElementById('diversityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const years = [];
    const { startYear, endYear } = state.filters;
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

        Object.values(state.rawData.professors).forEach(prof => {
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
