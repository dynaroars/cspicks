import { loadData, filterByYears, DEFAULT_START_YEAR, DEFAULT_END_YEAR, parentMap, schoolAliases, conferenceAliases } from './data.js';
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
let selectedRegion = 'world';

const params = new URLSearchParams(window.location.search);
if (params.has('start')) startYear = parseInt(params.get('start'));
if (params.has('end')) endYear = parseInt(params.get('end'));
if (params.has('region')) selectedRegion = params.get('region');

async function init() {
  setupFilters();
  setupSearch();
  setupSimulation();

  try {
    rawData = await loadData();
    appData = filterByYears(rawData, startYear, endYear, selectedRegion);
    console.log(`Data loaded (${startYear}-${endYear}, region: ${selectedRegion}):`, Object.keys(appData.professors).length, 'professors', Object.keys(appData.schools).length, 'schools');

    const searchInput = document.getElementById('main-search');
    searchInput.placeholder = "Search professors, universities, areas (e.g., graphics), or conferences (e.g., pldi)";
    searchInput.disabled = false;

    document.getElementById('region-select').value = selectedRegion;

    if (params.has('q')) {
      searchInput.value = params.get('q');
      const query = params.get('q').toLowerCase();
      searchProfessors(query);
      searchSchools(query);
      searchAreaPeople(query);
      searchDBLPAuthors(query);
    }

    searchInput.focus();
  } catch (err) {
    console.error('Failed to load data:', err);
    document.querySelector('main').innerHTML = '<p style="text-align:center; color: #ef4444;">Error loading data. Please try again.</p>';
  }
}

function updateURL() {
  const params = new URLSearchParams();
  params.set('start', startYear);
  params.set('end', endYear);
  params.set('region', selectedRegion);

  const q = document.getElementById('main-search').value;
  if (q) params.set('q', q);

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

function setupSearch() {
  const mainSearch = document.getElementById('main-search');

  let debounceTimer;
  mainSearch.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.toLowerCase();

    updateURL();

    if (query.length < 2) {
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

let areaPeopleObserver = null;

function searchAreaPeople(query) {
  if (areaPeopleObserver) {
    areaPeopleObserver.disconnect();
    areaPeopleObserver = null;
  }

  const container = document.getElementById('area-people-results');
  container.innerHTML = '';

  container.innerHTML = '';

  let topProfs = [];
  let title = 'Top Researchers';

  // 1. Check Conference Match
  let effectiveQuery = conferenceAliases[query] || query;
  const confKey = Object.keys(parentMap).find(k => k.toLowerCase() === effectiveQuery);

  if (confKey) {
    // If it was an alias (e.g. neurips -> nips), display the name user typed? Or the canonical key?
    // Canonical key is 'nips'. User might prefer "NeurIPS". 
    // I'll display the canonical key mapped back to uppercase, or alias if possible.
    // For now, simple: `confKey.toUpperCase()`. "NIPS".
    // Maybe better: `(Object.keys(conferenceAliases).find(key => conferenceAliases[key] === confKey) || confKey).toUpperCase()`
    // But "nips" is historic. 
    // I'll stick to confKey.toUpperCase() for now (NIPS).
    title = `Top Researchers in ${confKey.toUpperCase()}`;
    topProfs = Object.values(appData.professors)
      .map(p => {
        const confPubs = p.pubs.filter(pub => pub.area === confKey);
        if (confPubs.length === 0) return null;
        const adjusted = confPubs.reduce((sum, pub) => sum + pub.adjustedcount, 0);
        return { ...p, confAdjusted: adjusted };
      })
      .filter(p => p && p.confAdjusted > 0)
      .sort((a, b) => b.confAdjusted - a.confAdjusted);
  } else {
    const areaMatch = Object.entries(areaLabels).find(([key, label]) =>
      label.toLowerCase().includes(query) || key.toLowerCase() === query
    );

    if (areaMatch) {
      const [areaKey] = areaMatch;
      // Find top professors in this area
      topProfs = Object.values(appData.professors)
        .filter(p => p.areas[areaKey] && p.areas[areaKey].adjusted > 0)
        .sort((a, b) => b.areas[areaKey].adjusted - a.areas[areaKey].adjusted);
    }
  }

  if (topProfs.length === 0) return;

  container.innerHTML = `
    <div class="section-header" style="grid-column: 1/-1; margin-top: 2rem;">
      <h3>${title}</h3>
    </div>
    <div id="area-people-list" class="compact-list" style="grid-column: 1/-1; display: flex; flex-direction: column; gap: 0.5rem;"></div>
  `;

  const listContainer = document.getElementById('area-people-list');
  const CHUNK_SIZE = 20;
  let renderedCount = 0;

  const renderChunk = () => {
    const chunk = topProfs.slice(renderedCount, renderedCount + CHUNK_SIZE);
    if (chunk.length === 0) return;

    const oldSentinel = document.getElementById('area-sentinel');
    if (oldSentinel) oldSentinel.remove();

    const html = chunk.map(prof => `
        <div class="card collapsed" style="margin: 0;">
          <div class="card-header" onclick="toggleCard(this)">
            <div style="display: flex; align-items: baseline; gap: 1rem;">
              <h2>${cleanName(prof.name)}</h2>
            </div>
            <span class="toggle-icon">▼</span>
          </div>
          <div class="card-content">
            ${renderProfessorCardContent(prof)}
          </div>
        </div>
      `).join('');

    listContainer.insertAdjacentHTML('beforeend', html);
    renderedCount += CHUNK_SIZE;

    if (renderedCount < topProfs.length) {
      const sentinel = document.createElement('div');
      sentinel.id = 'area-sentinel';
      sentinel.style.height = '50px';
      listContainer.appendChild(sentinel);

      if (areaPeopleObserver) areaPeopleObserver.observe(sentinel);
    }
  };

  areaPeopleObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      areaPeopleObserver.unobserve(entries[0].target);
      renderChunk();
    }
  }, { rootMargin: '400px' });

  renderChunk();
}

