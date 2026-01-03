import Chart from 'chart.js/auto';
import { loadData, filterByYears, fetchCsv, mergeAffiliationHistory } from './data.js';

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
    'mobile': 'Mobile Computing',
    'metrics': 'Performance',
    'ops': 'Operating Systems',
    'plan': 'Programming Languages',
    'soft': 'Software Engineering',
    'comm': 'Networks',
    'graph': 'Graphics',
    'act': 'Algorithms',
    'crypt': 'Cryptography',
    'log': 'Logic & Verification',
    'bio': 'Comp. Biology',
    'ecom': 'Economics & Comp.',
    'chi': 'HCI',
    'robotics': 'Robotics',
    'visualization': 'Visualization',
    'csed': 'CS Education'
};

let rawData = null;
let chartInstance = null;
let historyMap = {};
let aliasMap = {};

let selectedRegion = 'us';
let startYear = 2015;
let endYear = new Date().getFullYear();
let historicalMode = false;

async function init() {
    rawData = await loadData();

    try {
        const [history, aliases, manualCsv] = await Promise.all([
            fetch('./professor_history_openalex.json').then(r => r.ok ? r.json() : null).catch(() => null),
            fetch('./school-aliases.json').then(r => r.ok ? r.json() : null).catch(() => null),
            fetchCsv('./manual_affiliations.csv').catch(() => []),
        ]);

        aliasMap = aliases || {};
        historyMap = mergeAffiliationHistory(history || {}, manualCsv);
    } catch (e) {
        console.warn('Could not load affiliation history or aliases', e);
    }

    setupYearSelectors();
    populateSchoolSelects();
    setupEventListeners();

    // Hide loading indicator and show controls
    document.getElementById('loading-indicator').style.display = 'none';
    document.getElementById('filter-controls').style.display = 'flex';
    document.getElementById('compare-controls').style.display = 'flex';
}

function setupYearSelectors() {
    const currentYear = new Date().getFullYear();
    const startSelect = document.getElementById('start-year');
    const endSelect = document.getElementById('end-year');

    for (let y = currentYear; y >= 1970; y--) {
        startSelect.add(new Option(y, y));
        endSelect.add(new Option(y, y));
    }

    startSelect.value = 2015;
    endSelect.value = currentYear;
    startYear = 2015;
    endYear = currentYear;
}


let schoolsList = [];

function populateSchoolSelects() {
    const historyData = historicalMode ? historyMap : {};
    const filtered = filterByYears(rawData, startYear, endYear, selectedRegion, historyData, aliasMap);
    schoolsList = Object.values(filtered.schools)
        .filter(s => s.rank)
        .sort((a, b) => a.rank - b.rank);

    initSearchableSelect('select-a', 'school-a');
    initSearchableSelect('select-b', 'school-b');

    const urlParams = new URLSearchParams(window.location.search);
    const urlSchoolA = urlParams.get('schoolA');
    const urlSchoolB = urlParams.get('schoolB');

    if (urlSchoolA && schoolsList.find(s => s.name === urlSchoolA)) {
        setSchoolValue('select-a', 'school-a', urlSchoolA);
    } else if (schoolsList.length >= 1) {
        setSchoolValue('select-a', 'school-a', schoolsList[0].name);
    }

    if (urlSchoolB && schoolsList.find(s => s.name === urlSchoolB)) {
        setSchoolValue('select-b', 'school-b', urlSchoolB);
    } else if (schoolsList.length >= 2) {
        setSchoolValue('select-b', 'school-b', schoolsList[1].name);
    }

    renderComparison();
}

function updateURL() {
    const schoolA = document.getElementById('school-a').value;
    const schoolB = document.getElementById('school-b').value;

    if (schoolA && schoolB) {
        const url = new URL(window.location);
        url.searchParams.set('schoolA', schoolA);
        url.searchParams.set('schoolB', schoolB);
        window.history.replaceState({}, '', url);
    }
}

