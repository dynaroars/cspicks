import Chart from 'chart.js/auto';
import { loadData, loadAffiliationData, filterByYears, getConferenceAreaMap, getPublicationSchools, parentMap, publicationMatchesConferenceSet } from './data.js';
import { areaLabels, escapeHtml, updateChartDefaults } from './shared.js';
import { buildPriorPeriodData, calculateParityReport, calculatePublishingEffort, calculateSchoolMetrics } from './metrics.js';
import bundledRules from './csrankings-rules.generated.js';
import { syncCsrankingsRules } from './csrankings-rules.js';

updateChartDefaults(Chart);

function refreshActiveTabChart() {
    if (currentTab === 'schools') renderSchoolTrends();
    else if (currentTab === 'areas') renderAreaTrends();
    else if (currentTab === 'faculty') renderFacultyTrends();
    else if (currentTab === 'effort') renderSubfieldEffort();
    else if (currentTab === 'conf-trends') renderConferenceTrends();
    else if (currentTab === 'collaboration') renderCollaborationStats();
    else if (currentTab === 'data-health') renderDataHealth();
}

const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
            updateChartDefaults(Chart);
            refreshActiveTabChart();
        }
    });
});
observer.observe(document.documentElement, { attributes: true });

// State
let rawData = [];
let affiliationHistory = null;
let schoolAliases = null;
let chartInstance = null;
let currentTab = 'schools';
let historicalMode = false;
let selectedTarget = { type: 'school', name: 'George Mason University' };
let activeVenueRules = bundledRules;
let venueRulesCheckedAt = null;
let conferenceFilterContext = null;

// DOM Elements Cache
let targetSearchEl = null;
let startYearSelectEl = null;
let endYearSelectEl = null;
let confSetSelectEl = null;
let historicalToggleEl = null;

function cacheDOMElements() {
    targetSearchEl = document.getElementById('analysis-target-search');
    startYearSelectEl = document.getElementById('analysis-start-year');
    endYearSelectEl = document.getElementById('analysis-end-year');
    confSetSelectEl = document.getElementById('analysis-conf-set');
    historicalToggleEl = document.getElementById('analysis-historical-mode');
}

async function init() {
    console.log('Initializing Analysis Dashboard...');
    try {
        [rawData, activeVenueRules] = await Promise.all([loadData(), syncCsrankingsRules()]);
        venueRulesCheckedAt = new Date();

        cacheDOMElements();
        setupYearSelectors();
        renderConferenceFilters();
        setupConferenceSet();
        setupHistoricalMode();
        setupTabs();
        setupTargetSearch();
        setupConferenceFilterButtons();
        renderSchoolTrends();
    } catch (err) {
        console.error('Analysis load error:', err);
    }
}

async function ensureHistoricalData() {
    if (affiliationHistory !== null && schoolAliases !== null) return;
    const data = await loadAffiliationData();
    affiliationHistory = data.historyMap;
    schoolAliases = data.aliasMap;
}

function setupTargetSearch() {
    if (!targetSearchEl) return;
    const options = document.getElementById('analysis-target-options');
    const schools = Object.values(rawData.schools)
        .filter(school => school.country === 'us')
        .map(school => school.name)
        .sort();
    const researchers = Object.keys(rawData.professors).sort();
    const targetsByName = new Map();

    schools.forEach(name => targetsByName.set(name.toLowerCase(), { type: 'school', name }));
    researchers.forEach(name => {
        const key = name.toLowerCase();
        if (!targetsByName.has(key)) targetsByName.set(key, { type: 'researcher', name });
    });

    if (options) {
        options.innerHTML = [
            ...schools.map(name => `<option value="${escapeHtml(name)}" label="University"></option>`),
            ...researchers.map(name => `<option value="${escapeHtml(name)}" label="Researcher"></option>`)
        ].join('');
    }

    const requestedTarget = new URLSearchParams(window.location.search).get('target');
    const linkedTarget = requestedTarget && targetsByName.get(requestedTarget.toLowerCase());
    if (linkedTarget) {
        selectedTarget = linkedTarget;
        targetSearchEl.value = linkedTarget.name;
    }

    const selectTarget = () => {
        const query = targetSearchEl.value.trim().toLowerCase();
        let target = targetsByName.get(query);
        if (!target) {
            const matches = [...targetsByName.entries()].filter(([name]) => name.includes(query));
            if (matches.length === 1) {
                target = matches[0][1];
                targetSearchEl.value = target.name;
            }
        }
        if (!target || (target.type === selectedTarget.type && target.name === selectedTarget.name)) return;
        selectedTarget = target;
        updateTargetMode();
        refreshActiveTabChart();
    };
    targetSearchEl.addEventListener('input', selectTarget);
    targetSearchEl.addEventListener('change', selectTarget);
    updateTargetMode();
}

