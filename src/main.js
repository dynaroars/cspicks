import { loadData, loadAffiliationData, filterByYears, getConferenceAreaMap, getPublicationSchools, normalizeConferenceSet, publicationMatchesConferenceSet, DEFAULT_START_YEAR, DEFAULT_END_YEAR, parentMap, schoolAliases, conferenceAliases } from './data.js';
import { areaLabels, cleanName, encodeInlineValue, escapeHtml, getChartColors, safeExternalUrl, updateChartDefaults } from './shared.js';
import { buildPriorPeriodData, calculateSchoolMetrics } from './metrics.js';
import he from 'he';

import { searchAuthor, fetchAuthorStats } from './dblp.js';

let rawData = null;
let appData = { professors: {}, schools: {} };
let priorAppData = { professors: {}, schools: {} };
let historyMap = null;  // OpenAlex affiliation history
let aliasMap = null;    // School name aliases

let startYear = DEFAULT_START_YEAR;
let endYear = DEFAULT_END_YEAR;
let selectedRegion = 'us';
let historicalMode = false;
let confSet = 'csrankings-default';

let ChartCtor = null;
const activeSchoolCharts = new Map();

async function ensureHistoricalData() {
  if (historyMap !== null && aliasMap !== null) return;
  const data = await loadAffiliationData();
  historyMap = data.historyMap;
  aliasMap = data.aliasMap;
}


const params = new URLSearchParams(window.location.search);
if (params.has('start')) startYear = parseInt(params.get('start'));
if (params.has('end')) endYear = parseInt(params.get('end'));
if (params.has('region')) selectedRegion = params.get('region');
if (params.has('historical')) historicalMode = params.get('historical') === 'true';
if (params.has('confSet')) confSet = normalizeConferenceSet(params.get('confSet'));
async function init() {
  setupFilters();
  setupSearch();
  setupTooltips();
  setupThemeSync();

  try {
    rawData = await loadData();
    if (historicalMode) await ensureHistoricalData();

    // Initialize toggle checkbox
    const historicalToggle = document.getElementById('historical-mode');
    if (historicalToggle) {
      historicalToggle.checked = historicalMode;

      historicalToggle.addEventListener('change', async () => {
        historicalToggle.disabled = true;
        try {
          if (historicalToggle.checked) await ensureHistoricalData();
          historicalMode = historicalToggle.checked;
          refreshData();
          updateURL();
        } catch (error) {
          console.error('Failed to load historical affiliation data:', error);
          historicalToggle.checked = false;
          historicalMode = false;
          window.alert('Historical affiliation data could not be loaded. Please try again.');
        } finally {
          historicalToggle.disabled = false;
        }
      });
    }

    // Conference Set toggle
    const confSetSelect = document.getElementById('conf-set');
    if (confSetSelect) {
      confSetSelect.value = confSet;
      confSetSelect.addEventListener('change', () => {
        confSet = confSetSelect.value;
        refreshData();
        updateURL();
      });
    }

    // Apply filters
    if (historicalMode && historyMap && aliasMap) {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, historyMap, aliasMap, confSet);
    } else {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, null, null, confSet);
    }
    updatePriorData();

    console.log(`Data loaded (${startYear}-${endYear}, region: ${selectedRegion}, historical: ${historicalMode}):`, Object.keys(appData.professors).length, 'professors', Object.keys(appData.schools).length, 'schools');

    const searchInput = document.getElementById('main-search');
    searchInput.placeholder = "Search professors, universities, areas (e.g., graphics), or conferences (e.g., PLDI)";
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

function saveExpandedCards() {
  const expandedCards = new Set();
  document.querySelectorAll('.card:not(.collapsed)').forEach(card => {
    const nameAttr = card.getAttribute('data-name');
    if (nameAttr) {
      expandedCards.add(nameAttr);
    } else {
      const header = card.querySelector('.card-header h2, .card-header h3');
      if (header) {
        const fullText = header.textContent.trim();
        const nameOnly = fullText.split('#')[0].trim();
        expandedCards.add(nameOnly);
      }
    }
  });
  return expandedCards;
}

