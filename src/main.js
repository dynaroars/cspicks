import { loadData, filterByYears, DEFAULT_START_YEAR, DEFAULT_END_YEAR, parentMap } from './data.js';
import he from 'he';

import { searchAuthor, fetchAuthorStats } from './dblp.js';

window.dblp = {
  search: searchAuthor,
  stats: fetchAuthorStats
};

let rawData = null;
let appData = { professors: {}, schools: {} };
let startYear = DEFAULT_START_YEAR;
let endYear = DEFAULT_END_YEAR;
let selectedRegion = 'us';

async function init() {
  setupFilters();
  setupSearch();
  setupSimulation();

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

  let debounceTimer;
  mainSearch.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.toLowerCase();

    if (query.length < 1) {
      document.getElementById('prof-results').innerHTML = '';
      document.getElementById('school-results').innerHTML = '';
      document.getElementById('dblp-results').innerHTML = '';
      return;
    }

    debounceTimer = setTimeout(() => {
      searchProfessors(query);
      searchSchools(query);
      searchAreaPeople(query);
      searchDBLPAuthors(query);
    }, 300);
  });
}

function searchAreaPeople(query) {
  const container = document.getElementById('area-people-results');
  container.innerHTML = '';

  // Check if query matches an area
  const areaMatch = Object.entries(areaLabels).find(([key, label]) =>
    label.toLowerCase().includes(query) || key.toLowerCase() === query
  );

  if (!areaMatch) return;

  const [areaKey, areaLabel] = areaMatch;

  // Find top professors in this area
  const topProfs = Object.values(appData.professors)
    .filter(p => p.areas[areaKey] && p.areas[areaKey].adjusted > 0)
    .sort((a, b) => b.areas[areaKey].adjusted - a.areas[areaKey].adjusted)
    .slice(0, 12); // Top 12

  if (topProfs.length === 0) return;

  container.innerHTML = `
    <div class="section-header" style="grid-column: 1/-1; margin-top: 2rem;">
      <h3>Top Researchers in ${areaLabel}</h3>
    </div>
    ${topProfs.map(prof => renderProfessorCard(prof)).join('')}
  `;
}