function initSearchableSelect(containerId, hiddenId) {
    const container = document.getElementById(containerId);
    const input = container.querySelector('.search-input');
    const dropdown = container.querySelector('.dropdown-list');
    const hidden = document.getElementById(hiddenId);

    // Populate initial list
    renderDropdownItems(dropdown, schoolsList, hidden, input);

    // Handle input focus
    input.addEventListener('focus', () => {
        dropdown.classList.add('show');
        renderDropdownItems(dropdown, schoolsList, hidden, input);
    });

    // Handle typing
    input.addEventListener('input', () => {
        const query = input.value.toLowerCase();
        const filtered = schoolsList.filter(s =>
            s.name.toLowerCase().includes(query)
        );
        renderDropdownItems(dropdown, filtered, hidden, input);
        dropdown.classList.add('show');
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
}

function renderDropdownItems(dropdown, schools, hidden, input) {
    dropdown.innerHTML = schools.slice(0, 50).map(school => `
        <div class="dropdown-item" data-value="${school.name}">
            <span style="color: var(--text-secondary); margin-right: 0.5rem;">#${school.rank}</span>
            ${school.name}
        </div>
    `).join('');

    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const value = item.dataset.value;
            hidden.value = value;
            input.value = value;
            dropdown.classList.remove('show');
            renderComparison();
            updateURL();
        });
    });
}

function setSchoolValue(containerId, hiddenId, value) {
    const container = document.getElementById(containerId);
    const input = container.querySelector('.search-input');
    const hidden = document.getElementById(hiddenId);
    hidden.value = value;
    input.value = value;
}

function setupEventListeners() {
    // Region filter
    document.getElementById('region-select').addEventListener('change', (e) => {
        selectedRegion = e.target.value;
        refreshData();
    });

    // Year range filters
    document.getElementById('start-year').addEventListener('change', (e) => {
        startYear = parseInt(e.target.value);
        if (startYear > endYear) {
            endYear = startYear;
            document.getElementById('end-year').value = endYear;
        }
        refreshData();
    });

    document.getElementById('end-year').addEventListener('change', (e) => {
        endYear = parseInt(e.target.value);
        if (endYear < startYear) {
            startYear = endYear;
            document.getElementById('start-year').value = startYear;
        }
        refreshData();
    });

    // Historical mode
    document.getElementById('historical-mode').addEventListener('change', (e) => {
        historicalMode = e.target.checked;
        refreshData();
    });
}

function refreshData() {
    const currentSchoolA = document.getElementById('school-a').value;
    const currentSchoolB = document.getElementById('school-b').value;

    populateSchoolSelects();

    if (schoolsList.find(s => s.name === currentSchoolA)) {
        setSchoolValue('select-a', 'school-a', currentSchoolA);
    }
    if (schoolsList.find(s => s.name === currentSchoolB)) {
        setSchoolValue('select-b', 'school-b', currentSchoolB);
    }

    renderComparison();
}


