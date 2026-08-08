import Chart from 'chart.js/auto';
import { loadData, loadAffiliationData, filterByYears } from './data.js';
import { areaLabels, escapeHtml, updateChartDefaults } from './shared.js';
import { explainRankGap } from './metrics.js';

updateChartDefaults(Chart);

const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
            updateChartDefaults(Chart);
            renderComparison();
        }
    });
});
observer.observe(document.documentElement, { attributes: true });

let rawData = null;
let chartInstance = null;
let historyMap = null;
let aliasMap = null;

let selectedRegion = 'us';
let endYear = new Date().getFullYear();
let startYear = endYear - 10;
let historicalMode = false;
let comparisonType = 'schools';
let schoolsList = [];
let facultyList = [];

async function init() {
    rawData = await loadData();

    setupYearSelectors();
    
    // Set up inputs
    initSearchableSelect('select-a', 'school-a');
    initSearchableSelect('select-b', 'school-b');

    populateComparisonControls();
    setupEventListeners();

    // Hide loading indicator and show controls
    document.getElementById('loading-indicator').style.display = 'none';
    document.getElementById('filter-controls').style.display = 'flex';
    document.getElementById('compare-controls').style.display = 'flex';
}

async function ensureHistoricalData() {
    if (historyMap !== null && aliasMap !== null) return;
    const data = await loadAffiliationData();
    historyMap = data.historyMap;
    aliasMap = data.aliasMap;
}

function setupYearSelectors() {
    const currentYear = new Date().getFullYear();
    const startSelect = document.getElementById('start-year');
    const endSelect = document.getElementById('end-year');

    for (let y = currentYear; y >= 2000; y--) {
        startSelect.add(new Option(y, y));
        endSelect.add(new Option(y, y));
    }

    endSelect.value = currentYear;
    startSelect.value = endSelect.value - 10;
    endYear = currentYear;
    startYear = endYear - 10;
}

function populateLists() {
    const historyData = historicalMode ? historyMap : null;
    const confSet = document.getElementById('conf-set')?.value || 'csrankings-default';
    const filtered = filterByYears(rawData, startYear, endYear, selectedRegion, historyData, aliasMap, confSet);
    
    schoolsList = Object.values(filtered.schools)
        .filter(s => s.rank)
        .sort((a, b) => a.rank - b.rank);

    facultyList = Object.values(filtered.professors)
        .sort((a, b) => b.totalAdjusted - a.totalAdjusted)
        .map(p => ({
            name: p.name,
            affiliation: p.affiliation,
            totalPapers: p.totalPapers,
            totalAdjusted: p.totalAdjusted,
            areas: p.areas,
            pubs: p.pubs
        }));
}

function populateComparisonControls() {
    populateLists();

    const urlParams = new URLSearchParams(window.location.search);
    const urlSchoolA = urlParams.get('schoolA');
    const urlSchoolB = urlParams.get('schoolB');

    const activeList = comparisonType === 'schools' ? schoolsList : facultyList;

    if (urlSchoolA && activeList.find(s => s.name === urlSchoolA)) {
        setSchoolValue('select-a', 'school-a', urlSchoolA);
    } else if (activeList.length >= 1) {
        setSchoolValue('select-a', 'school-a', activeList[0].name);
    }

    if (urlSchoolB && activeList.find(s => s.name === urlSchoolB)) {
        setSchoolValue('select-b', 'school-b', urlSchoolB);
    } else if (activeList.length >= 2) {
        setSchoolValue('select-b', 'school-b', activeList[1].name);
    }

    renderComparison();
}

function updateURL() {
    const valA = document.getElementById('school-a').value;
    const valB = document.getElementById('school-b').value;

    if (valA && valB) {
        const url = new URL(window.location);
        url.searchParams.set('schoolA', valA);
        url.searchParams.set('schoolB', valB);
        window.history.replaceState({}, '', url);
    }
}

function initSearchableSelect(containerId, hiddenId) {
    const container = document.getElementById(containerId);
    const input = container.querySelector('.search-input');
    const dropdown = container.querySelector('.dropdown-list');
    const hidden = document.getElementById(hiddenId);

    const getActiveList = () => comparisonType === 'schools' ? schoolsList : facultyList;

    // Populate initial list
    renderDropdownItems(dropdown, getActiveList(), hidden, input);

    // Handle input focus
    input.addEventListener('focus', () => {
        dropdown.classList.add('show');
        renderDropdownItems(dropdown, getActiveList(), hidden, input);
    });

    // Handle typing
    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = input.value.toLowerCase();
            const filtered = getActiveList().filter(s =>
                s.name.toLowerCase().includes(query)
            );
            renderDropdownItems(dropdown, filtered, hidden, input);
            dropdown.classList.add('show');
        }, 150);
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
}

