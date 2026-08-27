import { assignCompetitionRanks, getConferenceAreaMap, getPublicationSchools, publicationMatchesConferenceSet, schoolAliases, conferenceAliases } from './data.js';
import { areaLabels, cleanName, escapeHtml, getConferenceFullLabel, getConferenceLabel } from './shared.js';
import { calculatePerCapita } from './metrics.js';

// Renders the Search page's result sections. The page injects its live state
// and callbacks through `ctx` so these functions stay free of module globals.
let ctx = null;
let profObserver = null;

export function initSearchResults(context) {
  ctx = context;
}

// Any rendered search result leaves the two-column ranking layout behind.
function exitRankingsView() {
  document.body.classList.remove('showing-rankings');
  stopInfiniteLists();
}

// The ranking columns render in chunks and extend themselves as the reader
// scrolls, so neither column is capped at an arbitrary length. Both columns
// grow together, keeping the two lists the same length.
const CHUNK_SIZE = 20;
let infiniteObserver = null;
let infiniteColumns = [];

function stopInfiniteLists() {
  infiniteObserver?.disconnect();
  infiniteObserver = null;
  infiniteColumns = [];
}

function extendInfiniteLists() {
  let grew = false;
  infiniteColumns.forEach(column => {
    const chunk = column.items.slice(column.rendered, column.rendered + CHUNK_SIZE);
    column.container.querySelector('.list-sentinel')?.remove();
    if (!chunk.length) return;
    column.container.insertAdjacentHTML('beforeend',
      chunk.map((item, index) => column.renderItem(item, column.rendered + index + 1)).join(''));
    column.rendered += chunk.length;
    grew = true;
  });
  if (!grew) return;

  // One sentinel is enough: whichever column is longest carries it.
  const longest = infiniteColumns
    .filter(column => column.rendered < column.items.length)
    .sort((a, b) => b.container.scrollHeight - a.container.scrollHeight)[0];
  if (!longest) return;
  const sentinel = document.createElement('div');
  sentinel.className = 'list-sentinel';
  longest.container.appendChild(sentinel);
  infiniteObserver.observe(sentinel);
}

export function renderInfiniteLists(columns) {
  stopInfiniteLists();
  infiniteColumns = columns.map(column => ({ ...column, rendered: 0 }));
  infiniteColumns.forEach(column => { column.container.innerHTML = ''; });
  infiniteObserver = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    infiniteObserver.unobserve(entries[0].target);
    extendInfiniteLists();
  }, { rootMargin: '600px' });
  extendInfiniteLists();
}

// Search renders its columns from separate functions; collecting them for the
// end of the tick lets both grow in step without the callers coordinating.
let queuedColumns = [];

function queueInfiniteList(container, items, renderItem) {
  container.innerHTML = '';
  if (!queuedColumns.length) {
    queueMicrotask(() => {
      const columns = queuedColumns;
      queuedColumns = [];
      if (columns.length) renderInfiniteLists(columns);
    });
  }
  queuedColumns.push({ container, items, renderItem });
}

export function findMatchingConference(query) {
  const normalized = (conferenceAliases[query] || query).toLowerCase();
  // Venues answer to their identifier and to the label the interface shows,
  // so "usenixsec", "USENIX Security" and "IEEE S&P" all resolve.
  return Object.keys(getConferenceAreaMap(ctx.filters.confSet)).find(key =>
    (key.toLowerCase() === normalized || getConferenceLabel(key).toLowerCase() === normalized)
      && publicationMatchesConferenceSet({ area: key }, ctx.filters.confSet)
  ) || null;
}