function updateTargetMode() {
    const researcherMode = selectedTarget.type === 'researcher';
    document.querySelectorAll('[data-school-only]').forEach(tab => {
        tab.style.display = researcherMode ? 'none' : 'inline-flex';
    });
    const historyControls = document.querySelector('.analysis-checkboxes');
    if (historyControls) historyControls.style.display = researcherMode ? 'none' : 'flex';

    const activeTab = document.querySelector(`.nav-tab[data-tab="${currentTab}"]`);
    if (researcherMode && activeTab?.hasAttribute('data-school-only')) {
        document.querySelector('.nav-tab[data-tab="schools"]')?.click();
    }
}

function getTargetName() {
    return selectedTarget.name;
}

function isPublicationForTarget(prof, pub) {
    if (selectedTarget.type === 'researcher') return prof.name === selectedTarget.name;
    return isPubAtSchool(prof, pub, selectedTarget.name);
}

function setupYearSelectors() {
    if (!startYearSelectEl || !endYearSelectEl) return;
    const currentYear = new Date().getFullYear();

    for (let y = 2000; y <= currentYear; y++) {
        endYearSelectEl.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
        startYearSelectEl.innerHTML += `<option value="${y}" ${y === currentYear - 10 ? 'selected' : ''}>${y}</option>`;
    }
    const refresh = () => {
        refreshActiveTabChart();
    };
    startYearSelectEl.addEventListener('change', refresh);
    endYearSelectEl.addEventListener('change', refresh);
}

function getConferenceSet() {
    return confSetSelectEl?.value || 'csrankings-default';
}

function setupConferenceSet() {
    if (!confSetSelectEl) return;
    confSetSelectEl.addEventListener('change', () => {
        refreshActiveTabChart();
    });
}

function setupHistoricalMode() {
    if (historicalToggleEl) {
        historicalToggleEl.addEventListener('change', async () => {
            historicalToggleEl.disabled = true;
            try {
                if (historicalToggleEl.checked) await ensureHistoricalData();
                historicalMode = historicalToggleEl.checked;
                refreshActiveTabChart();
            } catch (error) {
                console.error('Failed to load historical affiliation data:', error);
                historicalToggleEl.checked = false;
                historicalMode = false;
                window.alert('Historical affiliation data could not be loaded. Please try again.');
            } finally {
                historicalToggleEl.disabled = false;
            }
        });
    }
}

function setupTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // UI Toggle
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // View Toggle
            document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
            const tabName = tab.dataset.tab;
            currentTab = tabName;

            if (tabName === 'schools') {
                document.getElementById('school-trends-view').style.display = 'block';
                renderSchoolTrends();
            } else if (tabName === 'areas') {
                document.getElementById('area-growth-view').style.display = 'block';
                renderAreaTrends();
            } else if (tabName === 'faculty') {
                document.getElementById('faculty-diversity-view').style.display = 'block';
                renderFacultyTrends();
            } else if (tabName === 'effort') {
                document.getElementById('effort-view').style.display = 'block';
                renderSubfieldEffort();
            } else if (tabName === 'conf-trends') {
                document.getElementById('conf-trends-view').style.display = 'block';
                renderConferenceTrends();
            } else if (tabName === 'collaboration') {
                document.getElementById('collaboration-view').style.display = 'block';
                renderCollaborationStats();
            } else if (tabName === 'data-health') {
                document.getElementById('data-health-view').style.display = 'block';
                renderDataHealth();
            }
        });
    });
}

function getAnalysisData() {
    const end = parseInt(endYearSelectEl?.value) || new Date().getFullYear();
    const start = parseInt(startYearSelectEl?.value) || end - 10;
    const history = historicalMode ? affiliationHistory : null;
    const aliases = historicalMode ? schoolAliases : null;
    const confSet = getConferenceSet();
    const current = filterByYears(rawData, start, end, 'us', history, aliases, confSet);
    const prior = buildPriorPeriodData(rawData, start, end, 'us', history, aliases, confSet);
    return { current, prior, start, end, confSet };
}

