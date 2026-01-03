import { loadData, filterByYears, DEFAULT_START_YEAR, DEFAULT_END_YEAR, parentMap, schoolAliases, conferenceAliases, nationalityAliases, fetchCsv, mergeAffiliationHistory } from './data.js';
import { nameOriginMap } from './name_map.js';
import he from 'he';

import { searchAuthor, fetchAuthorStats } from './dblp.js';

window.dblp = {
  search: searchAuthor,
  stats: fetchAuthorStats
};

let rawData = null;
let appData = { professors: {}, schools: {} };
let historyMap = null;  // OpenAlex affiliation history
let aliasMap = null;    // School name aliases

let startYear = DEFAULT_START_YEAR;
let endYear = DEFAULT_END_YEAR;
let selectedRegion = 'us';
let historicalMode = false;

const params = new URLSearchParams(window.location.search);
if (params.has('start')) startYear = parseInt(params.get('start'));
if (params.has('end')) endYear = parseInt(params.get('end'));
if (params.has('region')) selectedRegion = params.get('region');
if (params.has('historical')) historicalMode = params.get('historical') === 'true';
async function init() {
  setupFilters();
  setupSearch();
  setupSimulation();
  setupTooltips();

  try {
    // Load main data and historical affiliation data in parallel
    const GITHUB_RAW = 'https://raw.githubusercontent.com/dynaroars/cspicks/main/public';
    const [data, history, aliases, manualCsv] = await Promise.all([
      loadData(),
      fetch(`${GITHUB_RAW}/professor_history_openalex.json`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${GITHUB_RAW}/school-aliases.json`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetchCsv('./manual_affiliations.csv').catch(() => []),
    ]);

    rawData = data;
    aliasMap = aliases;
    historyMap = mergeAffiliationHistory(history || {}, manualCsv);

    // Initialize toggle checkbox
    const historicalToggle = document.getElementById('historical-mode');
    if (historicalToggle) {
      historicalToggle.checked = historicalMode;
      historicalToggle.addEventListener('change', () => {
        historicalMode = historicalToggle.checked;
        refreshData();
        updateURL();
      });
    }

    // Apply filters
    if (historicalMode && historyMap && aliasMap) {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, historyMap, aliasMap);
    } else {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion);
    }

    console.log(`Data loaded (${startYear}-${endYear}, region: ${selectedRegion}, historical: ${historicalMode}):`, Object.keys(appData.professors).length, 'professors', Object.keys(appData.schools).length, 'schools');

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
    } else {
      // Show top rankings on initial load
      showTopRankings();
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
  if (historicalMode) params.set('historical', 'true');

  const q = document.getElementById('main-search').value;
  if (q) params.set('q', q);

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

function refreshData() {
  if (!rawData) return;

  if (historicalMode && historyMap && aliasMap) {
    appData = filterByYears(rawData, startYear, endYear, selectedRegion, historyMap, aliasMap);
  } else {
    appData = filterByYears(rawData, startYear, endYear, selectedRegion);
  }

  console.log(`Refreshed: Region=${selectedRegion}, Years=${startYear}-${endYear}, Historical=${historicalMode}`);

  // Re-run current search
  const query = document.getElementById('main-search').value.toLowerCase();
  if (query.length >= 2) {
    searchProfessors(query);
    searchSchools(query);
    searchAreaPeople(query);
    searchDBLPAuthors(query);
  } else {
    showTopRankings();
  }
}
function setupSearch() {
  const mainSearch = document.getElementById('main-search');

  let debounceTimer;
  mainSearch.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.toLowerCase();

    updateURL();

    if (query.length < 2) {
      showTopRankings();
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

function showTopRankings() {
  const schoolContainer = document.getElementById('school-results');
  const profContainer = document.getElementById('prof-results');
  const areaContainer = document.getElementById('area-people-results');
  const dblpContainer = document.getElementById('dblp-results');

  areaContainer.innerHTML = '';
  dblpContainer.innerHTML = '';
  document.getElementById('search-context-header').style.display = 'none';
  document.getElementById('conference-results').innerHTML = '';

  const topSchools = Object.values(appData.schools)
    .filter(s => s.name && s.rank)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 50);
  const topProfs = Object.values(appData.professors)
    .sort((a, b) => b.totalAdjusted - a.totalAdjusted)
    .slice(0, 50);

  const initialSchools = 10;
  window._topSchoolsData = { schools: topSchools, shown: initialSchools };

  let schoolHtml = `<h2 class="section-title">Top Schools</h2>`;
  schoolHtml += topSchools.slice(0, initialSchools).map(s => renderSchoolCard(s)).join('');
  if (topSchools.length > initialSchools) {
    schoolHtml += `<button class="show-more-btn" onclick="showMoreTopSchools()">Show ${Math.min(topSchools.length - initialSchools, 40)} More Schools</button>`;
  }
  schoolContainer.innerHTML = schoolHtml;

  const initialProfs = 10;
  window._topProfsData = { profs: topProfs, shown: initialProfs };

  let profHtml = `<h2 class="section-title">Top Researchers</h2>`;
  profHtml += topProfs.slice(0, initialProfs).map(p => renderProfessorCard(p)).join('');
  if (topProfs.length > initialProfs) {
    profHtml += `<button class="show-more-btn" onclick="showMoreTopProfs()">Show ${Math.min(topProfs.length - initialProfs, 40)} More Researchers</button>`;
  }
  profContainer.innerHTML = profHtml;
}

window.showMoreTopSchools = function () {
  const data = window._topSchoolsData;
  if (!data) return;

  const container = document.getElementById('school-results');
  const nextBatch = data.schools.slice(data.shown, data.shown + 40);
  data.shown += nextBatch.length;

  const btn = container.querySelector('.show-more-btn');
  if (btn) btn.remove();

  container.insertAdjacentHTML('beforeend', nextBatch.map(s => renderSchoolCard(s)).join(''));

  if (data.shown < data.schools.length) {
    container.insertAdjacentHTML('beforeend',
      `<button class="show-more-btn" onclick="showMoreTopSchools()">Show ${Math.min(data.schools.length - data.shown, 40)} More Schools</button>`
    );
  }
};

window.showMoreTopProfs = function () {
  const data = window._topProfsData;
  if (!data) return;

  const container = document.getElementById('prof-results');
  const nextBatch = data.profs.slice(data.shown, data.shown + 40);
  data.shown += nextBatch.length;

  const btn = container.querySelector('.show-more-btn');
  if (btn) btn.remove();

  container.insertAdjacentHTML('beforeend', nextBatch.map(p => renderProfessorCard(p)).join(''));

  if (data.shown < data.profs.length) {
    container.insertAdjacentHTML('beforeend',
      `<button class="show-more-btn" onclick="showMoreTopProfs()">Show ${Math.min(data.profs.length - data.shown, 40)} More Researchers</button>`
    );
  }
};

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

  let affiliationsHtml = '';
  if (historicalMode && historyMap && historyMap[prof.name]) {
    const history = historyMap[prof.name];
    const currentYear = new Date().getFullYear();

    const affiliationMap = new Map();

    // Get publication years from the professor's filtered pubs
    const pubYears = new Set(prof.pubs.map(p => p.year));

    const schoolsWithPapers = new Set();
    prof.pubs.forEach(pub => {
      if (historyMap[prof.name]) {
        const matchingSegs = historyMap[prof.name].filter(seg =>
          pub.year >= seg.start && pub.year <= seg.end
        );
        matchingSegs.forEach(seg => {
          let schoolName = seg.school;
          if (aliasMap && Object.prototype.hasOwnProperty.call(aliasMap, seg.school)) {
            schoolName = aliasMap[seg.school];
          }
          if (schoolName) {
            schoolsWithPapers.add(schoolName);
          }
        });
      }
    });

    history.forEach(seg => {
      let hasPapersInSegment = false;
      for (let year = seg.start; year <= seg.end; year++) {
        if (pubYears.has(year)) {
          hasPapersInSegment = true;
          break;
        }
      }

      // Duration filter: require 2+ years OR current affiliation
      const duration = seg.end - seg.start + 1;
      const isSignificant = duration >= 2 || seg.end >= currentYear;

      if (hasPapersInSegment && isSignificant && seg.end >= startYear && seg.start <= endYear) {
        let schoolName = seg.school;
        if (aliasMap && Object.prototype.hasOwnProperty.call(aliasMap, seg.school)) {
          schoolName = aliasMap[seg.school];
        }

        // FILTER 1: must exist in CSRankings school list
        const isAcademic = rawData.schools && rawData.schools[schoolName];

        // FILTER 2: must have papers attributed to this school
        const hasPapersAtSchool = schoolsWithPapers.has(schoolName);

        if (schoolName && isAcademic && hasPapersAtSchool) {
          if (affiliationMap.has(schoolName)) {
            const existing = affiliationMap.get(schoolName);
            existing.start = Math.min(existing.start, seg.start);
            existing.end = Math.max(existing.end, seg.end);
          } else {
            affiliationMap.set(schoolName, { start: seg.start, end: seg.end });
          }
        }
      }
    });

    if (affiliationMap.size > 0) {
      // Sort by recency
      const sortedAffils = Array.from(affiliationMap.entries())
        .sort((a, b) => {
          if (b[1].end !== a[1].end) return b[1].end - a[1].end;
          return b[1].start - a[1].start;
        });

      const formatAffil = ([school, range]) => {
        const endLabel = range.end >= currentYear ? 'current' : range.end;
        const yearRange = range.start === range.end ? `${range.start}` : `${range.start}–${endLabel}`;
        return `<a href="#" onclick="setSearchQuery('${school.replace(/'/g, "\\'")}'); return false;" style="color: inherit; text-decoration: underline;">${school}</a> <span style="color: var(--text-secondary); font-size: 0.85em;">(${yearRange})</span>`;
      };

      const firstAffil = formatAffil(sortedAffils[0]);

      if (sortedAffils.length > 1) {
        const restAffils = sortedAffils.slice(1).map(formatAffil).join(', ');
        const uniqueId = prof.name.replace(/[^a-zA-Z0-9]/g, '_');
        affiliationsHtml = `${firstAffil} <span class="show-more-affil" onclick="document.getElementById('more-affil-${uniqueId}').style.display='inline'; this.style.display='none';" style="color: var(--primary-color); cursor: pointer; font-size: 0.9em;">(+${sortedAffils.length - 1} more)</span><span id="more-affil-${uniqueId}" style="display: none;">, ${restAffils}</span>`;
      } else {
        affiliationsHtml = firstAffil;
      }
    } else {
      affiliationsHtml = `<a href="#" onclick="setSearchQuery('${prof.affiliation.replace(/'/g, "\\'")}'); return false;" style="color: inherit; text-decoration: underline;">${prof.affiliation}</a>`;
    }
  } else {
    affiliationsHtml = `<a href="#" onclick="setSearchQuery('${prof.affiliation.replace(/'/g, "\\'")}'); return false;" style="color: inherit; text-decoration: underline;">${prof.affiliation}</a>`;
  }

  return `
      <div class="card-subtitle">
        ${affiliationsHtml}
      </div>
      <div class="card-stats">
        <strong>${prof.totalPapers}</strong> papers (<strong>${prof.totalAdjusted.toFixed(1)}</strong> adjusted)
      </div>

      <div class="card-links">
        ${prof.homepage ? `<a href="${prof.homepage}" target="_blank" class="card-link">Website</a>` : ''}
        ${prof.scholarid ? `<a href="https://scholar.google.com/citations?user=${prof.scholarid}" target="_blank" class="card-link">Google Scholar</a>` : ''}
        <a href="${dblpUrl}" target="_blank" class="card-link">DBLP</a>
      </div>

      ${renderActivityGraph(prof)}

      <div class="stats-list">
        ${sortedAreas.map(([area, stats]) => {
    const areaLabel = areaLabels[area] || area;
    return `
          <div class="stat-item">
            <span class="stat-label" onclick="setSearchQuery('${areaLabel.replace(/'/g, "\\'")}')" style="cursor: pointer; text-decoration: underline; text-decoration-style: dotted;">${areaLabel}</span>
            <span class="stat-count">${Math.ceil(stats.count)} (${stats.adjusted.toFixed(1)})</span>
          </div>
          `;
  }).join('')}
      </div>
  `;
}