function restoreExpandedCards(expandedCards) {
  document.querySelectorAll('.card').forEach(card => {
    const nameAttr = card.getAttribute('data-name');
    const header = card.querySelector('.card-header h2, .card-header h3');

    let shouldExpand = false;
    if (nameAttr && expandedCards.has(nameAttr)) {
      shouldExpand = true;
    } else if (header) {
      const fullText = header.textContent.trim();
      const nameOnly = fullText.split('#')[0].trim();
      if (expandedCards.has(nameOnly)) {
        shouldExpand = true;
      }
    }

    if (shouldExpand) {
      card.classList.add('no-transition');
      card.classList.remove('collapsed');
      card.offsetHeight;
      card.classList.remove('no-transition');
    }
  });
}

function updateURL() {
  const params = new URLSearchParams();
  params.set('start', startYear);
  params.set('end', endYear);
  params.set('region', selectedRegion);
  if (historicalMode) params.set('historical', 'true');
  if (confSet !== 'csrankings-default') params.set('confSet', confSet);

  const q = document.getElementById('main-search').value;
  if (q) params.set('q', q);

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

function refreshData() {
  if (!rawData) return;

  const expandedCards = saveExpandedCards();

  appData = filterByYears(rawData, startYear, endYear, selectedRegion, historicalMode ? historyMap : null, historicalMode ? aliasMap : null, confSet);
  updatePriorData();

  console.log(`Refreshed: Region=${selectedRegion}, Years=${startYear}-${endYear}, Historical=${historicalMode}, ConfSet=${confSet}`);

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

  // Restore expanded state immediately
  requestAnimationFrame(() => {
    restoreExpandedCards(expandedCards);
  });
}

function updatePriorData() {
  priorAppData = buildPriorPeriodData(
    rawData,
    startYear,
    endYear,
    selectedRegion,
    historicalMode ? historyMap : null,
    historicalMode ? aliasMap : null,
    confSet
  );
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

  profContainer.classList.remove('single-result');

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
        const count = confPubs.reduce((sum, pub) => sum + pub.count, 0);
        const adjusted = confPubs.reduce((sum, pub) => sum + pub.adjustedcount, 0);
        return { ...p, confCount: count, confAdjusted: adjusted };
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
        .filter(p => p.areas[areaKey]?.adjusted > 0)
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
              <h2>${escapeHtml(cleanName(prof.name))}</h2>
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

    const displayStartYear = startYear;
    const displayEndYear = endYear;

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

      if (hasPapersInSegment && isSignificant && seg.end >= displayStartYear && seg.start <= displayEndYear) {
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
        return `<a href="#" onclick="setSearchQuery(decodeURIComponent('${encodeInlineValue(school)}')); return false;" style="color: inherit; text-decoration: underline;">${escapeHtml(school)}</a> <span style="color: var(--text-secondary); font-size: 0.85em;">(${yearRange})</span>`;
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
      affiliationsHtml = `<a href="#" onclick="setSearchQuery(decodeURIComponent('${encodeInlineValue(prof.affiliation)}')); return false;" style="color: inherit; text-decoration: underline;">${escapeHtml(prof.affiliation)}</a>`;
    }
  } else {
    affiliationsHtml = `<a href="#" onclick="setSearchQuery(decodeURIComponent('${encodeInlineValue(prof.affiliation)}')); return false;" style="color: inherit; text-decoration: underline;">${escapeHtml(prof.affiliation)}</a>`;
  }

  const homepageUrl = safeExternalUrl(prof.homepage);
  const scholarUrl = prof.scholarid
    ? `https://scholar.google.com/citations?user=${encodeURIComponent(prof.scholarid)}`
    : null;

  return `
      <div class="card-subtitle">
        ${affiliationsHtml}
      </div>
      <div class="card-stats">
        <strong>${prof.totalPapers}</strong> papers (<strong>${prof.totalAdjusted.toFixed(1)}</strong> adjusted)
      </div>

      <div class="card-links">
        ${homepageUrl !== '#' ? `<a href="${escapeHtml(homepageUrl)}" target="_blank" rel="noopener noreferrer" class="card-link">Website</a>` : ''}
        ${scholarUrl ? `<a href="${escapeHtml(scholarUrl)}" target="_blank" rel="noopener noreferrer" class="card-link">Google Scholar</a>` : ''}
        <a href="${escapeHtml(dblpUrl)}" target="_blank" rel="noopener noreferrer" class="card-link">DBLP</a>
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
      
      ${(() => {
      if (!prof.pubs || prof.pubs.length === 0) return '';

      const uniqueId = prof.name.replace(/[^a-zA-Z0-9]/g, '_') + '_papers';
      const sortedPubs = [...prof.pubs].sort((a, b) => b.year - a.year);

      const pubsHtml = sortedPubs.map(p => {
        const areaLabel = areaLabels[p.area] || p.area.toUpperCase();
        return `<div class="paper-item"><span class="paper-venue">${areaLabel}</span> <span class="paper-year">${p.year}</span>: ${p.count} paper(s), ${p.adjustedcount.toFixed(2)} adj</div>`;
      }).join('');

      return `
          <button class="papers-toggle" onclick="const list = document.getElementById('${uniqueId}'); list.classList.toggle('visible'); this.textContent = list.classList.contains('visible') ? '▼ Hide Papers' : '▶ Show Papers';">▶ Show Papers</button>
          <div id="${uniqueId}" class="papers-list">
            ${pubsHtml}
          </div>
        `;
    })()}
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
  const activityAreaMap = getConferenceAreaMap(confSet);
  for (let y = effectiveStart; y <= effectiveEnd; y++) {
    yearStats[y] = { total: 0, areas: {} };
  }

  prof.pubs.forEach(p => {
    if (p.year >= effectiveStart && p.year <= effectiveEnd) {
      if (!yearStats[p.year]) return;
      yearStats[p.year].total += p.adjustedcount;

      const parentArea = activityAreaMap[p.area] || p.area;
      if (!yearStats[p.year].areas[parentArea]) yearStats[p.year].areas[parentArea] = 0;
      yearStats[p.year].areas[parentArea] += p.adjustedcount;
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
      .map(([area, count]) => `${count.toFixed(1)} ${areaLabels[area] || area}`)
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
    let results = await searchAuthor(query);
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
        const stats = await fetchAuthorStats(a.pid, startYear, endYear, confSet);
        if (stats?.totalAdjusted > 0) {
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

      const encodedPid = String(a.pid).split('/').map(encodeURIComponent).join('/');
      const dblpUrl = safeExternalUrl(`https://dblp.org/pid/${encodedPid}.html`);

      return `
        <div class="card collapsed" style="margin: 0;">
          <div class="card-header" onclick="toggleCard(this)">
            <div style="display: flex; align-items: baseline; gap: 1rem;">
              <h2>${escapeHtml(a.name)}</h2>
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
               <a href="${escapeHtml(dblpUrl)}" target="_blank" rel="noopener noreferrer" class="card-link">DBLP</a>
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
    const stats = await fetchAuthorStats(pid, startYear, endYear, confSet);
    if (!stats) {
      contentEl.innerHTML = '<p>No data found.</p>';
      return;
    }

    const sortedAreas = Object.entries(stats.areas)
      .sort(([, a], [, b]) => b - a);

    const encodedPid = String(pid).split('/').map(encodeURIComponent).join('/');
    const dblpUrl = safeExternalUrl(`https://dblp.org/pid/${encodedPid}.html`);

    contentEl.innerHTML = `
      <div class="card-subtitle">DBLP Author</div>
      <div class="card-stats">
        <strong>${stats.totalAdjusted.toFixed(1)}</strong> adjusted count
      </div>

      <div class="card-links">
        <a href="${escapeHtml(dblpUrl)}" target="_blank" rel="noopener noreferrer" class="card-link">DBLP</a>
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
  updateURL();

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
  container.classList.toggle('single-result', results.length === 1);
  container.innerHTML = results
    .slice(0, 50)
    .map(prof => renderProfessorCard(prof))
    .join('');

  document.getElementById('conference-results').innerHTML = '';
  document.getElementById('school-results').innerHTML = '';
  document.getElementById('area-people-results').innerHTML = '';
  document.getElementById('dblp-results').innerHTML = '';
  document.getElementById('search-context-header').style.display = 'none';

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
    const expandedCards = saveExpandedCards();

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
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, historyMap, aliasMap, confSet);
    } else {
      appData = filterByYears(rawData, startYear, endYear, selectedRegion, null, null, confSet);
    }
    updatePriorData();
    console.log(`Filtered: Region=${selectedRegion}, Years=${startYear}-${endYear}, Historical=${historicalMode}, ConfSet=${confSet}`);

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

    // Restore expanded state immediately
    requestAnimationFrame(() => {
      restoreExpandedCards(expandedCards);
    });
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
  container.classList.toggle('single-result', results.length === 1);
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



function renderProfessorCard(prof) {
  const searchInput = document.getElementById('main-search');
  const currentQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const isExactMatch = cleanName(prof.name).toLowerCase() === currentQuery;
  const cardClass = isExactMatch ? 'card' : 'card collapsed';
  const displayName = cleanName(prof.name);

  return `
    <div class="${cardClass}" data-name="${escapeHtml(displayName)}">
      <div class="card-header" onclick="toggleCard(this)">
        <h2>${escapeHtml(displayName)}</h2>
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

        // Filter by school region
        if (!appData.schools[schoolName]) return;

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
              <span onclick="setSearchQuery(decodeURIComponent('${encodeInlineValue(school.name)}'))" style="cursor: pointer; text-decoration: underline; text-decoration-style: dotted;">${school.rank}. ${escapeHtml(school.name)}</span>
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
      .map(name => {
        const prof = appData.professors[name];
        const statsText = prof ? ` <small style="color: var(--text-secondary);">${prof.totalPapers} / ${prof.totalAdjusted.toFixed(1)}</small>` : '';
        return `<span class="faculty-tag" onclick="searchProfessorByAffiliation(decodeURIComponent('${encodeInlineValue(cleanName(name))}'), decodeURIComponent('${encodeInlineValue(school.name)}'))" style="cursor: pointer;">${escapeHtml(cleanName(name))}${statsText}</span>`;
      }).join('')}
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

  const uniqueId = schoolName.replace(/[^a-zA-Z0-9]/g, '_');

  return `
    <div class="school-charts-container" id="charts-${uniqueId}">
      <button class="show-rank-trend-btn" onclick="loadSchoolCharts(decodeURIComponent('${encodeInlineValue(schoolName)}'), '${uniqueId}')">
        Show Trends
      </button>
    </div>
  `;
}

