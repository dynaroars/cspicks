import Chart from 'chart.js/auto';
import { loadData, filterByYears, parentMap } from './data.js';
import { areaLabels, updateChartDefaults } from './shared.js';

updateChartDefaults(Chart);

function refreshActiveTabChart() {
    if (currentTab === 'schools') renderSchoolTrends();
    else if (currentTab === 'areas') renderAreaTrends();
    else if (currentTab === 'faculty') renderFacultyTrends();
    else if (currentTab === 'effort') renderSubfieldEffort();
    else if (currentTab === 'ai-trends') renderAITrends();
    else if (currentTab === 'conf-trends') renderConferenceTrends();
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
let affiliationHistory = {};
let schoolAliases = {};
let chartInstance = null;
let currentTab = 'schools';
let historicalMode = false;
let focusSchoolOnly = false;

async function init() {
    console.log('Initializing Analysis Dashboard...');
    try {
        const GITHUB_RAW = 'https://raw.githubusercontent.com/dynaroars/cspicks/main/public';
        const [data, history, aliases] = await Promise.all([
            loadData(),
            fetch(`${GITHUB_RAW}/professor_history_openalex.json`).then(res => res.ok ? res.json() : {}).catch(e => ({})),
            fetch(`${GITHUB_RAW}/school-aliases.json`).then(res => res.ok ? res.json() : {}).catch(e => ({})),
        ]);
        rawData = data;
        affiliationHistory = history;
        schoolAliases = aliases;

        console.log('Data loaded:', rawData.length, 'records, history for', Object.keys(affiliationHistory).length, 'profs, aliases for', Object.keys(schoolAliases).length, 'schools');

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

function populateSchoolSelect() {
    const select = document.getElementById('analysis-school-select');
    const allData = filterByYears(rawData, 2020, 2025, 'us');
    const schools = Object.keys(allData.schools).sort();

    select.innerHTML = schools.map(s =>
        `<option value="${s}" ${s === 'George Mason University' ? 'selected' : ''}>${s}</option>`
    ).join('');

    select.addEventListener('change', () => {
        refreshActiveTabChart();
    });
}

function setupYearSelectors() {
    const startSelect = document.getElementById('analysis-start-year');
    const endSelect = document.getElementById('analysis-end-year');
    const currentYear = new Date().getFullYear();

    for (let y = 2000; y <= currentYear; y++) {
        endSelect.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
        startSelect.innerHTML += `<option value="${y}" ${y === currentYear - 10 ? 'selected' : ''}>${y}</option>`;
    }
    const refresh = () => {
        refreshActiveTabChart();
    };
    startSelect.addEventListener('change', refresh);
    endSelect.addEventListener('change', refresh);
}

function setupHistoricalMode() {
    const historicalToggle = document.getElementById('analysis-historical-mode');
    if (historicalToggle) {
        historicalToggle.addEventListener('change', () => {
            historicalMode = historicalToggle.checked;
            refreshActiveTabChart();
        });
    }
}

function setupFocusMode() {
    const focusToggle = document.getElementById('analysis-focus-mode');
    if (focusToggle) {
        focusToggle.addEventListener('change', () => {
            focusSchoolOnly = focusToggle.checked;
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
            }
        });
    });
}



async function renderSchoolTrends() {
    try {
        if (chartInstance) chartInstance.destroy();

        const ctx = document.getElementById('rankingChart')?.getContext('2d');
        if (!ctx) {
            console.error('Canvas rankingChart not found');
            return;
        }
        const targetSchool = document.getElementById('analysis-school-select')?.value || 'George Mason University';
        const endYear = parseInt(document.getElementById('analysis-end-year')?.value) || new Date().getFullYear();
        const startYear = endYear - 10;


        const labels = [];
        const dataPoints = [];
        const region = 'us';

        console.log('Calculating trends for', targetSchool, 'from', startYear, 'to', endYear);

        const windowSize = endYear - startYear;
        for (let y = endYear - 9; y <= endYear; y++) {
            const wStart = Math.max(startYear, y - windowSize);
            const wEnd = y;

            const result = filterByYears({ ...rawData }, wStart, wEnd, region, historicalMode ? affiliationHistory : null, historicalMode ? schoolAliases : null);
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
    if (historicalMode) {
        if (affiliationHistory && affiliationHistory[prof.name]) {
            const matches = affiliationHistory[prof.name].filter(seg => pub.year >= seg.start && pub.year <= seg.end);
            if (matches.length > 0) {
                return matches.some(h => {
                    const normalized = schoolAliases[h.school] || h.school;
                    return normalized === targetSchool;
                });
            }
        }
        return prof.affiliation === targetSchool;
    } else {
        return prof.affiliation === targetSchool;
    }
}

// ------------------
//    AREA TRENDS
// ------------------
function renderAreaTrends() {
    if (chartInstance) chartInstance.destroy();

    const ctx = document.getElementById('areaChart').getContext('2d');

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

    const targetSchool = document.getElementById('analysis-school-select')?.value || 'George Mason University';

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
    if (chartInstance) chartInstance.destroy();

    const ctx = document.getElementById('diversityChart').getContext('2d');

    const years = [];
    const currentYear = new Date().getFullYear();
    const startYear = 2010;
    const windowSize = 3; // 3-year window for diversity check

    const diversityRates = [];
    const facultyCounts = [];
    const multiAreaCounts = [];

    for (let y = startYear; y <= currentYear; y++) {
        years.push(y);

        const wStart = y - windowSize + 1;
        const wEnd = y;

        // Count distinct areas per author in this window
        const authorAreas = {};

        const targetSchool = document.getElementById('analysis-school-select')?.value || 'George Mason University';

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
    if (chartInstance) chartInstance.destroy();

    const ctx = document.getElementById('effortChart')?.getContext('2d');
    if (!ctx) return;

    const startYear = parseInt(document.getElementById('analysis-start-year')?.value) || 2016;
    const endYear = parseInt(document.getElementById('analysis-end-year')?.value) || new Date().getFullYear();
    const numYears = endYear - startYear + 1;
    const targetSchool = document.getElementById('analysis-school-select')?.value || 'George Mason University';

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
    if (chartInstance) chartInstance.destroy();

    const ctx = document.getElementById('aiTrendsChart')?.getContext('2d');
    if (!ctx) return;

    const startYear = parseInt(document.getElementById('analysis-start-year')?.value) || 2005;
    const endYear = parseInt(document.getElementById('analysis-end-year')?.value) || new Date().getFullYear();
    const targetSchool = document.getElementById('analysis-school-select')?.value || 'George Mason University';

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
    if (chartInstance) chartInstance.destroy();

    const ctx = document.getElementById('confTrendsChart')?.getContext('2d');
    if (!ctx) return;

    const startYear = parseInt(document.getElementById('analysis-start-year')?.value) || 2010;
    const endYear = parseInt(document.getElementById('analysis-end-year')?.value) || new Date().getFullYear();
    const targetSchool = document.getElementById('analysis-school-select')?.value || 'George Mason University';

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
