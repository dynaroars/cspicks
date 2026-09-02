import { drawChart } from '../charts.js';
import { getConferenceAreaMap, parentMap, publicationMatchesConferenceSet } from '../data.js';
import { calculateParityReport } from '../metrics.js';
import { renderInsightList } from '../analysis-ui.js';
import { state } from './state.js';
import { getConferenceSet, getTargetName } from '../analysis.js';
import { isPubAtSchool } from './area-trends.js';

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
