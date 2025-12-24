import Chart from 'chart.js/auto';
import { loadData, filterByYears, parentMap } from './data.js';

const areaLabels = {
    'ai': 'AI',
    'vision': 'Computer Vision',
    'mlmining': 'Machine Learning',
    'nlp': 'NLP',
    'inforet': 'Info Retrieval',
    'arch': 'Architecture',
    'sec': 'Security',
    'mod': 'Databases',
    'da': 'Design Automation',
    'bed': 'Embedded Systems',
    'hpc': 'HPC',
    'mobile': 'Mobile',
    'metrics': 'Measurement',
    'ops': 'Operating Systems',
    'plan': 'Programming Languages',
    'soft': 'Software Engineering',
    'comm': 'Networks',
    'graph': 'Graphics',
    'act': 'Algorithms',
    'crypt': 'Cryptography',
    'log': 'Logic & Verification',
    'bio': 'Bioinformatics',
    'ecom': 'Econ & Computation',
    'chi': 'HCI',
    'robotics': 'Robotics',
    'visualization': 'Visualization',
    'csed': 'CS Education'
};

// State
let rawData = [];
let affiliationHistory = {};
let chartInstance = null;
let currentTab = 'schools';

async function init() {
    console.log('Initializing Analysis Dashboard...');
    try {
        const [data, history] = await Promise.all([
            loadData(),
            fetch('professor_history.json').then(res => res.ok ? res.json() : {}).catch(e => ({})),
        ]);
        rawData = data;
        affiliationHistory = history;
        console.log('Data loaded:', rawData.length, 'records, history for', Object.keys(affiliationHistory).length, 'profs');

        populateSchoolSelect();
        setupTabs();
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
        if (currentTab === 'schools') renderSchoolTrends();
        else if (currentTab === 'areas') renderAreaTrends();
        else if (currentTab === 'faculty') renderFacultyTrends();
    });
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

        const currentYear = new Date().getFullYear();
        const labels = [];
        const dataPoints = [];

        console.log('Calculating trends for', targetSchool);

        for (let y = currentYear - 9; y <= currentYear; y++) {
            const wStart = y - 9;
            const wEnd = y;

            const region = 'us';

            const result = filterByYears({ ...rawData }, wStart, wEnd, region, affiliationHistory);
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

    const schoolProfs = Object.values(rawData.professors).filter(p => p.affiliation === targetSchool);
    const allPubs = schoolProfs.flatMap(p => p.pubs);

    allPubs.forEach(pub => {
        if (pub.year >= startYear && pub.year <= currentYear) {
            // Check history for this specific pub
            let isAtTargetSchool = true;
            if (affiliationHistory && affiliationHistory[pub.name]) {
                const h = affiliationHistory[pub.name].find(s => pub.year >= s.start && pub.year <= s.end);

                if (h && h.school === targetSchool) {
                    isAtTargetSchool = true;
                } else {
                    isAtTargetSchool = false;
                }
            } else {
                // No history data for this prof, assume current affiliation (which matched targetSchool in filtering)
            }

            if (isAtTargetSchool) {
                const area = parentMap[pub.area] || pub.area;
                if (!stats[pub.year][area]) stats[pub.year][area] = 0;
                stats[pub.year][area] += pub.adjustedcount;
            }
        }
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
        const schoolProfs = Object.entries(rawData.professors).filter(([, p]) => p.affiliation === targetSchool);

        schoolProfs.forEach(([profName, prof]) => {
            prof.pubs.forEach(pub => {
                if (pub.year >= wStart && pub.year <= wEnd) {
                    if (!authorAreas[profName]) authorAreas[profName] = new Set();
                    const area = parentMap[pub.area] || pub.area;
                    authorAreas[profName].add(area);
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

init();