function renderCollaborationStats() {
    const container = document.getElementById('collaboration-stats');
    if (!container || !rawData?.professors) return;
    const { current, prior } = getAnalysisData();
    const schoolName = getTargetName();
    const metrics = calculateSchoolMetrics(current, prior, schoolName);
    if (!metrics) {
        container.innerHTML = '<p>No collaboration statistics are available for this selection.</p>';
        return;
    }

    const leaders = Object.values(current.schools)
        .map(school => ({ school, metrics: calculateSchoolMetrics(current, prior, school.name) }))
        .filter(item => item.metrics)
        .sort((a, b) => b.metrics.impliedTeamSize - a.metrics.impliedTeamSize)
        .slice(0, 10);

    container.innerHTML = `
        <h2>${escapeHtml(schoolName)} collaboration profile</h2>
        <div class="diagnostic-grid">
            <div class="diagnostic-stat"><span>Team-size proxy</span><strong>${metrics.impliedTeamSize.toFixed(2)}×</strong><small>raw credit ÷ fractional credit</small></div>
            <div class="diagnostic-stat"><span>Fraction retained</span><strong>${metrics.collaborationRetention.toFixed(0)}%</strong><small>after coauthor adjustment</small></div>
            <div class="diagnostic-stat"><span>Top-3 concentration</span><strong>${metrics.top3Share.toFixed(0)}%</strong><small>share of department credit</small></div>
            <div class="diagnostic-stat"><span>Median / faculty</span><strong>${metrics.medianPerFaculty.toFixed(1)}</strong><small>fractional publication credit</small></div>
        </div>
        <div class="data-caveat"><strong>Source limitation:</strong> CSRankings aggregate rows do not expose paper identifiers or coauthor affiliations, so CSPicks cannot reliably separate internal from cross-university collaborations. The proxy above measures coauthor intensity without inventing that split.</div>
        <h3>Highest team-size proxies</h3>
        <div class="metric-table">${leaders.map((item, index) => `<div><span>${index + 1}. ${escapeHtml(item.school.name)}</span><strong>${item.metrics.impliedTeamSize.toFixed(2)}×</strong></div>`).join('')}</div>
    `;
}

function renderDataHealth() {
    const container = document.getElementById('data-health-stats');
    if (!container || !rawData?.professors) return;
    const { current, start, end, confSet } = getAnalysisData();
    const report = calculateParityReport(rawData, current, confSet);
    const syncDate = venueRulesCheckedAt || new Date(activeVenueRules.syncedAt);
    const syncText = Number.isNaN(syncDate.getTime()) ? 'Unknown' : syncDate.toLocaleString();
    const parityOk = report.totalMismatches === 0 && report.rankOrderIssues === 0 && report.officialVenueMode;

    container.innerHTML = `
        <h2>CSRankings compatibility · ${start}–${end}</h2>
        <p class="summary-note">This audit checks the canonical CSRankings inputs, selected venue mode, source coverage, and ranking invariants used by CSPicks.</p>
        <div class="diagnostic-grid">
            <div class="diagnostic-stat"><span>Parity checks</span><strong class="${parityOk ? 'confidence-high' : 'confidence-review'}">${parityOk ? 'Pass' : 'Review'}</strong><small>${report.totalMismatches + report.rankOrderIssues} inconsistencies</small></div>
            <div class="diagnostic-stat"><span>Ranked schools</span><strong>${report.rankedSchools}</strong><small>from ${report.sourceFaculty} source faculty</small></div>
            <div class="diagnostic-stat"><span>Institution metadata</span><strong>${report.institutionCoverage.toFixed(0)}%</strong><small>country or region present</small></div>
            <div class="diagnostic-stat"><span>Author profiles</span><strong>${report.profileCoverage.toFixed(0)}%</strong><small>homepage or Scholar ID present</small></div>
            <div class="diagnostic-stat"><span>Venue rules checked</span><strong>${escapeHtml(syncText)}</strong><small>upstream CSRankings parser · ${escapeHtml(activeVenueRules.sourceVersion || 'bundled fallback')}</small></div>
        </div>
        <div class="data-caveat">A passing audit means CSPicks is internally compatible with the selected canonical inputs. The official site can still differ temporarily when its deployed data or defaults update before this page reloads.</div>
    `;
}



