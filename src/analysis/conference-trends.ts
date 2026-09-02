import { drawChart } from '../charts.js';
import { publicationMatchesConferenceSet } from '../data.js';
import { getConferenceLabel } from '../shared.js';
import { renderInsightList } from '../analysis-ui.js';
import { state } from './state.js';
import { getConferenceSet, getResearcherPatterns, getTargetName, isPublicationForTarget, renderResearcherVenueInsights } from '../analysis.js';
import { publishedVenues, renderConferenceFilters } from './conference-filters.js';

export function renderConferenceTrends() {
    const canvas = document.querySelector<HTMLCanvasElement>('#confTrendsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    const { startYear, endYear } = state.filters;
    const targetName = getTargetName();
    const confSet = getConferenceSet();

    renderConferenceFilters();

    // get list of selected conferences
    const checkedCheckboxes = document.querySelectorAll<HTMLInputElement>('#conf-trends-view input[type="checkbox"]:checked:not(:disabled)');
    const selectedConfs = state.selectedTarget?.type === 'researcher'
        ? [...publishedVenues()]
        : Array.from(checkedCheckboxes).map(cb => cb.value);

    const years = [];
    const stats: Record<number, Record<string, number>> = {}; // year -> { conf -> count }
    for (let y = startYear; y <= endYear; y++) {
        years.push(y);
        stats[y] = {};
        selectedConfs.forEach(conf => {
            stats[y][conf] = 0;
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
