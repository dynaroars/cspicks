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

    setupTabs();
    setupSearch();
  } catch (err) {
    console.error('Failed to load data:', err);
    document.querySelector('main').innerHTML = '<p style="text-align:center; color: #ef4444;">Error loading data. Please try again.</p>';
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and views
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

      // Add active class to clicked tab and corresponding view
      tab.classList.add('active');
      const viewId = `${tab.dataset.tab}-view`;
      document.getElementById(viewId).classList.add('active');
    });
  });
}

function setupSearch() {
  const profSearch = document.getElementById('prof-search');
  const schoolSearch = document.getElementById('school-search');

  profSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (query.length < 3) {
      document.getElementById('prof-results').innerHTML = '';
      return;
    }
    searchProfessors(query);
  });

  schoolSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (query.length < 3) {
      document.getElementById('school-results').innerHTML = '';
      return;
    }
    searchSchools(query);
  });
}

function searchProfessors(query) {
  const allProfs = Object.values(appData.professors);

  const results = allProfs
    .filter(p => p.name.toLowerCase().includes(query))
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
      <div class="card-subtitle">${prof.affiliation}</div>

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
  const results = Object.values(appData.schools)
    .filter(s => s.name.toLowerCase().includes(query))
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
      <h2>${school.name}</h2>
      
      ${sortedAreas.map(([area, data]) => `
        <div class="school-area-section">
          <div class="school-area-header">
            <span>${area}</span>
            <span>${data.count.toFixed(1)} pubs</span>
          </div>
          <div class="faculty-list">
            ${data.faculty.sort().map(name => `
              <span class="faculty-tag">${name}</span>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
init();