function renderDropdownItems(dropdown, list, hidden, input) {
    if (comparisonType === 'schools') {
        dropdown.innerHTML = list.slice(0, 50).map(school => `
            <div class="dropdown-item" data-value="${escapeHtml(school.name)}">
                <span style="color: var(--text-secondary); margin-right: 0.5rem;">#${school.rank}</span>
                ${escapeHtml(school.name)}
            </div>
        `).join('');
    } else {
        dropdown.innerHTML = list.slice(0, 50).map(faculty => `
            <div class="dropdown-item" data-value="${escapeHtml(faculty.name)}">
                <span style="font-weight: 600;">${escapeHtml(faculty.name)}</span>
                <span style="color: var(--text-secondary); margin-left: 0.5rem; font-size: 0.85em;">(${escapeHtml(faculty.affiliation)})</span>
                <span style="float: right; color: var(--primary-color); font-size: 0.85em; font-weight: 600;">${faculty.totalAdjusted.toFixed(1)}</span>
            </div>
        `).join('');
    }

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
    // Comparison Type selector
    document.getElementById('comparison-type')?.addEventListener('change', (e) => {
        comparisonType = e.target.value;
        
        // Update labels and placeholders
        const labelA = document.getElementById('label-a');
        const labelB = document.getElementById('label-b');
        const inputA = document.querySelector('#select-a .search-input');
        const inputB = document.querySelector('#select-b .search-input');
        const hiddenA = document.getElementById('school-a');
        const hiddenB = document.getElementById('school-b');

        if (comparisonType === 'schools') {
            if (labelA) labelA.textContent = 'School A';
            if (labelB) labelB.textContent = 'School B';
            if (inputA) inputA.placeholder = 'Search schools...';
            if (inputB) inputB.placeholder = 'Search schools...';
        } else {
            if (labelA) labelA.textContent = 'Researcher A';
            if (labelB) labelB.textContent = 'Researcher B';
            if (inputA) inputA.placeholder = 'Search researchers...';
            if (inputB) inputB.placeholder = 'Search researchers...';
        }

        // Clear previous selections to avoid cross-mode leaks
        if (hiddenA) hiddenA.value = '';
        if (hiddenB) hiddenB.value = '';
        if (inputA) inputA.value = '';
        if (inputB) inputB.value = '';

        // Refresh list references and render initial options
        populateComparisonControls();
    });

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
    document.getElementById('historical-mode').addEventListener('change', async (e) => {
        const toggle = e.target;
        toggle.disabled = true;
        try {
            if (toggle.checked) await ensureHistoricalData();
            historicalMode = toggle.checked;
            refreshData();
        } catch (error) {
            console.error('Failed to load historical affiliation data:', error);
            toggle.checked = false;
            historicalMode = false;
            window.alert('Historical affiliation data could not be loaded. Please try again.');
        } finally {
            toggle.disabled = false;
        }
    });

    // Conference set toggle
    document.getElementById('conf-set').addEventListener('change', () => {
        refreshData();
    });
}

function refreshData() {
    const currentSchoolA = document.getElementById('school-a').value;
    const currentSchoolB = document.getElementById('school-b').value;

    populateLists();

    const activeList = comparisonType === 'schools' ? schoolsList : facultyList;

    if (activeList.find(s => s.name === currentSchoolA)) {
        setSchoolValue('select-a', 'school-a', currentSchoolA);
    } else {
        document.getElementById('school-a').value = '';
        document.querySelector('#select-a .search-input').value = '';
    }
    
    if (activeList.find(s => s.name === currentSchoolB)) {
        setSchoolValue('select-b', 'school-b', currentSchoolB);
    } else {
        document.getElementById('school-b').value = '';
        document.querySelector('#select-b .search-input').value = '';
    }

    renderComparison();
}


