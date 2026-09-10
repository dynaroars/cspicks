import { drawChart } from '../charts.js';
import { getConferenceAreaMap, publicationMatchesConferenceSet } from '../data.js';
import { areaLabels } from '../shared.js';
import { calculatePublishingEffort } from '../metrics.js';
import { renderInsightList } from '../analysis-ui.js';
import { state } from './state.js';
import { getConferenceSet, getTargetName } from '../analysis.js';
import { isPubAtSchool } from './area-trends.js';

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
