import { loadData } from './data.js';
import he from 'he';

let appData = {
  professors: {},
  schools: {}
};

async function init() {
  try {
    const data = await loadData();
    appData = data;
    console.log('Data loaded:', Object.keys(appData.professors).length, 'professors', Object.keys(appData.schools).length, 'schools');

    setupSearch();
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

function searchProfessors(query) {
  const allProfs = Object.values(appData.professors);
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

  const results = allProfs
    .filter(p => {
      const name = p.name.toLowerCase();
      return tokens.every(token => name.includes(token));
    })
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
  // Sort areas by count descending
  const sortedAreas = Object.entries(prof.areas)
    .sort(([, a], [, b]) => b - a);
  const dblpUrl = getDBLPUrl(prof.name);

  return `
    <div class="card">
      <h2>${prof.name}</h2>
      <div class="card-subtitle">
        <a href="#" onclick="setSearchQuery('${prof.affiliation.replace(/'/g, "\\'")}')" style="color: inherit; text-decoration: underline;">${prof.affiliation}</a>
      </div>

      <div class="card-links">
        ${prof.homepage ? `<a href="${prof.homepage}" target="_blank" class="card-link">Website</a>` : ''}
        ${prof.scholarid ? `<a href="https://scholar.google.com/citations?user=${prof.scholarid}" target="_blank" class="card-link">Google Scholar</a>` : ''}
        <a href="${dblpUrl}" target="_blank" class="card-link">DBLP</a>
      </div>

      <div class="stats-list">
        ${sortedAreas.map(([area, count]) => `
          <div class="stat-item">
            <span class="stat-label">${area}</span>
            <span class="stat-count">${count.toFixed(1)}</span>
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
  // descending SORT
  const sortedAreas = Object.entries(school.areas)
    .sort(([, a], [, b]) => b.count - a.count);

  return `
    <div class="card" style="margin-bottom: 2rem;">
      <div class="card-header" onclick="toggleCard(this)">
        <h2>${school.name}</h2>
        <span class="card-arrow">▼</span>
      </div>
      
      <div class="card-content">
        ${sortedAreas.map(([area, data]) => `
          <div class="school-area-section">
            <div class="school-area-header">
              <span>${area}</span>
              <span>${data.count.toFixed(1)} pubs</span>
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