function renderProfessorCardContent(prof) {
  const sortedAreas = Object.entries(prof.areas)
    .sort(([, a], [, b]) => b.adjusted - a.adjusted);
  const dblpUrl = getDBLPUrl(prof.name);

  return `
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
  `;
}

async function searchDBLPAuthors(query) {
  if (query.length < 2) {
    document.getElementById('dblp-results').innerHTML = '';
    return;
  }

  const container = document.getElementById('dblp-results');

  try {
    let results = await window.dblp.search(query);
    console.log('DBLP Search Results:', results);

    const existingProfNames = new Set(Object.keys(appData.professors).map(n => n.toLowerCase()));
    results = results.filter(a => !existingProfNames.has(a.name.toLowerCase()));

    if (results.length === 0) {
      container.innerHTML = '';
      return;
    }

    const candidates = results.slice(0, 100);
    console.log(`Checking ${candidates.length} candidates...`);

    const validAuthors = [];

    await Promise.all(candidates.map(async (a) => {
      try {
        const stats = await window.dblp.stats(a.pid, startYear, endYear);
        if (stats && stats.totalAdjusted > 0) {
          validAuthors.push({ ...a, stats });
        } else {
          // console.log(`Skipping ${a.name}: 0 adjusted count`);
        }
      } catch (e) {
        // ignore failed fetches
      }
    }));

    if (validAuthors.length === 0) {
      container.innerHTML = '';
      return;
    }

    validAuthors.sort((a, b) => b.stats.totalAdjusted - a.stats.totalAdjusted);

    container.innerHTML = `
      <div class="section-header" style="grid-column: 1/-1; margin-top: 2rem;">
        <h3>Other Authors (DBLP)</h3>
      </div>
      <div class="compact-list" style="grid-column: 1/-1; display: flex; flex-direction: column; gap: 0.5rem;">
      ${validAuthors.map(a => {
      const sortedAreas = Object.entries(a.stats.areas)
        .sort(([, x], [, y]) => y.adjusted - x.adjusted);

      const dblpUrl = `https://dblp.org/pid/${a.pid}.html`;

      return `
        <div class="card collapsed" style="margin: 0;">
          <div class="card-header" onclick="toggleCard(this)">
            <div style="display: flex; align-items: baseline; gap: 1rem;">
              <h2>${a.name}</h2>
              <span style="color: #10b981; font-weight: bold; font-size: 0.9rem;">${a.stats.totalAdjusted.toFixed(1)} Adjusted Count</span>
            </div>
            <span class="toggle-icon">▼</span>
          </div>
          <div class="card-content">
             <div class="card-subtitle">DBLP Author</div>
             <div class="card-stats">
               <strong>${a.stats.totalPapers}</strong> papers (<strong>${a.stats.totalAdjusted.toFixed(1)}</strong> adjusted)
             </div>
             <div class="card-links">
               <a href="${dblpUrl}" target="_blank" class="card-link">DBLP</a>
             </div>
             <div class="stats-list">
               ${sortedAreas.map(([area, stats]) => `
                 <div class="stat-item">
                   <span class="stat-label">${areaLabels[area] || area}</span>
                   <span class="stat-count">${stats.count} (${stats.adjusted.toFixed(1)})</span>
                 </div>
               `).join('')}
             </div>
          </div>
        </div>
      `}).join('')}
      </div>
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