function renderComparison() {
    const valA = document.getElementById('school-a').value;
    const valB = document.getElementById('school-b').value;

    if (!valA || !valB) {
        document.getElementById('comparison-chart-container').style.display = 'none';
        document.getElementById('comparison-summary').innerHTML = `
            <div class="summary-card" style="grid-column: 1 / -1; text-align: center; padding: 2rem; border-style: dashed;">
                <h4 style="margin: 0 0 0.5rem 0; color: var(--text-secondary); font-weight: 500;">Ready to Compare</h4>
                <p style="margin: 0; color: var(--text-secondary); font-size: var(--text-sm);">Select two ${comparisonType === 'schools' ? 'institutions' : 'researchers'} above to analyze their publication weights side by side.</p>
            </div>
        `;
        return;
    }

    if (valA === valB) {
        document.getElementById('comparison-chart-container').style.display = 'none';
        document.getElementById('comparison-summary').innerHTML = `
            <div class="summary-card" style="grid-column: 1 / -1; text-align: center; padding: 2rem; border-style: dashed;">
                <h4 style="margin: 0 0 0.5rem 0; color: var(--text-secondary); font-weight: 500;">Identical Selection</h4>
                <p style="margin: 0; color: var(--text-secondary); font-size: var(--text-sm);">Please choose two different ${comparisonType === 'schools' ? 'universities' : 'researchers'} to generate a head-to-head comparison.</p>
            </div>
        `;
        return;
    }

    const historyData = historicalMode ? historyMap : null;
    const confSet = document.getElementById('conf-set')?.value || 'csrankings-default';
    const filtered = filterByYears(rawData, startYear, endYear, selectedRegion, historyData, aliasMap, confSet);
    
    let labels, dataA, dataB, areaList, selectedA, selectedB;

    if (comparisonType === 'schools') {
        const schoolA = filtered.schools[valA];
        const schoolB = filtered.schools[valB];
        selectedA = schoolA;
        selectedB = schoolB;

        if (!schoolA || !schoolB) {
            console.error('Could not find one of the schools');
            return;
        }

        const allAreas = new Set([...Object.keys(schoolA.areas || {}), ...Object.keys(schoolB.areas || {})]);
        areaList = Array.from(allAreas).sort((a, b) => {
            const totalA = (schoolA.areas[a]?.adjusted || 0) + (schoolB.areas[a]?.adjusted || 0);
            const totalB = (schoolA.areas[b]?.adjusted || 0) + (schoolB.areas[b]?.adjusted || 0);
            return totalB - totalA;
        });

        labels = areaList.map(a => areaLabels[a] || a);
        dataA = areaList.map(a => schoolA.areas[a]?.adjusted || 0);
        dataB = areaList.map(a => schoolB.areas[a]?.adjusted || 0);
    } else {
        const profA = filtered.professors[valA];
        const profB = filtered.professors[valB];
        selectedA = profA;
        selectedB = profB;

        if (!profA || !profB) {
            console.error('Could not find one of the professors');
            return;
        }

        const allAreas = new Set([...Object.keys(profA.areas || {}), ...Object.keys(profB.areas || {})]);
        areaList = Array.from(allAreas).sort((a, b) => {
            const totalA = (profA.areas[a]?.adjusted || 0) + (profB.areas[a]?.adjusted || 0);
            const totalB = (profA.areas[b]?.adjusted || 0) + (profB.areas[b]?.adjusted || 0);
            return totalB - totalA;
        });

        labels = areaList.map(a => areaLabels[a] || a);
        dataA = areaList.map(a => profA.areas[a]?.adjusted || 0);
        dataB = areaList.map(a => profB.areas[a]?.adjusted || 0);
    }

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
                    label: valA,
                    data: dataA,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1
                },
                {
                    label: valB,
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
    renderSummary(valA, valB, areaList, dataA, dataB, selectedA, selectedB);
}

function renderSummary(schoolAName, schoolBName, areas, dataA, dataB, selectedA, selectedB) {
    const summaryContainer = document.getElementById('comparison-summary');
    const safeSchoolAName = escapeHtml(schoolAName);
    const safeSchoolBName = escapeHtml(schoolBName);

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
                <span style="color: rgba(37, 99, 235, 1);">${safeSchoolAName}</span> leads in <strong>${aWins}</strong> areas
                &nbsp;|&nbsp;
                <span style="color: rgba(16, 185, 129, 1);">${safeSchoolBName}</span> leads in <strong>${bWins}</strong> areas
            </div>
        </div>
    `;

    if (comparisonType === 'schools') {
        const gapItems = explainRankGap(selectedA, selectedB).slice(0, 6);
        html += `
            <div class="summary-card rank-gap-card" style="grid-column: 1 / -1;">
                <h4>What explains the rank gap?</h4>
                <p class="summary-note">Overall rank uses a geometric mean. These are the largest area-level log-score differences.</p>
                <div class="rank-gap-list">
                    ${gapItems.map(item => {
                        const leader = item.leader === 'a' ? safeSchoolAName : safeSchoolBName;
                        return `<div class="rank-gap-item"><span>${escapeHtml(areaLabels[item.area] || item.area)}</span><strong>${leader}</strong><small>${Math.abs(item.logGap).toFixed(2)} log points</small></div>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    html += `<div style="grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">`;

    html += `<div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <h4 style="margin: 0; color: rgba(37, 99, 235, 1); font-weight: 600;">${safeSchoolAName} Leads</h4>`;
    insightsA.forEach(insight => {
        html += `
            <div class="summary-card" style="border: 1px solid rgba(37, 99, 235, 0.25); background: rgba(37, 99, 235, 0.02);">
                <h4>${escapeHtml(insight.area)}</h4>
                <div class="margin" style="color: rgba(37, 99, 235, 1);">+${insight.margin} adjusted pubs</div>
            </div>
        `;
    });
    html += `</div>`;

    html += `<div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <h4 style="margin: 0; color: rgba(16, 185, 129, 1); font-weight: 600;">${safeSchoolBName} Leads</h4>`;
    insightsB.forEach(insight => {
        html += `
            <div class="summary-card" style="border: 1px solid rgba(16, 185, 129, 0.25); background: rgba(16, 185, 129, 0.02);">
                <h4>${escapeHtml(insight.area)}</h4>
                <div class="margin" style="color: rgba(16, 185, 129, 1);">+${insight.margin} adjusted pubs</div>
            </div>
        `;
    });
    html += `</div>`;

    html += `</div>`;

    summaryContainer.innerHTML = html;
}

init().catch(err => {
    console.error('Failed to initialize comparison:', err);
    document.getElementById('loading-indicator').innerHTML =
        '<p style="color: #ef4444;">Unable to load comparison data. Please try again.</p>';
});
