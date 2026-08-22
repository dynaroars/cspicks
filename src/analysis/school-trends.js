import { drawChart } from '../charts.js';
import { filterByYears, getConferenceAreaMap, getPublicationSchools, parentMap, publicationMatchesConferenceSet } from '../data.js';
import { areaLabels, cleanName, escapeHtml, getConferenceLabel } from '../shared.js';
import { buildPriorPeriodData, calculateAreaMomentum, calculateFragility, calculateParityReport, calculatePerCapita, calculatePublishingEffort, calculateSchoolMetrics, collectVariantRanks, rankStabilityVariants, summarizeRankStability } from '../metrics.js';
import { renderInsightList, renderMetricCards } from '../analysis-ui.js';
import { state } from './state.js';
import { getAnalysisData, getConferenceSet, getResearcherPatterns, getTargetName, isPublicationForTarget, renderResearcherActivityMetrics } from '../analysis.js';
import { isPubAtSchool } from './area-trends.js';

export function renderSchoolAnalysisSummary(current, prior, schoolName) {
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
        const canvas = document.getElementById('rankingChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const targetName = getTargetName();
        const { startYear, endYear } = state.filters;
        if (startYear > endYear) return;

        if (state.selectedTarget.type === 'researcher') {
            renderResearcherActivityMetrics(getResearcherPatterns());
            const professor = state.rawData.professors[targetName];
            const confSet = getConferenceSet();
            const labels = [];
            const paperCounts = [];
            const adjustedCounts = [];
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
                                    return index === undefined ? '' : `${paperCounts[index]} papers (${adjustedCounts[index].toFixed(1)} adjusted)`;
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

        const labels = [];
        const rankPoints = [];
        const publicationPoints = [];
        const region = state.filters.region;
        const regionLabel = state.filters.element.querySelector('#region-select')?.selectedOptions?.[0]?.textContent || 'US';

        const windowSize = 10;
        const overallMinYear = startYear - (windowSize - 1);
        const overallMaxYear = endYear;

        // Pre-filter publications once to drastically improve loop performance
        const preFilteredData = {
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
            rankPoints.push(school ? school.rank : null);
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