function isPublicationAtHistoricalSchool(prof, pub, schoolName) {
  return getPublicationSchools(prof, pub, historyMap, aliasMap).includes(schoolName);
}

window.loadSchoolCharts = async function (schoolName, uniqueId) {
  const container = document.getElementById('charts-' + uniqueId);
  if (!container) return;

  container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.8rem; font-family: var(--font-body);">Loading trend data...</p>';

  await new Promise(resolve => setTimeout(resolve, 50));

  if (!ChartCtor) {
    const { default: Chart } = await import('chart.js/auto');
    ChartCtor = Chart;
    updateChartDefaults(ChartCtor);
  }
  const Chart = ChartCtor;

  activeSchoolCharts.set(uniqueId, { schoolName });

  // Compute all chart data
  const years = [];
  const ranks = [];
  const chartStart = startYear;
  const chartEnd = endYear;
  const windowYears = Math.min(chartEnd - chartStart + 1, 10);

  // Rank Trend data
  for (let y = chartStart; y <= chartEnd; y++) {
      const wStart = Math.max(chartStart, y - (windowYears - 1));
    const wEnd = y;
    try {
      const result = filterByYears({ ...rawData }, wStart, wEnd, selectedRegion, historyMap, aliasMap, confSet);
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
    container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.8rem; font-family: var(--font-body);">Insufficient historical data for trends.</p>';
    return;
  }

  // Area Growth data
  const areaStats = {};
  const areaYears = [];
  for (let y = chartStart; y <= chartEnd; y++) {
    areaYears.push(y);
    areaStats[y] = {};
  }

  const allProfessors = Object.values(rawData.professors);
  const conferenceAreaMap = getConferenceAreaMap(confSet);
  const allPubs = allProfessors.flatMap(prof => prof.pubs.filter(pub =>
    isPublicationAtHistoricalSchool(prof, pub, schoolName) && publicationMatchesConferenceSet(pub, confSet)
  ));

  allPubs.forEach(pub => {
    if (pub.year >= chartStart && pub.year <= chartEnd) {
      const area = conferenceAreaMap[pub.area] || pub.area;
      if (!areaStats[pub.year][area]) areaStats[pub.year][area] = 0;
      areaStats[pub.year][area] += pub.adjustedcount;
    }
  });

  const areaTotals = {};
  Object.values(areaStats).forEach(yearStats => {
    Object.entries(yearStats).forEach(([area, count]) => {
      areaTotals[area] = (areaTotals[area] || 0) + count;
    });
  });

  const topAreas = Object.entries(areaTotals).sort(([, a], [, b]) => b - a).slice(0, 50).map(([area]) => area);
  const areaColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#06b6d4', '#f97316', '#84cc16', '#a855f7', '#ec4899', '#e11d48', '#0f172a'];
  const areaLabelsMap = {
    'ai': 'AI', 'vision': 'Vision', 'mlmining': 'ML', 'nlp': 'NLP', 'inforet': 'IR',
    'arch': 'Arch', 'sec': 'Security', 'mod': 'DB', 'da': 'DA', 'bed': 'Embedded',
    'hpc': 'HPC', 'mobile': 'Mobile', 'metrics': 'Metrics', 'ops': 'Systems',
    'plan': 'PL', 'soft': 'SE', 'comm': 'Networks', 'graph': 'Graphics',
    'act': 'Theory', 'crypt': 'Crypto', 'log': 'Logic', 'bio': 'Bio',
    'ecom': 'Econ', 'chi': 'HCI', 'robotics': 'Robotics', 'visualization': 'Vis', 'csed': 'CSEd'
  };

  const areaDatasets = topAreas.map((area, i) => ({
    label: areaLabelsMap[area] || area,
    data: areaYears.map(y => areaStats[y][area] || 0),
    borderColor: areaColors[i % areaColors.length],
    backgroundColor: areaColors[i % areaColors.length],
    tension: 0.3,
    fill: false,
    pointRadius: 2,
    borderWidth: 2
  }));

  // Faculty Diversity data
  const diversityRates = [];
  const facultyCounts = [];
  const multiAreaCounts = [];
  const diversityWindowSize = 3;

  for (let y = chartStart; y <= chartEnd; y++) {
    const wStart = y - diversityWindowSize + 1;
    const wEnd = y;
    const authorAreas = {};

    allProfessors.forEach(prof => {
      prof.pubs.forEach(pub => {
        if (pub.year >= wStart && pub.year <= wEnd &&
          isPublicationAtHistoricalSchool(prof, pub, schoolName) &&
          publicationMatchesConferenceSet(pub, confSet)) {
          if (!authorAreas[prof.name]) authorAreas[prof.name] = new Set();
          const area = conferenceAreaMap[pub.area] || pub.area;
          authorAreas[prof.name].add(area);
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

  // Render container with 3 charts
  container.innerHTML = `
    <div class="school-charts-grid">
      <div class="school-chart-item">
        <h4>Rank Trend</h4>
        <div class="chart-wrapper"><canvas id="rank-chart-${uniqueId}"></canvas></div>
      </div>
      <div class="school-chart-item">
        <h4>Area Growth</h4>
        <div class="chart-wrapper"><canvas id="area-chart-${uniqueId}"></canvas></div>
        <div class="area-legend" id="area-legend-${uniqueId}"></div>
      </div>
      <div class="school-chart-item">
        <h4>Faculty Diversity</h4>
        <div class="chart-wrapper"><canvas id="diversity-chart-${uniqueId}"></canvas></div>
      </div>
    </div>
  `;

  // Chart 1: Rank Trend
  new Chart(document.getElementById(`rank-chart-${uniqueId}`).getContext('2d'), {
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
      devicePixelRatio: 2,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(0, 0, 0, 0.8)',
          titleFont: { family: 'Inter', size: 10 },
          bodyFont: { family: 'Inter', size: 11 },
          displayColors: false,
          callbacks: { label: (c) => `Rank: #${c.parsed.y}` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter', size: 9 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          }
        },
        y: {
          reverse: true,
          grid: { color: getChartColors().grid },
          ticks: {
            font: { family: 'Inter', size: 9 },
            stepSize: 1,
            precision: 0,
            callback: (v) => `#${v}`
          },
          suggestedMin: Math.max(1, Math.min(...validRanks) - 1),
          suggestedMax: Math.max(...validRanks) + 1
        }
      }
    }
  });

  // Chart 2: Area Growth
  const areaChart = new Chart(document.getElementById(`area-chart-${uniqueId}`).getContext('2d'), {
    type: 'line',
    data: { labels: areaYears, datasets: areaDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: 2,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: false },
          grid: { color: getChartColors().grid }
        },
        x: {
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(0, 0, 0, 0.8)',
          yAlign: 'bottom',
          itemSort: (a, b) => b.raw - a.raw
        }
      }
    }
  });

  // Area legend
  const legendContainer = document.getElementById(`area-legend-${uniqueId}`);
  if (legendContainer) {
    legendContainer.innerHTML = areaDatasets.map((ds, i) => `
      <label class="area-legend-item">
        <input type="checkbox" checked data-index="${i}" style="accent-color: ${ds.borderColor};">
        <span class="legend-color" style="background: ${ds.borderColor};"></span>
        <span>${ds.label}</span>
      </label>
    `).join('');

    legendContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        areaChart.setDatasetVisibility(index, e.target.checked);
        areaChart.update();
      });
    });
  }

  // Chart 3: Faculty Diversity
  new Chart(document.getElementById(`diversity-chart-${uniqueId}`).getContext('2d'), {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        {
          label: '% Multi-Area',
          data: diversityRates,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          yAxisID: 'y'
        },
        {
          label: 'Faculty Count',
          data: facultyCounts,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          tension: 0.3,
          fill: false,
          pointRadius: 2,
          borderDash: [5, 5],
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: 2,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          suggestedMax: 60,
          title: { display: false },
          grid: { color: getChartColors().grid },
          ticks: {
            color: getChartColors().text,
            font: { family: 'Inter', size: 9 }
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false, color: getChartColors().grid },
          title: { display: false },
          ticks: {
            color: getChartColors().text,
            font: { family: 'Inter', size: 9 }
          }
        },
        x: {
          grid: { display: false, color: getChartColors().grid },
          ticks: {
            color: getChartColors().text,
            font: { family: 'Inter', size: 9 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          }
        }
      },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 8, font: { size: 10 } } },
        tooltip: {
          backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(0, 0, 0, 0.8)',
          titleFont: { family: 'Inter', size: 10 },
          bodyFont: { family: 'Inter', size: 11 },
          callbacks: {
            afterBody: (context) => {
              const idx = context[0].dataIndex;
              return `${multiAreaCounts[idx]} of ${facultyCounts[idx]} multi-area`;
            }
          }
        }
      }
    }
  });
};