async function searchDBLPAuthors(query) {
  if (query.length < 3) {
    document.getElementById('dblp-results').innerHTML = '';
    return;
  }

  const container = document.getElementById('dblp-results');

  try {
    const results = await window.dblp.search(query);

    if (results.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="section-header" style="grid-column: 1/-1; margin-top: 2rem;">
        <h3>Community Authors (DBLP)</h3>
      </div>
      ${results.slice(0, 8).map(a => `
        <div class="card" onclick="showDBLPAuthorProfile(this, '${a.pid}', '${a.name.replace(/'/g, "\\'")}')">
          <div class="card-header">
            <h2>${a.name}</h2>
            <span class="toggle-icon">➜</span>
          </div>
          <div class="card-content" style="padding: 1rem; color: var(--text-secondary);">
            Click to load stats from DBLP...
          </div>
        </div>
      `).join('')}
    `;
  } catch (e) {
    console.error("DBLP Search failed", e);
  }
}

window.showDBLPAuthorProfile = async (cardEl, pid, name) => {
  const contentEl = cardEl.querySelector('.card-content');
  contentEl.innerHTML = '<p>Loading stats...</p>';

  try {
    const stats = await window.dblp.stats(pid, startYear, endYear);
    if (!stats) {
      contentEl.innerHTML = '<p>No data found.</p>';
      return;
    }

    const sortedAreas = Object.entries(stats.areas)
      .sort(([, a], [, b]) => b - a);

    const dblpUrl = `https://dblp.org/pid/${pid}.html`;

    contentEl.innerHTML = `
      <div class="card-subtitle">DBLP Author</div>
      <div class="card-stats">
        <strong>${stats.totalAdjusted.toFixed(1)}</strong> adjusted count
      </div>

      <div class="card-links">
        <a href="${dblpUrl}" target="_blank" class="card-link">DBLP</a>
      </div>

      <div class="stats-list">
        ${sortedAreas.map(([area, count]) => `
          <div class="stat-item">
            <span class="stat-label">${areaLabels[area] || area}</span>
            <span class="stat-count">${count.toFixed(1)}</span>
          </div>
        `).join('')}
      </div>
    `;
    cardEl.classList.remove('collapsed');
  } catch (e) {
    contentEl.innerHTML = '<p>Error loading stats.</p>';
  }
};

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

    if (query.length >= 1) {
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

const areaLabels = {
  'ai': 'AI',
  'vision': 'Computer Vision',
  'mlmining': 'Machine Learning & Data Mining',
  'nlp': 'Natural Language Processing',
  'inforet': 'Information Retrieval',
  'arch': 'Computer Architecture',
  'sec': 'Computer Security',
  'mod': 'Databases',
  'da': 'Design Automation',
  'bed': 'Embedded & Real-Time Systems',
  'hpc': 'High-Performance Computing',
  'mobile': 'Mobile Computing',
  'metrics': 'Measurement & Perf. Analysis',
  'ops': 'Operating Systems',
  'plan': 'Programming Languages',
  'soft': 'Software Engineering',
  'comm': 'Computer Networks',
  'graph': 'Computer Graphics',
  'act': 'Algorithms & Complexity',
  'crypt': 'Cryptography',
  'log': 'Logic & Verification',
  'bio': 'Comp. Bio & Bioinformatics',
  'ecom': 'Economics & Computation',
  'chi': 'Human-Computer Interaction',
  'robotics': 'Robotics',
  'visualization': 'Visualization',
  'csed': 'Computer Science Education'
};

function cleanName(name) {
  return name.replace(/\s+\d+$/, '');
}

function renderProfessorCard(prof) {
  // Sort areas by adjusted count descending
  const sortedAreas = Object.entries(prof.areas)
    .sort(([, a], [, b]) => b.adjusted - a.adjusted);
  const dblpUrl = getDBLPUrl(prof.name);

  return `
    <div class="card">
      <h2>${cleanName(prof.name)}</h2>
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
            <span class="stat-label">${areaLabels[area] || area}</span>
            <span class="stat-count">${Math.ceil(stats.count)} (${stats.adjusted.toFixed(1)})</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function findMatchingArea(query) {
  const q = query.toLowerCase();
  // Check keys and values
  for (const [key, label] of Object.entries(areaLabels)) {
    if (key === q || label.toLowerCase().includes(q)) {
      return key;
    }
  }
  return null;
}

function searchSchools(query) {
  const matchedArea = findMatchingArea(query);
  let results;

  if (matchedArea) {
    // Area Search Mode
    results = Object.values(appData.schools)
      .filter(school => school.areas[matchedArea] && school.areas[matchedArea].adjusted > 0)
      .sort((a, b) => {
        const countA = a.areas[matchedArea]?.adjusted || 0;
        const countB = b.areas[matchedArea]?.adjusted || 0;
        return countB - countA;
      });
  } else {
    // Standard Search Mode
    const allSchools = Object.values(appData.schools);
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    results = allSchools
      .filter(s => {
        const name = s.name.toLowerCase();
        return tokens.every(token => name.includes(token));
      })
      .sort((a, b) => a.rank - b.rank); // Default to rank sorting
  }

  const container = document.getElementById('school-results');
  container.innerHTML = results
    .slice(0, 20)
    .map(school => renderSchoolCard(school, matchedArea))
    .join('');
}

function renderSchoolCard(school, filterArea = null) {
  let sortedAreas;

  if (filterArea) {
    if (school.areas[filterArea]) {
      sortedAreas = [[filterArea, school.areas[filterArea]]];
    } else {
      sortedAreas = [];
    }
  } else {
    sortedAreas = Object.entries(school.areas)
      .sort(([, a], [, b]) => b.adjusted - a.adjusted);
  }

  return `
    <div class="card collapsed">
      <div class="card-header" onclick="toggleCard(this)">
        <h2>${school.name} <span style="color: var(--text-secondary); font-size: 0.8em;">#${school.rank}</span></h2>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="card-content">
        <div class="stats-list">
        ${sortedAreas.map(([area, data]) => `
          <div class="school-area-section">
            <div class="school-area-header">
              <span>${areaLabels[area] || area}</span>
              <span>${Math.ceil(data.count)} (${data.adjusted.toFixed(1)})</span>
            </div>
            <div class="faculty-list">
              ${data.faculty
      .sort((a, b) => {
        const countA = appData.professors[a]?.areas[area]?.adjusted || 0;
        const countB = appData.professors[b]?.areas[area]?.adjusted || 0;
        return countB - countA;
      })
      .map(name => `
                <span class="faculty-tag" onclick="setSearchQuery('${cleanName(name).replace(/'/g, "\\'")}')" style="cursor: pointer;">${cleanName(name)}</span>
              `).join('')}
            </div>
          </div>
        `).join('')}
        </div>
      </div>
    </div>
  `;
}

function setupSimulation() {
  const modal = document.getElementById('sim-modal');
  const openBtn = document.getElementById('simulate-btn');
  const closeBtn = document.querySelector('.close-modal');
  const authorSearch = document.getElementById('sim-author-search');
  const univSearch = document.getElementById('sim-univ-search');
  const facultySearch = document.getElementById('sim-faculty-search');
  const resetBtn = document.getElementById('sim-reset-btn');

  let selectedAuthor = null;
  let selectedUniv = null;
  let simMode = 'add';

  document.querySelectorAll('input[name="sim-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      simMode = e.target.value;
      resetSimulation();
    });
  });
  const checkHash = () => {
    if (window.location.hash === '#simulate') {
      openBtn.style.display = 'flex';
    } else {
      openBtn.style.display = 'none';
    }
  };
  checkHash();
  window.addEventListener('hashchange', checkHash);

  openBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    if (simMode === 'add') authorSearch.focus();
    else univSearch.focus();
  });
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  const resetSimulation = () => {
    selectedAuthor = null;
    selectedUniv = null;
    document.getElementById('step-results').classList.add('hidden');
    document.getElementById('step-faculty').classList.add('hidden');

    if (simMode === 'add') {
      document.getElementById('step-author').classList.remove('hidden');
      document.getElementById('step-univ').classList.add('hidden');
      document.getElementById('step-univ-title').textContent = '2. Select Target University';
    } else {
      document.getElementById('step-author').classList.add('hidden');
      document.getElementById('step-univ').classList.remove('hidden');
      document.getElementById('step-univ-title').textContent = '1. Select Target University';
      univSearch.focus();
    }

    authorSearch.value = '';
    univSearch.value = '';
    facultySearch.value = '';
    document.getElementById('sim-author-results').innerHTML = '';
    document.getElementById('sim-univ-results').innerHTML = '';
    document.getElementById('sim-faculty-results').innerHTML = '';
  };

  resetBtn.addEventListener('click', resetSimulation);

  authorSearch.addEventListener('input', async (e) => {
    const q = e.target.value;
    if (q.length < 3) return;

    const results = await window.dblp.search(q);
    const container = document.getElementById('sim-author-results');

    container.innerHTML = results.map(a => `
      <div class="sim-item" data-pid="${a.pid}" data-name="${a.name}">
        <strong>${a.name}</strong> <small>(${a.pid})</small>
      </div>
    `).join('');

    container.querySelectorAll('.sim-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedAuthor = {
          name: item.dataset.name,
          pid: item.dataset.pid
        };
        document.getElementById('selected-author-display').textContent = `Selected: ${selectedAuthor.name}`;
        document.getElementById('step-author').classList.add('hidden');
        document.getElementById('step-univ').classList.remove('hidden');
        univSearch.focus();
      });
    });
  });

  univSearch.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    if (q.length < 1) return;

    const results = Object.values(appData.schools)
      .filter(s => s.name.toLowerCase().includes(q))
      .slice(0, 10);

    const container = document.getElementById('sim-univ-results');
    container.innerHTML = results.map(s => `
      <div class="sim-item" data-name="${s.name}">
        <strong>${s.name}</strong> <small>#${s.rank}</small>
      </div>
    `).join('');

    container.querySelectorAll('.sim-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedUniv = appData.schools[item.dataset.name];

        if (simMode === 'add') {
          document.getElementById('selected-univ-display').textContent = `Target: ${selectedUniv.name}`;
          document.getElementById('step-univ').classList.add('hidden');
          document.getElementById('step-results').classList.remove('hidden');
          runSimulation(selectedAuthor, selectedUniv, false);
        } else {
          // Remove Mode
          document.getElementById('selected-univ-display-remove').textContent = `Target: ${selectedUniv.name}`;
          document.getElementById('step-univ').classList.add('hidden');
          document.getElementById('step-faculty').classList.remove('hidden');
          renderFacultyList(selectedUniv);
          facultySearch.focus();
        }
      });
    });
  });

  const renderFacultyList = (school) => {
    const container = document.getElementById('sim-faculty-results');

    const facultySet = new Set();
    Object.values(school.areas).forEach(area => {
      area.faculty.forEach(name => facultySet.add(name));
    });

    const faculty = Array.from(facultySet).sort();

    const filterAndRender = (q) => {
      const filtered = faculty.filter(f => f.toLowerCase().includes(q));
      container.innerHTML = filtered.map(f => `
        <div class="sim-item" data-name="${f.replace(/"/g, '&quot;')}">
          <strong>${cleanName(f)}</strong>
        </div>
      `).join('');

      container.querySelectorAll('.sim-item').forEach(item => {
        item.addEventListener('click', () => {
          const profName = item.dataset.name;
          const profObj = { name: profName, isFaculty: true };
          document.getElementById('selected-univ-display').textContent = `Target: ${selectedUniv.name}`;
          document.getElementById('step-faculty').classList.add('hidden');
          document.getElementById('step-results').classList.remove('hidden');
          runSimulation(profObj, selectedUniv, true);
        });
      });
    };

    filterAndRender('');

    facultySearch.oninput = (e) => filterAndRender(e.target.value.toLowerCase());
  };
}

async function runSimulation(author, school, isRemove = false) {
  const loading = document.getElementById('sim-loading');
  const display = document.getElementById('sim-impact-display');

  loading.classList.remove('hidden');
  display.innerHTML = '';

  let stats;

  if (isRemove) {
    const prof = appData.professors[author.name];
    if (!prof) {
      loading.classList.add('hidden');
      display.innerHTML = '<p style="color:red">Professor data not found.</p>';
      return;
    }
    const flatAreas = {};
    for (const [k, v] of Object.entries(prof.areas)) {
      flatAreas[k] = v.adjusted;
    }
    stats = {
      totalAdjusted: prof.totalAdjusted,
      areas: flatAreas
    };
  } else {
    stats = await window.dblp.search(author.pid);
    if (!stats) {
      loading.classList.add('hidden');
      display.innerHTML = '<p style="color:red">Failed to fetch author data.</p>';
      return;
    }
  }

  const schoolClone = JSON.parse(JSON.stringify(school));

  for (const [area, val] of Object.entries(stats.areas)) {
    if (!schoolClone.areas[area]) {
      schoolClone.areas[area] = { count: 0, adjusted: 0, faculty: [] };
    }

    if (isRemove) {
      schoolClone.areas[area].adjusted = Math.max(0, schoolClone.areas[area].adjusted - val);
    } else {
      schoolClone.areas[area].adjusted += val;
    }
  }

  // 3. Re-calculate Rank
  const allSchools = Object.values(appData.schools).map(s =>
    s.name === school.name ? schoolClone : s
  );

  const areas = new Set();
  Object.values(parentMap).forEach(a => areas.add(a));
  const areaList = Array.from(areas);

  const calcScore = (s) => {
    let product = 1;
    for (const area of areaList) {
      const adj = s.areas[area]?.adjusted || 0;
      product *= (adj + 1);
    }
    return Math.pow(product, 1 / areaList.length) - 1;
  };

  allSchools.forEach(s => {
    s._simScore = calcScore(s);
  });

  allSchools.sort((a, b) => b._simScore - a._simScore);

  const newRank = allSchools.findIndex(s => s.name === school.name) + 1;
  const oldRank = school.rank;
  const diff = oldRank - newRank;

  loading.classList.add('hidden');

  let arrow = diff > 0 ? '⬆' : (diff < 0 ? '⬇' : '➡');
  let color = diff > 0 ? '#10b981' : (diff < 0 ? '#ef4444' : 'var(--text-secondary)');

  const actionText = isRemove ? `Removed ${author.name}` : `Added ${author.name}`;
  const impactText = diff > 0 ? `Improved by ${diff} spots!` : (diff < 0 ? `Dropped by ${Math.abs(diff)} spots` : 'No change in rank');

  display.innerHTML = `
    <div class="impact-card">
      <h3>${actionText}</h3>
      <p>${isRemove ? '-' : '+'}${stats.totalAdjusted.toFixed(1)} Adjusted Count</p>
    </div>
    
    <div class="impact-card">
      <h3>${school.name}</h3>
      <div class="rank-change" style="color: ${color}">
        <span>#${oldRank}</span>
        <span>${arrow}</span>
        <span>#${newRank}</span>
      </div>
      <p>${impactText}</p>
    </div>

    <div class="area-gains">
      <h4>Top Area ${isRemove ? 'Losses' : 'Gains'}:</h4>
      ${Object.entries(stats.areas)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([area, val]) => `
          <div class="gain-item">
            <span>${areaLabels[area] || area}</span>
            <span class="gain-val" style="color: ${isRemove ? '#ef4444' : '#10b981'}">
              ${isRemove ? '-' : '+'}${val.toFixed(1)}
            </span>
          </div>
        `).join('')}
    </div>
  `;
}

init();