window.searchProfessorByAffiliation = function (name, affiliation) {
  const input = document.getElementById('main-search');
  input.value = name;

  const query = name.toLowerCase();
  const tokens = query.split(/\s+/).filter(t => t.length > 0);

  const results = Object.values(appData.professors)
    .filter(p => {
      const profName = p.name.toLowerCase();
      return tokens.every(token => profName.includes(token));
    })
    .sort((a, b) => {
      const aMatch = a.affiliation === affiliation ? 1 : 0;
      const bMatch = b.affiliation === affiliation ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return b.totalAdjusted - a.totalAdjusted;
    });

  const container = document.getElementById('prof-results');
  container.innerHTML = results
    .slice(0, 50)
    .map(prof => renderProfessorCard(prof))
    .join('');

  document.getElementById('school-results').innerHTML = '';
  document.getElementById('area-people-results').innerHTML = '';
  document.getElementById('dblp-results').innerHTML = '';

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

    updateURL();

    // Re-run current search
    const query = document.getElementById('main-search').value.toLowerCase();

    if (query.length >= 1) {
      searchProfessors(query);
      searchSchools(query);
      searchAreaPeople(query);
      searchDBLPAuthors(query);
    } else {
      document.getElementById('prof-results').innerHTML = '';
      document.getElementById('school-results').innerHTML = '';
      document.getElementById('area-people-results').innerHTML = '';
      document.getElementById('dblp-results').innerHTML = '';
    }
  };

  regionSelect.addEventListener('change', handleFilterChange);
  startYearSelect.addEventListener('change', handleFilterChange);
  endYearSelect.addEventListener('change', handleFilterChange);
}

let profObserver = null;

