import Chart from 'chart.js/auto';
import { loadData, loadAffiliationData, filterByYears, getPublicationSchools, parentMap } from './data.js';
import { areaLabels, escapeHtml, updateChartDefaults } from './shared.js';
import { buildPriorPeriodData, calculateParityReport, calculateSchoolMetrics } from './metrics.js';
import bundledRules from './csrankings-rules.generated.js';
import { syncCsrankingsRules } from './csrankings-rules.js';

updateChartDefaults(Chart);

function refreshActiveTabChart() {
    if (currentTab === 'schools') renderSchoolTrends();
    else if (currentTab === 'areas') renderAreaTrends();
    else if (currentTab === 'faculty') renderFacultyTrends();
    else if (currentTab === 'effort') renderSubfieldEffort();
    else if (currentTab === 'ai-trends') renderAITrends();
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
let focusSchoolOnly = false;
let activeVenueRules = bundledRules;
let venueRulesCheckedAt = null;

// DOM Elements Cache
let schoolSelectEl = null;
let startYearSelectEl = null;
let endYearSelectEl = null;
let historicalToggleEl = null;
let focusToggleEl = null;

function cacheDOMElements() {
    schoolSelectEl = document.getElementById('analysis-school-select');
    startYearSelectEl = document.getElementById('analysis-start-year');
    endYearSelectEl = document.getElementById('analysis-end-year');
    historicalToggleEl = document.getElementById('analysis-historical-mode');
    focusToggleEl = document.getElementById('analysis-focus-mode');
}

async function init() {
    console.log('Initializing Analysis Dashboard...');
    try {
        [rawData, activeVenueRules] = await Promise.all([loadData(), syncCsrankingsRules()]);
        venueRulesCheckedAt = new Date();

        cacheDOMElements();
        populateSchoolSelect();
        setupYearSelectors();
        setupHistoricalMode();
        setupFocusMode();
        setupTabs();
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

function populateSchoolSelect() {
    if (!schoolSelectEl) return;
    const allData = filterByYears(rawData, 2020, 2025, 'us');
    const schools = Object.keys(allData.schools).sort();

    schoolSelectEl.innerHTML = schools.map(s =>
        `<option value="${escapeHtml(s)}" ${s === 'George Mason University' ? 'selected' : ''}>${escapeHtml(s)}</option>`
    ).join('');

    schoolSelectEl.addEventListener('change', () => {
        refreshActiveTabChart();
    });
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

function setupFocusMode() {
    if (focusToggleEl) {
        focusToggleEl.addEventListener('change', () => {
            focusSchoolOnly = focusToggleEl.checked;
            refreshActiveTabChart();
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
            } else if (tabName === 'ai-trends') {
                document.getElementById('ai-trends-view').style.display = 'block';
                renderAITrends();
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
    const current = filterByYears(rawData, start, end, 'us', history, aliases, 'csrankings-default');
    const prior = buildPriorPeriodData(rawData, start, end, 'us', history, aliases, 'csrankings-default');
    return { current, prior, start, end };
}

function renderCollaborationStats() {
    const container = document.getElementById('collaboration-stats');
    if (!container || !rawData?.professors) return;
    const { current, prior } = getAnalysisData();
    const schoolName = schoolSelectEl?.value;
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
    const { current, start, end } = getAnalysisData();
    const report = calculateParityReport(rawData, current, 'csrankings-default');
    const syncDate = venueRulesCheckedAt || new Date(activeVenueRules.syncedAt);
    const syncText = Number.isNaN(syncDate.getTime()) ? 'Unknown' : syncDate.toLocaleString();
    const parityOk = report.totalMismatches === 0 && report.rankOrderIssues === 0 && report.officialVenueMode;

    container.innerHTML = `
        <h2>CSRankings compatibility · ${start}–${end}</h2>
        <p class="summary-note">This audit checks the canonical CSRankings inputs, default venue mode, fractional-credit totals, and ranking invariants used by CSPicks.</p>
        <div class="diagnostic-grid">
            <div class="diagnostic-stat"><span>Parity checks</span><strong class="${parityOk ? 'confidence-high' : 'confidence-review'}">${parityOk ? 'Pass' : 'Review'}</strong><small>${report.totalMismatches + report.rankOrderIssues} inconsistencies</small></div>
            <div class="diagnostic-stat"><span>Ranked schools</span><strong>${report.rankedSchools}</strong><small>from ${report.sourceFaculty} source faculty</small></div>
            <div class="diagnostic-stat"><span>Institution metadata</span><strong>${report.institutionCoverage.toFixed(0)}%</strong><small>country or region present</small></div>
            <div class="diagnostic-stat"><span>Author profiles</span><strong>${report.profileCoverage.toFixed(0)}%</strong><small>homepage or Scholar ID present</small></div>
            <div class="diagnostic-stat"><span>Fractional credit</span><strong class="confidence-high">Always on</strong><small>no raw-credit ranking path</small></div>
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

        const targetSchool = schoolSelectEl?.value || 'George Mason University';
        const endYear = parseInt(endYearSelectEl?.value) || new Date().getFullYear();
        const startYear = parseInt(startYearSelectEl?.value) || endYear - 10;
        if (startYear > endYear) return;

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

            const result = filterByYears(preFilteredData, wStart, wEnd, region, historicalMode ? affiliationHistory : null, historicalMode ? schoolAliases : null);
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
    const currentYear = new Date().getFullYear();
    const startYear = 2010;

    const stats = {};
    for (let y = startYear; y <= currentYear; y++) {
        years.push(y);
        stats[y] = {};
    }

    if (!rawData || !rawData.professors) {
        console.error('No rawData available for Area Trends');
        return;
    }

    const targetSchool = schoolSelectEl?.value || 'George Mason University';

    Object.values(rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year >= startYear && pub.year <= currentYear) {
                if (isPubAtSchool(prof, pub, targetSchool)) {
                    const area = parentMap[pub.area] || pub.area;
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
                    text: `Top Research Areas Growth at ${targetSchool}`
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
                    <span style="width: 12px; height: 12px; background: ${ds.borderColor}; border-radius: 2px;"></span>
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
    const currentYear = new Date().getFullYear();
    const startYear = 2010;
    const windowSize = 3; // 3-year window for diversity check

    const diversityRates = [];
    const facultyCounts = [];
    const multiAreaCounts = [];
    const targetSchool = schoolSelectEl?.value || 'George Mason University';

    for (let y = startYear; y <= currentYear; y++) {
        years.push(y);

        const wStart = y - windowSize + 1;
        const wEnd = y;

        // Count distinct areas per author in this window
        const authorAreas = {};

        Object.values(rawData.professors).forEach(prof => {
            prof.pubs.forEach(pub => {
                if (pub.year >= wStart && pub.year <= wEnd) {
                    if (isPubAtSchool(prof, pub, targetSchool)) {
                        if (!authorAreas[prof.name]) authorAreas[prof.name] = new Set();
                        const area = parentMap[pub.area] || pub.area;
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
    const selectMajorBtn = document.getElementById('conf-select-major');

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('#conf-trends-view input[type="checkbox"]').forEach(cb => {
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

    if (selectMajorBtn) {
        const majorConfs = [
            'cvpr', 'nips', 'iclr', 'icml', 'acl', 'pldi', 'popl',
            'sigcomm', 'nsdi', 'osdi', 'sosp', 'focs', 'stoc',
            'siggraph', 'chiconf', 'icse', 'fse', 'sigmod', 'vldb',
            'ccs', 'oakland', 'usenixsec'
        ];
        selectMajorBtn.addEventListener('click', () => {
            document.querySelectorAll('#conf-trends-view input[type="checkbox"]').forEach(cb => {
                cb.checked = majorConfs.includes(cb.value);
            });
            renderConferenceTrends();
        });
    }

    // Add change listeners to each checkbox to update chart on the fly
    document.querySelectorAll('#conf-trends-view input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            renderConferenceTrends();
        });
    });
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
    const numYears = endYear - startYear + 1;
    const targetSchool = schoolSelectEl?.value || 'George Mason University';

    // calculate effort based on all professors in the dataset during the active period
    const subfieldRates = {}; // subfield -> array of rates

    Object.values(rawData.professors).forEach(prof => {
        const profSubfieldCounts = {}; // subfield -> sum of adjusted count
        prof.pubs.forEach(pub => {
            if (pub.year >= startYear && pub.year <= endYear) {
                if (focusSchoolOnly && !isPubAtSchool(prof, pub, targetSchool)) {
                    return;
                }
                const subfield = parentMap[pub.area] || pub.area;
                profSubfieldCounts[subfield] = (profSubfieldCounts[subfield] || 0) + pub.adjustedcount;
            }
        });

        // For each subfield where the professor published, record their rate
        Object.entries(profSubfieldCounts).forEach(([subfield, adjSum]) => {
            if (adjSum > 0) {
                if (!subfieldRates[subfield]) subfieldRates[subfield] = [];
                subfieldRates[subfield].push(adjSum / numYears);
            }
        });
    });

    const subfields = [...new Set(Object.values(parentMap))];
    const chartData = subfields.map(sf => {
        const rates = subfieldRates[sf] || [];
        // median
        let median = 0;
        if (rates.length > 0) {
            rates.sort((a, b) => a - b);
            const mid = Math.floor(rates.length / 2);
            median = rates.length % 2 !== 0 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
        }
        return {
            subfield: sf,
            label: areaLabels[sf] || sf,
            median: median,
            count: rates.length // number of active researchers
        };
    });

    // Sort by median descending
    chartData.sort((a, b) => b.median - a.median);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const barColor = isDark ? '#36c5f0' : '#475569';

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.map(d => d.label),
            datasets: [{
                label: 'Median Papers/Faculty/Year',
                data: chartData.map(d => d.median),
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
                    title: { display: true, text: 'Median Adjusted Papers / Year' },
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
                    text: focusSchoolOnly
                        ? `Subfield Effort Index at ${targetSchool} (${startYear}-${endYear}): Median Pubs/Faculty/Year`
                        : `Subfield Effort Index (${startYear}-${endYear}): Median Pubs/Faculty/Year per Subfield`
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function (context) {
                            const dataIndex = context.dataIndex;
                            const d = chartData[dataIndex];
                            return `Active Researchers: ${d.count}`;
                        }
                    }
                }
            }
        }
    });
}

function renderAITrends() {
    const canvas = document.getElementById('aiTrendsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    const startYear = parseInt(startYearSelectEl?.value) || 2005;
    const endYear = parseInt(endYearSelectEl?.value) || new Date().getFullYear();
    const targetSchool = schoolSelectEl?.value || 'George Mason University';

    const years = [];
    const stats = {}; // year -> { subfield -> sum }
    for (let y = startYear; y <= endYear; y++) {
        years.push(y);
        stats[y] = { 'ai': 0, 'vision': 0, 'mlmining': 0, 'nlp': 0, 'robotics': 0, 'visualization': 0 };
    }

    // iterate over all professors and sum their publications in these subfields
    Object.values(rawData.professors).forEach(prof => {
        prof.pubs.forEach(pub => {
            if (pub.year >= startYear && pub.year <= endYear) {
                if (focusSchoolOnly && !isPubAtSchool(prof, pub, targetSchool)) {
                    return;
                }
                const subfield = parentMap[pub.area] || pub.area;
                if (stats[pub.year] && Object.prototype.hasOwnProperty.call(stats[pub.year], subfield)) {
                    stats[pub.year][subfield] += pub.adjustedcount;
                }
            }
        });
    });

    const aiSubfields = ['ai', 'vision', 'mlmining', 'nlp', 'robotics', 'visualization'];
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

    const datasets = aiSubfields.map((sf, index) => {
        const data = years.map(y => stats[y][sf]);
        return {
            label: areaLabels[sf] || sf,
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
                    title: { display: true, text: 'Total Adjusted Publication Volume' },
                    beginAtZero: true
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: focusSchoolOnly
                        ? `AI Subfields Growth at ${targetSchool} (${startYear}-${endYear})`
                        : `Global Growth of AI Subfields (${startYear}-${endYear})`
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
    const targetSchool = schoolSelectEl?.value || 'George Mason University';

    // get list of selected conferences
    const checkedCheckboxes = document.querySelectorAll('#conf-trends-view input[type="checkbox"]:checked');
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
            if (pub.year >= startYear && pub.year <= endYear) {
                if (focusSchoolOnly && !isPubAtSchool(prof, pub, targetSchool)) {
                    return;
                }
                const conf = pub.area;
                if (stats[pub.year] && Object.prototype.hasOwnProperty.call(stats[pub.year], conf)) {
                    stats[pub.year][conf] += pub.count;
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
                    title: { display: true, text: 'Total Publications (Paper Count)' },
                    beginAtZero: true
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: focusSchoolOnly
                        ? `Conference Publication Volume Trends at ${targetSchool} (${startYear}-${endYear})`
                        : `Conference Publication Volume Trends (${startYear}-${endYear})`
                }
            }
        }
    });
}

init();