function renderComparison() {
    const schoolAName = document.getElementById('school-a').value;
    const schoolBName = document.getElementById('school-b').value;

    if (!schoolAName || !schoolBName || schoolAName === schoolBName) {
        document.getElementById('comparison-chart-container').style.display = 'none';
        document.getElementById('comparison-summary').innerHTML = '';
        return;
    }

    const historyData = historicalMode ? historyMap : {};
    const filtered = filterByYears(rawData, startYear, endYear, selectedRegion, historyData, aliasMap);
    const schoolA = filtered.schools[schoolAName];
    const schoolB = filtered.schools[schoolBName];

    if (!schoolA || !schoolB) {
        console.error('Could not find one of the schools');
        return;
    }

    // Get all areas that either school has
    const allAreas = new Set([...Object.keys(schoolA.areas || {}), ...Object.keys(schoolB.areas || {})]);
    const areaList = Array.from(allAreas).sort((a, b) => {
        const totalA = (schoolA.areas[a]?.adjusted || 0) + (schoolB.areas[a]?.adjusted || 0);
        const totalB = (schoolA.areas[b]?.adjusted || 0) + (schoolB.areas[b]?.adjusted || 0);
        return totalB - totalA;
    });

    const labels = areaList.map(a => areaLabels[a] || a);
    const dataA = areaList.map(a => schoolA.areas[a]?.adjusted || 0);
    const dataB = areaList.map(a => schoolB.areas[a]?.adjusted || 0);

    // Render chart
    document.getElementById('comparison-chart-container').style.display = 'block';

    if (chartInstance) {
        chartInstance.destroy();
    }

    const ctx = document.getElementById('comparisonChart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: schoolAName,
                    data: dataA,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1
                },
                {
                    label: schoolBName,
                    data: dataB,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            devicePixelRatio: 3,
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    position: 'nearest',
                    xAlign: 'left',
                    yAlign: 'center',
                    caretSize: 0,
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.parsed.x.toFixed(1)} adjusted`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Adjusted Publication Count'
                    }
                }
            }
        }
    });

    // Generate summary
    renderSummary(schoolAName, schoolBName, areaList, dataA, dataB);
}

function renderSummary(schoolAName, schoolBName, areas, dataA, dataB) {
    const summaryContainer = document.getElementById('comparison-summary');

    let aWins = 0;
    let bWins = 0;
    const insightsA = [];
    const insightsB = [];

    areas.forEach((area, i) => {
        const valA = dataA[i];
        const valB = dataB[i];
        const diff = Math.abs(valA - valB);
        const label = areaLabels[area] || area;

        if (valA > valB) {
            aWins++;
            if (diff > 0.1) {
                insightsA.push({ area: label, margin: diff.toFixed(1) });
            }
        } else if (valB > valA) {
            bWins++;
            if (diff > 0.1) {
                insightsB.push({ area: label, margin: diff.toFixed(1) });
            }
        }
    });

    // Sort by margin descending
    insightsA.sort((a, b) => parseFloat(b.margin) - parseFloat(a.margin));
    insightsB.sort((a, b) => parseFloat(b.margin) - parseFloat(a.margin));

    let html = `
        <div class="summary-card" style="grid-column: 1 / -1; text-align: center;">
            <h4>Overall Comparison</h4>
            <div class="leader" style="font-size: 1.3rem;">
                <span style="color: rgba(37, 99, 235, 1);">${schoolAName}</span> leads in <strong>${aWins}</strong> areas
                &nbsp;|&nbsp;
                <span style="color: rgba(16, 185, 129, 1);">${schoolBName}</span> leads in <strong>${bWins}</strong> areas
            </div>
        </div>
    `;

    html += `<div style="grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">`;

    html += `<div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <h4 style="margin: 0; color: rgba(37, 99, 235, 1); font-weight: 600;">${schoolAName} Leads</h4>`;
    insightsA.forEach(insight => {
        html += `
            <div class="summary-card" style="border-left: 3px solid rgba(37, 99, 235, 1);">
                <h4>${insight.area}</h4>
                <div class="margin" style="color: rgba(37, 99, 235, 1);">+${insight.margin} adjusted pubs</div>
            </div>
        `;
    });
    html += `</div>`;

    html += `<div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <h4 style="margin: 0; color: rgba(16, 185, 129, 1); font-weight: 600;">${schoolBName} Leads</h4>`;
    insightsB.forEach(insight => {
        html += `
            <div class="summary-card" style="border-left: 3px solid rgba(16, 185, 129, 1);">
                <h4>${insight.area}</h4>
                <div class="margin" style="color: rgba(16, 185, 129, 1);">+${insight.margin} adjusted pubs</div>
            </div>
        `;
    });
    html += `</div>`;

    html += `</div>`;

    summaryContainer.innerHTML = html;
}

init();