function renderActivityGraph(prof) {
  const globalStart = startYear;
  const globalEnd = endYear;

  let firstPubYear = globalEnd;
  let lastPubYear = globalStart;
  prof.pubs.forEach(p => {
    if (p.year >= globalStart && p.year <= globalEnd) {
      if (p.year < firstPubYear) firstPubYear = p.year;
      if (p.year > lastPubYear) lastPubYear = p.year;
    }
  });

  const effectiveStart = Math.max(globalStart, firstPubYear);
  const effectiveEnd = Math.min(globalEnd, lastPubYear);

  if (effectiveStart > effectiveEnd) return '';

  const yearStats = {};
  for (let y = effectiveStart; y <= effectiveEnd; y++) {
    yearStats[y] = { total: 0, areas: {} };
  }

  prof.pubs.forEach(p => {
    if (p.year >= effectiveStart && p.year <= effectiveEnd) {
      if (!yearStats[p.year]) return;
      yearStats[p.year].total += p.count;

      const parentArea = parentMap[p.area] || p.area;
      if (!yearStats[p.year].areas[parentArea]) yearStats[p.year].areas[parentArea] = 0;
      yearStats[p.year].areas[parentArea] += p.count;
    }
  });

  let maxCount = 0;
  Object.values(yearStats).forEach(s => {
    if (s.total > maxCount) maxCount = s.total;
  });

  if (maxCount === 0) return '';

  const yearCount = effectiveEnd - effectiveStart + 1;
  // Use smaller bars if many years
  const barWidth = yearCount > 20 ? 'minmax(12px, 1fr)' : 'minmax(18px, 1fr)';

  return `
    <div class="activity-graph">
      <h4>Activity (${effectiveStart}-${effectiveEnd})</h4>
      <div class="activity-bars" style="grid-template-columns: repeat(${yearCount}, ${barWidth});">
        ${Object.keys(yearStats).sort().map(year => {
    const stats = yearStats[year];
    const height = maxCount > 0 ? (stats.total / maxCount) * 100 : 0;
    const breakdown = Object.entries(stats.areas)
      .sort(([, a], [, b]) => b - a)
      .map(([area, count]) => `${Math.ceil(count)} ${areaLabels[area] || area}`)
      .join(', ');

    const tooltip = `${year}: ${breakdown || 'No papers'}`;

    return `
             <div class="year-column" data-tooltip="${tooltip}">
               <div class="bar" style="height: ${Math.max(height, 2)}%;"></div>
               <div class="year-label">'${year.toString().slice(-2)}</div>
             </div>
           `;
  }).join('')}
      </div>
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

    if (historicalMode && historyMap && aliasMap) {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, historyMap, aliasMap);
    } else {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion);
    }
    console.log(`Filtered: Region=${selectedRegion}, Years=${startYear}-${endYear}, Historical=${historicalMode}`);

    updateURL();

    // Re-run current search or show top rankings
    const query = document.getElementById('main-search').value.toLowerCase();

    if (query.length >= 2) {
      searchProfessors(query);
      searchSchools(query);
      searchAreaPeople(query);
      searchDBLPAuthors(query);
    } else {
      showTopRankings();
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

  // Check for nationality match
  const nationalityMatch = Object.keys(nationalityAliases).find(key =>
    query.toLowerCase().startsWith(key) || key.startsWith(query.toLowerCase())
  );
  const nationalityData = nationalityMatch ? nationalityAliases[nationalityMatch] : null;

  let results;

  if (nationalityData && nationalityData.lastNames && nationalityData.lastNames.length > 0) {
    // Nationality search: filter by last names + nameOriginMap override
    const lastNamesLower = nationalityData.lastNames.map(n => n.toLowerCase());
    const allowedCountries = nationalityData.countries || [];

    results = allProfs
      .filter(p => {
        // 1. Check exact map override first
        if (nameOriginMap[p.name]) {
          // If mapped, it MUST match one of the allowed countries for this nationality
          // e.g. "Tsung-Yi Ho" -> "tw". Searching "viet" (['vn']) -> mismatch -> return false.
          return allowedCountries.includes(nameOriginMap[p.name]);
        }

        // 2. Fallback to last name matching
        const nameParts = p.name.split(/\s+/);
        const lastName = nameParts[nameParts.length - 1].toLowerCase();
        return lastNamesLower.includes(lastName);
      })
      .sort((a, b) => b.totalAdjusted - a.totalAdjusted);
  } else {
    // Standard search
    results = allProfs
      .filter(p => {
        const name = p.name.toLowerCase();
        return tokens.every(token => name.includes(token));
      })
      .sort((a, b) => b.totalAdjusted - a.totalAdjusted);
  }

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

  // Check for nationality match
  const nationalityMatch = Object.keys(nationalityAliases).find(key =>
    query.toLowerCase().startsWith(key) || key.startsWith(query.toLowerCase())
  );
  const nationalityData = nationalityMatch ? nationalityAliases[nationalityMatch] : null;

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

  if (nationalityData && nationalityData.countries && nationalityData.countries.length > 0) {
    const countryCodes = nationalityData.countries;
    header.textContent = `Results for: ${nationalityMatch.charAt(0).toUpperCase() + nationalityMatch.slice(1)}`;
    header.style.display = 'block';

    results = Object.values(appData.schools)
      .filter(school => countryCodes.includes(school.country))
      .sort((a, b) => a.rank - b.rank);

    const container = document.getElementById('school-results');
    container.innerHTML = results
      .slice(0, 20)
      .map(school => renderSchoolCard(school, null))
      .join('');
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
    const allSchools = Object.values(appData.schools).filter(s => s.name); // Filter out null names
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
  const parentArea = parentMap[confKey];
  const areaLabel = areaLabels[parentArea] || parentArea || '';

  return `
    <div class="${cardClass}">
      <div class="card-header" onclick="toggleCard(this)">
        <h2>${confKey.toUpperCase()} ${areaLabel ? `<span style="font-size: 0.7em; font-weight: 400; color: var(--text-secondary);">(<a href="#" onclick="event.stopPropagation(); setSearchQuery('${areaLabel.replace(/'/g, "\\'")}'); return false;" style="color: inherit; text-decoration: underline;">${areaLabel}</a>)</span>` : ''}</h2>
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

function renderSchoolRankGraphPlaceholder(schoolName) {
  if (!historicalMode || !historyMap || !aliasMap) return '';

  const escapedName = schoolName.replace(/'/g, "\\'");
  const uniqueId = schoolName.replace(/[^a-zA-Z0-9]/g, '_');

  return `
    <div class="school-rank-graph" id="rank-graph-${uniqueId}">
      <button class="show-rank-trend-btn" onclick="loadSchoolRankGraph('${escapedName}', '${uniqueId}')">
        Show Rank Trend
      </button>
    </div>
  `;
}

window.loadSchoolRankGraph = async function (schoolName, uniqueId) {
  const container = document.getElementById('rank-graph-' + uniqueId);
  if (!container) return;

  container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.8rem; font-family: var(--font-body);">Loading trend data...</p>';

  await new Promise(resolve => setTimeout(resolve, 50));

  const years = [];
  const ranks = [];
  const windowSize = endYear - startYear;

  for (let y = startYear; y <= endYear; y++) {
    const wStart = Math.max(startYear, y - Math.min(windowSize, 10));
    const wEnd = y;

    try {
      const result = filterByYears({ ...rawData }, wStart, wEnd, selectedRegion, historyMap, aliasMap);
      const school = result.schools[schoolName];
      years.push(y);
      ranks.push(school ? school.rank : null);
    } catch (e) {
      years.push(y);
      ranks.push(null);
    }
  }

  const validRanks = ranks.filter(r => r !== null);
  if (validRanks.length < 2) {
    container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.8rem; font-family: var(--font-body);">Insufficient historical data for trend.</p>';
    return;
  }

  container.innerHTML = `
    <h4 style="font-family: var(--font-heading); font-size: 0.85rem; margin-bottom: 0.5rem; color: var(--text-primary);">Rank Trend (${startYear}-${endYear})</h4>
    <div class="chart-container" style="position: relative; height: 120px; width: 100%;">
      <canvas id="chart-${uniqueId}"></canvas>
    </div>
  `;

  try {
    const { default: Chart } = await import('chart.js/auto');
    const ctx = document.getElementById(`chart-${uniqueId}`).getContext('2d');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'World Rank',
          data: ranks,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleFont: { family: 'Inter', size: 10 },
            bodyFont: { family: 'Inter', size: 11 },
            displayColors: false,
            callbacks: {
              label: (context) => `Rank: #${context.parsed.y}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: 'Inter', size: 9 },
              color: '#666',
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10
            }
          },
          y: {
            reverse: true,
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: {
              font: { family: 'Inter', size: 9 },
              color: '#666',
              stepSize: 1,
              precision: 0,
              callback: (value) => `#${value}`
            },
            suggestedMin: Math.max(1, Math.min(...validRanks) - 1),
            suggestedMax: Math.max(...validRanks) + 1
          }
        }
      }
    });
  } catch (error) {
    console.error('Failed to load Chart.js:', error);
    container.innerHTML = '<p style="color: red; font-size: 0.8rem;">Error loading chart engine.</p>';
  }
};