async function renderSchoolTrends() {
    try {
        const canvas = document.getElementById('rankingChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        const targetName = getTargetName();
        const endYear = parseInt(endYearSelectEl?.value) || new Date().getFullYear();
        const startYear = parseInt(startYearSelectEl?.value) || endYear - 10;
        if (startYear > endYear) return;

        if (selectedTarget.type === 'researcher') {
            const professor = rawData.professors[targetName];
            const confSet = getConferenceSet();
            const labels = [];
            const dataPoints = [];
            for (let year = startYear; year <= endYear; year++) {
                labels.push(year);
                dataPoints.push((professor?.pubs || [])
                    .filter(pub => pub.year === year && publicationMatchesConferenceSet(pub, confSet))
                    .reduce((sum, pub) => sum + pub.adjustedcount, 0));
            }

            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: `${targetName} (Fractional Publication Credit)`,
                        data: dataPoints,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.2,
                        fill: true,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    devicePixelRatio: 2,
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            title: { display: true, text: 'Fractional Publication Credit' },
                            beginAtZero: true
                        }
                    },
                    plugins: {
                        title: { display: true, text: `Publication Trends for ${targetName}` }
                    }
                }
            });
            return;
        }

        const targetSchool = targetName;

        const labels = [];
        const dataPoints = [];
        const region = 'us';

        console.log('Calculating trends for', targetSchool, 'from', startYear, 'to', endYear);

        const windowSize = 10;
        const overallMinYear = startYear - (windowSize - 1);
        const overallMaxYear = endYear;

        // Pre-filter publications once to drastically improve loop performance
        const preFilteredData = {
            schools: rawData.schools,
            professors: {}
        };
        Object.entries(rawData.professors).forEach(([name, prof]) => {
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

            const result = filterByYears(preFilteredData, wStart, wEnd, region, historicalMode ? affiliationHistory : null, historicalMode ? schoolAliases : null, getConferenceSet());
            const school = result.schools[targetSchool];

            labels.push(y);
            dataPoints.push(school ? school.rank : null);
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${targetSchool} (Rank in US)`,
                    data: dataPoints,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.2,
                    fill: {
                        target: 'end',
                        below: 'rgba(16, 185, 129, 0.1)'
                    },
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                devicePixelRatio: 2,
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        reverse: true,
                        title: { display: true, text: 'US Rank (10-year window)' },
                        suggestedMin: 1,
                        suggestedMax: 100
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                        }
                    }
                }
            }
        });
    } catch (e) {
        console.error('Error rendering school trends:', e);
    }
}

function isPubAtSchool(prof, pub, targetSchool) {
    if (!historicalMode) return prof.affiliation === targetSchool;
    return getPublicationSchools(prof, pub, affiliationHistory, schoolAliases).includes(targetSchool);
}

// ------------------
//    AREA TRENDS
// ------------------
function renderAreaTrends() {
    const canvas = document.getElementById('areaChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    const years = [];
    const endYear = parseInt(endYearSelectEl?.value) || new Date().getFullYear();
    const startYear = parseInt(startYearSelectEl?.value) || endYear - 10;

    const stats = {};
    for (let y = startYear; y <= endYear; y++) {
        years.push(y);
        stats[y] = {};
    }

    if (!rawData || !rawData.professors) {
        console.error('No rawData available for Area Trends');
        return;
    }

    const targetName = getTargetName();
    const confSet = getConferenceSet();
    const confMap = getConferenceAreaMap(confSet);

    Object.values(rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year >= startYear && pub.year <= endYear && publicationMatchesConferenceSet(pub, confSet)) {
                if (isPublicationForTarget(prof, pub)) {
                    const area = confMap[pub.area] || pub.area;
                    if (!stats[pub.year][area]) stats[pub.year][area] = 0;
                    stats[pub.year][area] += pub.adjustedcount;
                }
            }
        });
    });

    const areaTotals = {};
    Object.values(stats).forEach(yearStats => {
        Object.entries(yearStats).forEach(([area, count]) => {
            areaTotals[area] = (areaTotals[area] || 0) + count;
        });
    });

    const topAreas = Object.entries(areaTotals)
        .sort(([, a], [, b]) => b - a)

        .map(([area]) => area);

    const datasets = topAreas.map((area, index) => {
        const data = years.map(y => stats[y][area] || 0);

        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
            '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6',
            '#06b6d4', '#f97316'
        ];

        return {
            label: areaLabels[area] || area,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            tension: 0.3,
            fill: false,
            pointRadius: 3,
            borderWidth: 2
        };
    });

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: datasets
        },
        options: {
            devicePixelRatio: 2,
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            scales: {
                y: {
                    title: { display: true, text: 'Adjusted Paper Count' },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: `Top Research Areas Growth for ${targetName}`
                }
            }
        }
    });

    const legendContainer = document.getElementById('area-legend');
    if (legendContainer) {
        legendContainer.innerHTML = '<div style="font-weight: 600; margin-bottom: 0.5rem;">Areas</div>' +
            datasets.map((ds, i) => `
                <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; cursor: pointer;">
                    <input type="checkbox" checked data-index="${i}" style="accent-color: ${ds.borderColor};">
                    <span>${ds.label}</span>
                </label>
            `).join('');

        legendContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                chartInstance.setDatasetVisibility(index, e.target.checked);
                chartInstance.update();
            });
        });
    }
}

// --------------------------------------------------------------------------
// FACULTY DIVERSITY TRENDS
// --------------------------------------------------------------------------
function renderFacultyTrends() {
    const canvas = document.getElementById('diversityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    const years = [];
    const endYear = parseInt(endYearSelectEl?.value) || new Date().getFullYear();
    const startYear = parseInt(startYearSelectEl?.value) || endYear - 10;
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

        Object.values(rawData.professors).forEach(prof => {
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

    chartInstance = new Chart(ctx, {
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
            devicePixelRatio: 2,
            responsive: true,
            maintainAspectRatio: false,
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

function setupConferenceFilterButtons() {
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

function renderConferenceFilters() {
    const container = document.getElementById('conf-checkbox-groups');
    if (!container) return;

    const startYear = parseInt(startYearSelectEl?.value) || 2010;
    const endYear = parseInt(endYearSelectEl?.value) || new Date().getFullYear();
    const confSet = getConferenceSet();
    const context = [
        selectedTarget.type,
        selectedTarget.name,
        startYear,
        endYear,
        confSet,
        historicalMode
    ].join('|');

    // Preserve checkbox choices while merely redrawing the chart. A changed
    // analysis context gets a fresh list with all actually published venues
    // selected by default.
    if (conferenceFilterContext === context) return;
    conferenceFilterContext = context;

    const publishedConferences = new Set();
    Object.values(rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year < startYear || pub.year > endYear) return;
            if (!publicationMatchesConferenceSet(pub, confSet)) return;
            if (isPublicationForTarget(prof, pub)) publishedConferences.add(pub.area);
        });
    });

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
    const venues = Object.entries(parentMap)
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
function renderSubfieldEffort() {
    const canvas = document.getElementById('effortChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    const startYear = parseInt(startYearSelectEl?.value) || 2016;
    const endYear = parseInt(endYearSelectEl?.value) || new Date().getFullYear();
    const targetSchool = getTargetName();
    const confSet = getConferenceSet();
    const effort = calculatePublishingEffort(rawData.professors, {
        startYear,
        endYear,
        parentAreas: getConferenceAreaMap(confSet),
        includesPublication: (prof, pub) => publicationMatchesConferenceSet(pub, confSet) && isPubAtSchool(prof, pub, targetSchool)
    });
    const chartData = effort.subfields.map(item => ({
        ...item,
        label: areaLabels[item.subfield] || item.subfield
    }));

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const barColor = isDark ? '#36c5f0' : '#475569';

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.map(d => d.label),
            datasets: [{
                label: 'Fractional Papers/Active Faculty/Year',
                data: chartData.map(d => d.effort),
                backgroundColor: barColor,
                borderColor: barColor,
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            devicePixelRatio: 2,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Fractional Papers / Active Faculty / Year' },
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
                    text: `Publishing Effort at ${targetSchool} (${startYear}-${endYear})`
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function (context) {
                            const dataIndex = context.dataIndex;
                            const d = chartData[dataIndex];
                            return [
                                `Fractional papers: ${d.total.toFixed(2)}`,
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

function renderConferenceTrends() {
    const canvas = document.getElementById('confTrendsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    const startYear = parseInt(startYearSelectEl?.value) || 2010;
    const endYear = parseInt(endYearSelectEl?.value) || new Date().getFullYear();
    const targetName = getTargetName();
    const confSet = getConferenceSet();

    renderConferenceFilters();

    // get list of selected conferences
    const checkedCheckboxes = document.querySelectorAll('#conf-trends-view input[type="checkbox"]:checked:not(:disabled)');
    const selectedConfs = Array.from(checkedCheckboxes).map(cb => cb.value);

    const years = [];
    const stats = {}; // year -> { conf -> count }
    for (let y = startYear; y <= endYear; y++) {
        years.push(y);
        stats[y] = {};
        selectedConfs.forEach(conf => {
            stats[y][conf] = 0;
        });
    }

    // Aggregate conference publication volume
    Object.values(rawData.professors).forEach(prof => {
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

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: datasets
        },
        options: {
            devicePixelRatio: 2,
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                y: {
                    title: { display: true, text: 'Fractional Publication Credit' },
                    beginAtZero: true
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Conference Fractional Publication Trends for ${targetName} (${startYear}-${endYear})`
                }
            }
        }
    });
}

init();