export function searchAreaPeople(query) {
  exitRankingsView();
  const container = document.getElementById('area-people-results');
  container.innerHTML = '';

  let topProfs = [];
  const title = 'Professors';
  const confKey = findMatchingConference(query);

  if (confKey) {
    topProfs = Object.values(ctx.appData.professors)
      .map(p => {
        const confPubs = p.pubs.filter(pub => pub.area === confKey);
        if (confPubs.length === 0) return null;
        const count = confPubs.reduce((sum, pub) => sum + pub.count, 0);
        const adjusted = confPubs.reduce((sum, pub) => sum + pub.adjustedcount, 0);
        const parentArea = getConferenceAreaMap(ctx.filters.confSet)[confKey];
        return {
          ...p,
          pubs: confPubs,
          areas: { [parentArea]: { count, adjusted } },
          totalCount: count,
          totalPapers: Math.ceil(count),
          totalAdjusted: adjusted,
          resultAdjusted: adjusted
        };
      })
      .filter(p => p && p.resultAdjusted > 0)
      .sort((a, b) => b.resultAdjusted - a.resultAdjusted || cleanName(a.name).localeCompare(cleanName(b.name)));
  } else {
    const areaMatch = Object.entries(areaLabels).find(([key, label]) =>
      label.toLowerCase().includes(query) || key.toLowerCase() === query
    );

    if (areaMatch) {
      const [areaKey] = areaMatch;
      topProfs = Object.values(ctx.appData.professors)
        .map(p => {
          const stats = p.areas[areaKey];
          if (!stats?.adjusted) return null;
          const areaMap = getConferenceAreaMap(ctx.filters.confSet);
          const pubs = p.pubs.filter(pub => areaMap[pub.area] === areaKey);
          return {
            ...p,
            pubs,
            areas: { [areaKey]: stats },
            totalCount: stats.count,
            totalPapers: Math.ceil(stats.count),
            totalAdjusted: stats.adjusted,
            resultAdjusted: stats.adjusted
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.resultAdjusted - a.resultAdjusted || cleanName(a.name).localeCompare(cleanName(b.name)));
    }
  }

  if (topProfs.length === 0) return;
  document.body.classList.add('showing-rankings');
  // Rank within the area or venue being viewed, not overall.
  const scopedRanks = new Map(assignCompetitionRanks(
    topProfs.map(prof => ({ name: prof.name, resultAdjusted: prof.resultAdjusted })),
    entry => entry.resultAdjusted
  ).map(entry => [entry.name, entry.rank]));
  queueInfiniteList(document.getElementById('area-people-results'), topProfs,
    professor => ctx.renderProfessorCard(professor, {
      scopedStats: true,
      compactNames: true,
      rankOverride: scopedRanks.get(professor.name)
    }));
}

export function searchProfessorByAffiliation(name, affiliation) {
  exitRankingsView();
  const input = document.getElementById('main-search');
  input.value = cleanName(name);
  ctx.hideComparison();

  const query = name.toLowerCase();
  const tokens = query.split(/\s+/).filter(t => t.length > 0);

  const results = Object.values(ctx.appData.professors)
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
    .map(prof => ctx.renderProfessorCard(prof))
    .join('');

  document.getElementById('conference-results').innerHTML = '';
  document.getElementById('school-results').innerHTML = '';
  document.getElementById('area-people-results').innerHTML = '';
  document.getElementById('dblp-results').innerHTML = '';
  document.getElementById('search-context-header').style.display = 'none';

  const selectedProfessor = results.find(professor => professor.name === name)
    || (results.length === 1 ? results[0] : null);
  ctx.displayIntegratedAnalysis(selectedProfessor
    ? { type: 'researcher', name: selectedProfessor.name }
    : null);
  ctx.updateURL();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function searchProfessors(query) {
  exitRankingsView();
  if (profObserver) {
    profObserver.disconnect();
    profObserver = null;
  }

  const allProfs = Object.values(ctx.appData.professors);
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  const results = allProfs
    .filter(p => {
      const searchableNames = [p.name, ...(p.aliases || [])].join(' ').toLowerCase();
      return tokens.every(token => searchableNames.includes(token));
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

    const html = chunk.map(professor => ctx.renderProfessorCard(professor)).join('');
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

export function findMatchingArea(query) {
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

export function searchSchools(query) {
  exitRankingsView();
  const effectiveQuery = schoolAliases[query] || query;
  const confKeyMatch = findMatchingConference(query);
  const matchedArea = findMatchingArea(effectiveQuery);

  let results;

  document.getElementById('conference-results').innerHTML = '';
  const header = document.getElementById('search-context-header');

  if (confKeyMatch) {
    header.textContent = getConferenceFullLabel(confKeyMatch);
    header.style.display = 'block';
  } else if (matchedArea) {
    header.textContent = areaLabels[matchedArea];
    header.style.display = 'block';
  } else {
    header.style.display = 'none';
  }

  if (confKeyMatch) {
    const schoolStats = {};

    Object.entries(ctx.appData.professors).forEach(([profName, prof]) => {
      const pubsInConf = prof.pubs.filter(p => p.area === confKeyMatch);
      if (pubsInConf.length === 0) return;

      pubsInConf.forEach(pub => {
        const publicationSchools = getPublicationSchools(
          prof,
          pub,
          ctx.filters.historyMap,
          ctx.filters.aliasMap
        ).filter(schoolName => ctx.appData.schools[schoolName]);

        publicationSchools.forEach(schoolName => {
          if (!schoolStats[schoolName]) {
            schoolStats[schoolName] = { adjusted: 0, count: 0, faculty: [], facultyStats: {} };
          }
          schoolStats[schoolName].adjusted += pub.adjustedcount;
          schoolStats[schoolName].count += pub.count;
          if (!schoolStats[schoolName].faculty.includes(profName)) {
            schoolStats[schoolName].faculty.push(profName);
          }
          const facultyStats = schoolStats[schoolName].facultyStats[profName]
            || (schoolStats[schoolName].facultyStats[profName] = { count: 0, adjusted: 0 });
          facultyStats.count += pub.count;
          facultyStats.adjusted += pub.adjustedcount;
        });
      });
    });

    results = Object.entries(schoolStats)
      .map(([schoolName, stats]) => {
        const school = ctx.appData.schools[schoolName];
        if (!school) return null;

        return {
          ...school,
          areas: {
            [confKeyMatch]: {
              count: stats.count,
              adjusted: stats.adjusted,
              faculty: stats.faculty,
              facultyStats: stats.facultyStats
            }
          },
          totalCount: stats.count,
          totalAdjusted: stats.adjusted
        };
      })
      .filter(s => s)
      .sort((a, b) => b.areas[confKeyMatch].adjusted - a.areas[confKeyMatch].adjusted);

  } else if (matchedArea) {
    // Area Search Mode
    results = Object.values(ctx.appData.schools)
      .filter(school => school.areas[matchedArea] && school.areas[matchedArea].adjusted > 0)
      .sort((a, b) => {
        const countA = a.areas[matchedArea]?.adjusted || 0;
        const countB = b.areas[matchedArea]?.adjusted || 0;
        return countB - countA;
      });
  } else {
    const allSchools = Object.values(ctx.appData.schools).filter(s => s.name); // Filter out null names
    const tokens = effectiveQuery.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const originalTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    results = allSchools
      .filter(s => {
        const name = s.name.toLowerCase();
        return tokens.every(token => name.includes(token)) ||
          originalTokens.every(token => name.includes(token));
      })
      .sort((a, b) => {
        const rankA = Number.isFinite(a.rank) ? a.rank : Infinity;
        const rankB = Number.isFinite(b.rank) ? b.rank : Infinity;
        return rankA - rankB || a.name.localeCompare(b.name);
      });
  }

  const container = document.getElementById('school-results');
  container.classList.toggle('single-result', results.length === 1);
  const filterKey = confKeyMatch || matchedArea;
  // Area views rank by that area; conference views have no stored rank, so the
  // list position stands in — the list is already ordered by that venue.
  queueInfiniteList(container, results, (school, position) => ctx.renderSchoolCard(school, filterKey, {
    rankOverride: filterKey ? (matchedArea ? school.areaRanks?.[matchedArea] ?? position : position) : null,
    compactNames: Boolean(filterKey)
  }));
}




export function clearSearchSections() {
  document.body.classList.remove('showing-rankings');
  document.querySelectorAll('#conference-results, #school-results, #area-people-results, #prof-results, #dblp-results')
    .forEach(container => { container.innerHTML = ''; });
  document.getElementById('prof-results')?.classList.remove('single-result');
  document.getElementById('school-results')?.classList.remove('single-result');
  const header = document.getElementById('search-context-header');
  if (header) header.style.display = 'none';
}

export function showDefaultRankings() {
  ctx.displayIntegratedAnalysis(null);
  ctx.hideComparison();
  // Ranked universities and people sit side by side in this view.
  document.body.classList.add('showing-rankings');
  stopInfiniteLists();
  // Two orderings of the same data: CSRankings' own score, or output per
  // publishing faculty member, which reorders the list substantially.
  const perCapita = Boolean(ctx.filters.perCapita);
  const schools = perCapita
    ? calculatePerCapita(ctx.appData).map(row => ({ ...row.school, perCapitaRank: row.rank, perCapita: row.perCapita }))
    : Object.values(ctx.appData.schools)
      .filter(school => school.name && Number.isFinite(school.rank))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const professors = Object.values(ctx.appData.professors)
    .sort((a, b) => b.totalAdjusted - a.totalAdjusted || a.name.localeCompare(b.name));

  document.getElementById('prof-results').classList.remove('single-result');
  document.getElementById('school-results').classList.remove('single-result');
  // No headings or ordinals here: the two columns and their order say enough.
  renderInfiniteLists([
    { container: document.getElementById('school-results'), items: schools, renderItem: school => ctx.renderSchoolCard(school, null, { compactNames: true, ...(perCapita ? { rankOverride: school.perCapitaRank } : {}) }) },
    { container: document.getElementById('prof-results'), items: professors, renderItem: professor => ctx.renderProfessorCard(professor, { compactNames: true }) }
  ]);
  document.querySelectorAll('#conference-results, #area-people-results, #dblp-results')
    .forEach(container => { container.innerHTML = ''; });
  document.getElementById('search-context-header').style.display = 'none';
}