function renderSchoolCard(school, filterArea = null) {
  let sortedAreas;

  if (filterArea) {
    if (school.areas[filterArea]) {
      sortedAreas = [[filterArea, school.areas[filterArea]]];
    } else {
      sortedAreas = [];
    }
  } else {
    // Sort by area rank (ascending, so #1 first)
    sortedAreas = Object.entries(school.areas)
      .sort(([areaA], [areaB]) => {
        const rankA = school.areaRanks?.[areaA] || 9999;
        const rankB = school.areaRanks?.[areaB] || 9999;
        return rankA - rankB;
      });
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
        ${renderSchoolRankGraphPlaceholder(school.name)}
        <div class="stats-list">
        ${sortedAreas.map(([area, data]) => {
    const areaRank = school.areaRanks?.[area];
    const rankBadge = areaRank ? `<span style="color: var(--text-secondary); font-size: 0.85em; margin-left: 0.5rem;">#${areaRank}</span>` : '';
    return `
          <div class="school-area-section">
            <div class="school-area-header">
              <span onclick="setSearchQuery('${areaLabels[area] ? areaLabels[area].replace(/'/g, "\\'") : area}')" style="cursor: pointer; text-decoration: underline; text-decoration-style: dotted;">${areaLabels[area] || area}${rankBadge}</span>
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
        `}).join('')}
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


function setupTooltips() {
  // Create global tooltip element
  let tooltip = document.getElementById('global-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'global-tooltip';
    document.body.appendChild(tooltip);
  }

  // Use event delegation for dynamic elements
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.year-column');
    if (target) {
      const text = target.getAttribute('data-tooltip');
      if (text) {
        // Replace comma with newline for better readability
        tooltip.textContent = text.replace(': ', ':\n');
        tooltip.style.display = 'block';
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (tooltip.style.display === 'block') {
      // Position slightly offset from cursor
      const x = e.clientX + 15;
      const y = e.clientY + 15;

      // Prevent going off screen
      const rect = tooltip.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 20;
      const maxY = window.innerHeight - rect.height - 20;

      tooltip.style.left = `${Math.min(x, maxX)}px`;
      tooltip.style.top = `${Math.min(y, maxY)}px`;
    }
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('.year-column');
    if (target) {
      tooltip.style.display = 'none';
    }
  });
}

init();