function searchProfessors(query) {
  if (profObserver) {
    profObserver.disconnect();
    profObserver = null;
  }

  const allProfs = Object.values(appData.professors);
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

  const results = allProfs
    .filter(p => {
      const name = p.name.toLowerCase();
      return tokens.every(token => name.includes(token));
    })
    .sort((a, b) => b.totalAdjusted - a.totalAdjusted);

  const container = document.getElementById('prof-results');
  container.innerHTML = '';

  const CHUNK_SIZE = 20;
  let renderedCount = 0;

  const renderChunk = () => {
    const chunk = results.slice(renderedCount, renderedCount + CHUNK_SIZE);
    if (chunk.length === 0) return;

    const oldSentinel = document.getElementById('prof-sentinel');
    if (oldSentinel) oldSentinel.remove();

    const html = chunk.map(renderProfessorCard).join('');
    container.insertAdjacentHTML('beforeend', html);
    renderedCount += CHUNK_SIZE;

    if (renderedCount < results.length) {
      const sentinel = document.createElement('div');
      sentinel.id = 'prof-sentinel';
      sentinel.style.height = '50px';
      container.appendChild(sentinel);

      if (profObserver) profObserver.observe(sentinel);
    }
  };

  profObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      profObserver.unobserve(entries[0].target);
      renderChunk();
    }
  }, { rootMargin: '400px' });

  renderChunk();
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
  const searchInput = document.getElementById('main-search');
  const currentQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const isExactMatch = cleanName(prof.name).toLowerCase() === currentQuery;
  const cardClass = isExactMatch ? 'card' : 'card collapsed';

  return `
    <div class="${cardClass}">
      <div class="card-header" onclick="toggleCard(this)">
        <h2>${cleanName(prof.name)}</h2>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="card-content">
        ${renderProfessorCardContent(prof)}
      </div>
    </div>
  `;
}

function findMatchingArea(query) {
  const q = query.toLowerCase();

  if (areaLabels[q]) return q;

  for (const key of Object.keys(areaLabels)) {
    if (key.startsWith(q)) return key;
  }

  for (const [key, label] of Object.entries(areaLabels)) {
    if (label.toLowerCase().startsWith(q)) return key;
  }
  for (const [key, label] of Object.entries(areaLabels)) {
    if (label.toLowerCase().includes(q)) return key;
  }

  return null;
}