function renderRankContribution(school) {
  const topLevelAreas = [...new Set(Object.values(parentMap))];
  const contributions = [];

  topLevelAreas.forEach(area => {
    const val = school.areaAdjustedCounts?.[area] || 0;
    if (val > 0) {
      contributions.push({
        area,
        val,
        logVal: Math.log(val + 1)
      });
    }
  });

  const totalLogVal = contributions.reduce((sum, item) => sum + item.logVal, 0);

  if (totalLogVal === 0) {
    return '';
  }

  // Calculate percentage contributions
  contributions.forEach(item => {
    item.percentage = (item.logVal / totalLogVal) * 100;
  });

  // Sort by percentage contribution descending
  contributions.sort((a, b) => b.percentage - a.percentage);

  // Group top 5 and "Other"
  const topCount = 5;
  const topContributions = contributions.slice(0, topCount);
  const otherContributions = contributions.slice(topCount);

  let otherSumVal = 0;
  let otherSumPercentage = 0;

  otherContributions.forEach(item => {
    otherSumVal += item.val;
    otherSumPercentage += item.percentage;
  });

  const displayList = [...topContributions];
  if (otherSumPercentage > 0) {
    displayList.push({
      area: 'other',
      val: otherSumVal,
      percentage: otherSumPercentage,
      isOther: true
    });
  }

  const itemsHtml = displayList.map(item => {
    const label = item.isOther ? 'Other Subfields' : (areaLabels[item.area] || item.area);
    const formattedVal = item.val.toFixed(1);
    const color = item.isOther ? 'var(--accent-color)' : 'var(--primary-color)';
    return `
      <div class="contribution-item">
        <div class="contribution-info">
          <span class="contribution-label">${label}</span>
          <span class="contribution-value">${formattedVal} adj (${item.percentage.toFixed(1)}%)</span>
        </div>
        <div class="contribution-bar-container">
          <div class="contribution-bar" style="width: ${item.percentage}%; background-color: ${color};"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="school-rank-attribution">
      <div class="attribution-details">
        <div class="attribution-summary">
          <span>Subfield Contributions</span>
          <span class="tooltip-trigger contribution-tooltip" tabindex="0" aria-label="About subfield contributions">
            ⓘ
            <span class="tooltip-content">
              Attribution is calculated logarithmically using ln(val + 1) because the overall rank score uses a geometric mean of all subfields.
            </span>
          </span>
        </div>
        <div class="attribution-content">
          ${itemsHtml}
        </div>
      </div>
    </div>
  `;
}

function renderSchoolCard(school, filterArea = null) {
  const safeSchoolName = escapeHtml(school.name);
  const encodedSchoolName = encodeInlineValue(school.name);
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

  // Calculate faculty count
  const facultySet = new Set();
  Object.values(school.areas).forEach(areaData => {
    areaData.faculty.forEach(f => facultySet.add(f));
  });
  const facultyCount = facultySet.size;

  // Calculate area count 
  const areaCount = Object.values(school.areas).filter(a => a.adjusted > 0).length;

  const rankPrefix = Number.isFinite(school.rank) ? `${school.rank}. ` : '';
  const facultyBadge = `<span style="color: var(--text-secondary); font-size: 0.75em; margin-left: 0.5rem;">${facultyCount} Faculty</span>`;
  const areaBadge = `<span style="color: var(--text-secondary); font-size: 0.75em; margin-left: 0.5rem;">${areaCount} Areas</span>`;
  const metrics = calculateSchoolMetrics(appData, priorAppData, school.name);
  const metricsHtml = metrics ? renderSchoolMetrics(metrics) : '';

  return `
    <div class="${cardClass}" data-name="${safeSchoolName}">
      <div class="card-header" onclick="toggleCard(this)">
        <h2>${rankPrefix}${safeSchoolName}${facultyBadge}${areaBadge}</h2>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="card-content">
        ${metricsHtml}
        ${renderSchoolRankGraphPlaceholder(school.name)}
        ${renderRankContribution(school)}
        <div class="stats-list">
        ${sortedAreas.map(([area, data]) => {
    const areaRank = school.areaRanks?.[area];
    const areaRankPrefix = areaRank ? `${areaRank}. ` : '';
    return `
          <div class="school-area-section">
            <div class="school-area-header">
              <span onclick="setSearchQuery('${areaLabels[area] ? areaLabels[area].replace(/'/g, "\\'") : area}')" style="cursor: pointer; text-decoration: underline; text-decoration-style: dotted;">${areaRankPrefix}${areaLabels[area] || area}</span>
              <span>${Math.ceil(data.count)} (${data.adjusted.toFixed(1)})</span>
            </div>
            <div class="faculty-list">
              ${data.faculty
        .sort((a, b) => {
          const countA = appData.professors[a]?.areas[area]?.adjusted || 0;
          const countB = appData.professors[b]?.areas[area]?.adjusted || 0;
          return countB - countA;
        })
        .map(name => {
          const prof = appData.professors[name];
          const statsText = prof ? ` <small style="color: var(--text-secondary);">${prof.totalPapers} / ${prof.totalAdjusted.toFixed(1)}</small>` : '';
          return `<span class="faculty-tag" onclick="searchProfessorByAffiliation(decodeURIComponent('${encodeInlineValue(cleanName(name))}'), decodeURIComponent('${encodedSchoolName}'))" style="cursor: pointer;">${escapeHtml(cleanName(name))}${statsText}</span>`;
        }).join('')}
            </div>
          </div>
        `}).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderSchoolMetrics(metrics) {
  const rankMovement = metrics.rankDelta === null
    ? '—'
    : metrics.rankDelta === 0 ? 'No change' : `${metrics.rankDelta > 0 ? '▲' : '▼'} ${Math.abs(metrics.rankDelta)}`;
  const growth = `${metrics.growth >= 0 ? '+' : ''}${metrics.growth.toFixed(0)}%`;
  const confidenceClass = metrics.confidence.toLowerCase();
  const metricLabel = (label, explanation) => `
    <span class="metric-label-row">
      <span class="metric-label">${escapeHtml(label)}</span>
      <span class="tooltip-trigger metric-info" tabindex="0" aria-label="About ${escapeHtml(label)}">ⓘ
        <span class="tooltip-content">${escapeHtml(explanation)}</span>
      </span>
    </span>
  `;
  return `
    <div class="school-metrics" aria-label="University statistics">
      <div class="school-metric">${metricLabel('Rank movement', 'Change in rank versus the immediately preceding period of the same length. An upward arrow means the university improved.')}<strong>${rankMovement}</strong></div>
      <div class="school-metric">${metricLabel('Momentum', 'Percentage change in fractional publication credit versus the preceding period of the same length.')}<strong>${growth}</strong></div>
      <div class="school-metric">${metricLabel('Median / faculty', 'Median fractional publication credit among the university’s active faculty in the selected period.')}<strong>${metrics.medianPerFaculty.toFixed(1)}</strong></div>
      <div class="school-metric">${metricLabel('Top-3 concentration', `Share of the university’s fractional credit produced by its three highest-output faculty. Top one: ${metrics.top1Share.toFixed(0)}%; top five: ${metrics.top5Share.toFixed(0)}%.`)}<strong>${metrics.top3Share.toFixed(0)}%</strong></div>
      <div class="school-metric">${metricLabel('Breadth', `Active is the number of areas with output. Sustained means active in both this and the preceding period. ${metrics.topTenAreas} areas currently rank in the top 10.`)}<strong>${metrics.activeAreas} active · ${metrics.sustainedAreas} sustained</strong></div>
      <div class="school-metric">${metricLabel('Team-size proxy', 'Raw publication count divided by fractional credit. This estimates coauthor intensity; it is not a cross-university collaboration count.')}<strong>${metrics.impliedTeamSize.toFixed(1)}×</strong></div>
      <div class="school-metric">${metricLabel('Data confidence', `Completeness of author homepage and Google Scholar profile fields. Current profile-field coverage: ${metrics.profileCoverage.toFixed(0)}%.`)}<strong class="confidence-${confidenceClass}">${metrics.confidence}</strong></div>
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

function setupThemeSync() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'data-theme' && ChartCtor) {
        updateChartDefaults(ChartCtor);
        activeSchoolCharts.forEach((data, uniqueId) => {
          loadSchoolCharts(data.schoolName, uniqueId);
        });
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });
}

init();
