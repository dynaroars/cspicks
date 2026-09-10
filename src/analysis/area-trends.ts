import { drawChart } from '../charts.js';
import { getConferenceAreaMap, getPublicationSchools, parentMap, publicationMatchesConferenceSet } from '../data.js';
import { areaLabels, escapeHtml } from '../shared.js';
import { calculateAreaMomentum } from '../metrics.js';
import { renderInsightList } from '../analysis-ui.js';
import { state } from './state.js';
import { getConferenceSet, getResearcherPatterns, getTargetName, isPublicationForTarget, renderResearcherAreaInsights } from '../analysis.js';
import type { Professor, Publication } from '../types.js';

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

    const targetName = getTargetName();
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