function searchSchools(query) {
  const effectiveQuery = schoolAliases[query] || query;
  const confKeyRaw = conferenceAliases[query] || query;
  const confKeyMatch = Object.keys(parentMap).find(k => k.toLowerCase().startsWith(confKeyRaw) || confKeyRaw.startsWith(k.toLowerCase()));
  const matchedArea = findMatchingArea(effectiveQuery);
  let results;

  document.getElementById('conference-results').innerHTML = '';
  const header = document.getElementById('search-context-header');

  if (confKeyMatch) {
    const allConfMatches = Object.keys(parentMap).filter(k =>
      k.toLowerCase().startsWith(confKeyRaw) || confKeyRaw.startsWith(k.toLowerCase())
    );

    allConfMatches.sort((a, b) => {
      if (a === confKeyRaw) return -1;
      if (b === confKeyRaw) return 1;
      return a.localeCompare(b);
    });

    header.textContent = `Results for Conference: ${allConfMatches.map(c => c.toUpperCase()).join(', ')}`;
    header.style.display = 'block';

    const confResultsContainer = document.getElementById('conference-results');

    const confCardsHtml = allConfMatches.map(confKey => {
      const schoolStats = {};
      Object.entries(appData.professors).forEach(([profName, prof]) => {
        const pubsInConf = prof.pubs.filter(p => p.area === confKey);
        if (pubsInConf.length === 0) return;

        const adjusted = pubsInConf.reduce((sum, p) => sum + p.adjustedcount, 0);
        const count = pubsInConf.reduce((sum, p) => sum + p.count, 0);
        if (adjusted === 0) return;

        const schoolName = prof.affiliation;
        if (!schoolStats[schoolName]) {
          schoolStats[schoolName] = { adjusted: 0, count: 0, faculty: [] };
        }
        schoolStats[schoolName].adjusted += adjusted;
        schoolStats[schoolName].count += count;
        schoolStats[schoolName].faculty.push(profName);
      });

      const sortedSchools = Object.entries(schoolStats)
        .map(([name, stats]) => ({ name, ...stats, rank: appData.schools[name]?.rank || 999 }))
        .sort((a, b) => b.adjusted - a.adjusted);

      if (sortedSchools.length === 0) return '';

      return renderConferenceCard(confKey, sortedSchools);
    }).join('');

    confResultsContainer.innerHTML = confCardsHtml;

    document.getElementById('school-results').innerHTML = '';
    return;

  }

  if (matchedArea) {
    header.textContent = `Results for Area: ${areaLabels[matchedArea]}`;
    header.style.display = 'block';
  } else {
    header.style.display = 'none';
  }

  if (confKeyMatch) {
    const schoolStats = {};

    Object.entries(appData.professors).forEach(([profName, prof]) => {
      const pubsInConf = prof.pubs.filter(p => p.area === confKeyMatch);
      if (pubsInConf.length === 0) return;

      const adjusted = pubsInConf.reduce((sum, p) => sum + p.adjustedcount, 0);
      const count = pubsInConf.reduce((sum, p) => sum + p.count, 0);
      if (adjusted === 0) return;

      const schoolName = prof.affiliation;
      if (!schoolStats[schoolName]) {
        schoolStats[schoolName] = { adjusted: 0, count: 0, faculty: [] };
      }
      schoolStats[schoolName].adjusted += adjusted;
      schoolStats[schoolName].count += count;
      schoolStats[schoolName].faculty.push(profName);
    });

    results = Object.entries(schoolStats)
      .map(([schoolName, stats]) => {
        const school = appData.schools[schoolName];
        if (!school) return null;

        const sClone = { ...school, areas: { ...school.areas } };
        sClone.areas[confKeyMatch] = { count: stats.count, adjusted: stats.adjusted, faculty: stats.faculty };
        return sClone;
      })
      .filter(s => s)
      .sort((a, b) => b.areas[confKeyMatch].adjusted - a.areas[confKeyMatch].adjusted);

  } else if (matchedArea) {
    // Area Search Mode
    results = Object.values(appData.schools)
      .filter(school => school.areas[matchedArea] && school.areas[matchedArea].adjusted > 0)
      .sort((a, b) => {
        const countA = a.areas[matchedArea]?.adjusted || 0;
        const countB = b.areas[matchedArea]?.adjusted || 0;
        return countB - countA;
      });
  } else {
    const allSchools = Object.values(appData.schools);
    const tokens = effectiveQuery.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const originalTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    results = allSchools
      .filter(s => {
        const name = s.name.toLowerCase();
        return tokens.every(token => name.includes(token)) ||
          originalTokens.every(token => name.includes(token));
      })
      .sort((a, b) => a.rank - b.rank);
  }

  const container = document.getElementById('school-results');
  const filterKey = confKeyMatch || matchedArea;
  const initialCount = 20;

  window._schoolResults = { results, filterKey, shown: initialCount };

  let html = results
    .slice(0, initialCount)
    .map(school => renderSchoolCard(school, filterKey))
    .join('');

  if (results.length > initialCount) {
    html += `
      <div id="see-more-schools" style="grid-column: 1/-1; text-align: center; margin-top: 1rem;">
        <button onclick="showMoreSchools()" class="btn-secondary" style="padding: 0.75rem 2rem;">
          See more universities (${results.length - initialCount} remaining)
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

window.showMoreSchools = function () {
  const { results, filterKey, shown } = window._schoolResults;
  const nextBatch = 20;
  const newShown = shown + nextBatch;

  document.getElementById('see-more-schools')?.remove();

  const container = document.getElementById('school-results');
  const newCards = results
    .slice(shown, newShown)
    .map(school => renderSchoolCard(school, filterKey))
    .join('');

  container.insertAdjacentHTML('beforeend', newCards);

  window._schoolResults.shown = newShown;

  if (results.length > newShown) {
    container.insertAdjacentHTML('beforeend', `
      <div id="see-more-schools" style="grid-column: 1/-1; text-align: center; margin-top: 1rem;">
        <button onclick="showMoreSchools()" class="btn-secondary" style="padding: 0.75rem 2rem;">
          See more universities (${results.length - newShown} remaining)
        </button>
      </div>
    `);
  }
};

function renderConferenceCard(confKey, sortedSchools) {
  const cardClass = 'card collapsed';

  return `
    <div class="${cardClass}">
      <div class="card-header" onclick="toggleCard(this)">
        <h2>${confKey.toUpperCase()}</h2>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="card-content">
        <div class="stats-list">
        ${sortedSchools.map(school => `
          <div class="school-area-section">
            <div class="school-area-header">
              <span onclick="setSearchQuery('${school.name.replace(/'/g, "\\'")}')" style="cursor: pointer; text-decoration: underline; text-decoration-style: dotted;">${school.name} <small>#${school.rank}</small></span>
              <span>${Math.ceil(school.count)} (${school.adjusted.toFixed(1)})</span>
            </div>
            <div class="faculty-list">
              ${school.faculty
      .sort((a, b) => {
        const profA = appData.professors[a];
        const profB = appData.professors[b];
        const countA = profA?.pubs.filter(p => p.area === confKey).reduce((sum, p) => sum + p.adjustedcount, 0) || 0;
        const countB = profB?.pubs.filter(p => p.area === confKey).reduce((sum, p) => sum + p.adjustedcount, 0) || 0;
        return countB - countA;
      })
      .map(name => `
                  <span class="faculty-tag" onclick="searchProfessorByAffiliation('${cleanName(name).replace(/'/g, "\\'")}', '${school.name.replace(/'/g, "\\'")}')" style="cursor: pointer;">${cleanName(name)}</span>
                `).join('')}
            </div>
          </div>
        `).join('')}
        </div>
      </div>
    </div>
  `;
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

  const searchInput = document.getElementById('main-search');
  const currentQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const isExactMatch = school.name.toLowerCase() === currentQuery ||
    (schoolAliases[currentQuery] && schoolAliases[currentQuery].toLowerCase() === school.name.toLowerCase());
  const cardClass = isExactMatch ? 'card' : 'card collapsed';

  return `
    <div class="${cardClass}">
      <div class="card-header" onclick="toggleCard(this)">
        <h2>${school.name} <span style="color: var(--text-secondary); font-size: 0.8em;">#${school.rank}</span></h2>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="card-content">
        <div class="stats-list">
        ${sortedAreas.map(([area, data]) => `
          <div class="school-area-section">
            <div class="school-area-header">
              <span onclick="setSearchQuery('${areaLabels[area] ? areaLabels[area].replace(/'/g, "\\'") : area}')" style="cursor: pointer; text-decoration: underline; text-decoration-style: dotted;">${areaLabels[area] || area}</span>
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
                <span class="faculty-tag" onclick="searchProfessorByAffiliation('${cleanName(name).replace(/'/g, "\\'")}', '${school.name.replace(/'/g, "\\'")}')" style="cursor: pointer;">${cleanName(name)}</span>
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
    stats = await window.dblp.stats(author.pid, startYear, endYear);
    if (!stats) {
      loading.classList.add('hidden');
      display.innerHTML = '<p style="color:red">Failed to fetch author data.</p>';
      return;
    }
  }

  const schoolClone = JSON.parse(JSON.stringify(school));

  for (const [area, areaStats] of Object.entries(stats.areas)) {
    // Handle both old format (if cached/prof data) and new format (DBLP stats)
    // Actually standard prof data is still flattened? No, prof.areas is also { adjusted, count } usually?
    // Let's check appData.professors structure. In data.js loadData:
    // professors[name].areas[area] = { count: ..., adjusted: ... }
    // So actually even 'isRemove' logic might have been relying on object access earlier? 
    // Wait, let's look at `isRemove` block:
    // `flatAreas[k] = v.adjusted` -> Here it was explicitly flattening to a number! (Lines 846-848)
    // But `window.dblp.stats` now returns objects.

    // So I just need to handle the case where `areaStats` is an object.
    const val = typeof areaStats === 'number' ? areaStats : areaStats.adjusted;

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
      .map(([area, areaStats]) => {
        const val = typeof areaStats === 'number' ? areaStats : areaStats.adjusted;
        return [area, val];
      })
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
