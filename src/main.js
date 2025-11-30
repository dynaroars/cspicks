import { loadData, filterByYears, DEFAULT_START_YEAR, DEFAULT_END_YEAR } from './data.js';
import he from 'he';

let rawData = { professors: {}, schools: {} };
let appData = { professors: {}, schools: {} };
let startYear = DEFAULT_START_YEAR;
let endYear = DEFAULT_END_YEAR;
let selectedRegion = 'us';

async function init() {
  try {
    rawData = await loadData();
    appData = filterByYears(rawData, startYear, endYear, selectedRegion);
    console.log(`Data loaded (${startYear}-${endYear}, region: ${selectedRegion}):`, Object.keys(appData.professors).length, 'professors', Object.keys(appData.schools).length, 'schools');

    setupSearch();
    setupFilters();
  } catch (err) {
    console.error('Failed to load data:', err);
    document.querySelector('main').innerHTML = '<p style="text-align:center; color: #ef4444;">Error loading data. Please try again.</p>';
  }
}

function setupSearch() {
  const mainSearch = document.getElementById('main-search');

  mainSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (query.length < 3) {
      document.getElementById('prof-results').innerHTML = '';
      document.getElementById('school-results').innerHTML = '';
      return;
    }
    searchProfessors(query);
    searchSchools(query);
  });
}

window.setSearchQuery = function (query) {
  const input = document.getElementById('main-search');
  input.value = query;
  input.dispatchEvent(new Event('input'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.toggleCard = function (header) {
  const card = header.parentElement;
  card.classList.toggle('collapsed');
};

function setupFilters() {
  const regionSelect = document.getElementById('region-select');
  const startYearSelect = document.getElementById('start-year');
  const endYearSelect = document.getElementById('end-year');

  // Populate years (1970 - Current Year + 1)
  const currentYear = new Date().getFullYear();
  for (let y = 1970; y <= currentYear + 1; y++) {
    const optionStart = new Option(y, y);
    const optionEnd = new Option(y, y);
    startYearSelect.add(optionStart);
    endYearSelect.add(optionEnd);
  }

  // Set defaults
  startYearSelect.value = startYear;
  endYearSelect.value = endYear;

  const handleFilterChange = () => {
    selectedRegion = regionSelect.value;
    startYear = parseInt(startYearSelect.value);
    endYear = parseInt(endYearSelect.value);

    // Validate range
    if (startYear > endYear) {
      // Swap if invalid
      [startYear, endYear] = [endYear, startYear];
      startYearSelect.value = startYear;
      endYearSelect.value = endYear;
    }

    appData = filterByYears(rawData, startYear, endYear, selectedRegion);
    console.log(`Filtered: Region=${selectedRegion}, Years=${startYear}-${endYear}`);

    // Re-run current search
    const query = document.getElementById('main-search').value.toLowerCase();
    if (query.length >= 3) {
      searchProfessors(query);
      searchSchools(query);
    } else {
      document.getElementById('prof-results').innerHTML = '';
      document.getElementById('school-results').innerHTML = '';
    }
  };

  regionSelect.addEventListener('change', handleFilterChange);
  startYearSelect.addEventListener('change', handleFilterChange);
  endYearSelect.addEventListener('change', handleFilterChange);
}

function searchProfessors(query) {
  const allProfs = Object.values(appData.professors);
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

  const results = allProfs
    .filter(p => {
      const name = p.name.toLowerCase();
      return tokens.every(token => name.includes(token));
    })
    .sort((a, b) => b.totalAdjusted - a.totalAdjusted)
    .slice(0, 20); // Limit results

  const container = document.getElementById('prof-results');
  container.innerHTML = results.map(renderProfessorCard).join('');
}

// DBLP URL generation
function getDBLPUrl(name) {

  // 1. Replace spaces and non-ASCII characters
  name = name.replace(/ Jr\./g, "_Jr.");
  name = name.replace(/ II/g, "_II");
  name = name.replace(/ III/g, "_III");
  name = name.replace(/'|\-|\./g, "=");

  // 2. Replace diacritics using he
  name = he.encode(name, { 'useNamedReferences': true, 'allowUnsafeSymbols': true });
  name = name.replace(/&/g, "=");
  name = name.replace(/;/g, "=");

  let splitName = name.split(" ");
  let lastName = splitName[splitName.length - 1];
  let disambiguation = "";

  // Check for disambiguation (e.g. "Name 0001")
  if (parseInt(lastName) > 0) {
    disambiguation = lastName;
    splitName.pop();
    lastName = splitName[splitName.length - 1] + "_" + disambiguation;
  }

  splitName.pop();
  let newName = splitName.join(" ");
  newName = newName.replace(/\s/g, "_");
  newName = newName.replace(/\-/g, "=");
  newName = encodeURIComponent(newName);

  let str = "https://dblp.org/pers/hd";
  const lastInitial = lastName[0].toLowerCase();
  str += `/${lastInitial}/${lastName}:${newName}`;

  return str;
}

function renderProfessorCard(prof) {
  // Sort areas by adjusted count descending
  const sortedAreas = Object.entries(prof.areas)
    .sort(([, a], [, b]) => b.adjusted - a.adjusted);
  const dblpUrl = getDBLPUrl(prof.name);

  return `
    <div class="card">
      <h2>${prof.name}</h2>
      <div class="card-subtitle">
        <a href="#" onclick="setSearchQuery('${prof.affiliation.replace(/'/g, "\\'")}')" style="color: inherit; text-decoration: underline;">${prof.affiliation}</a>
      </div>
      <div class="card-stats">
        <strong>${prof.totalPapers}</strong> papers (<strong>${prof.totalAdjusted.toFixed(1)}</strong> adjusted)
      </div>

      <div class="card-links">
        ${prof.homepage ? `<a href="${prof.homepage}" target="_blank" class="card-link">Website</a>` : ''}
        ${prof.scholarid ? `<a href="https://scholar.google.com/citations?user=${prof.scholarid}" target="_blank" class="card-link">Google Scholar</a>` : ''}
        <a href="${dblpUrl}" target="_blank" class="card-link">DBLP</a>
      </div>

      <div class="stats-list">
        ${sortedAreas.map(([area, stats]) => `
          <div class="stat-item">
            <span class="stat-label">${area}</span>
            <span class="stat-count">${Math.ceil(stats.count)} (${stats.adjusted.toFixed(1)})</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function searchSchools(query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

  const results = Object.values(appData.schools)
    .filter(s => {
      const name = s.name.toLowerCase();
      return tokens.every(token => name.includes(token));
    })
    .slice(0, 10); // Limit results

  const container = document.getElementById('school-results');
  container.innerHTML = results.map(renderSchoolCard).join('');
}

function renderSchoolCard(school) {
  // Sort by adjusted count descending
  const sortedAreas = Object.entries(school.areas)
    .sort(([, a], [, b]) => b.adjusted - a.adjusted);

  return `
    <div class="card" style="margin-bottom: 2rem;">
      <div class="card-header" onclick="toggleCard(this)">
        <h2>${school.name} <span style="color: #888; font-size:0.8em;">#${school.rank}</span></h2>
        <span class="card-arrow">▼</span>
      </div>
      
      <div class="card-content">
        ${sortedAreas.map(([area, data]) => `
          <div class="school-area-section">
            <div class="school-area-header">
              <span>${area}</span>
              <span>${Math.ceil(data.count)} (${data.adjusted.toFixed(1)})</span>
            </div>
            <div class="faculty-list">
              ${data.faculty.sort().map(name => `
                <span class="faculty-tag" onclick="setSearchQuery('${name.replace(/'/g, "\\'")}')" style="cursor: pointer;">${name}</span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
init();
