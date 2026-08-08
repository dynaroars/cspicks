import { loadData, filterByYears, getConferenceAreaMap, publicationMatchesConferenceSet, DEFAULT_START_YEAR, DEFAULT_END_YEAR } from './data.js';
import { areaLabels, cleanName, escapeHtml } from './shared.js';
import { searchAuthor, fetchAuthorStats } from './dblp.js';
import { calculateRankImpact, fuzzyMatch, parseCandidateNames } from './simulation.js';
import { syncCsrankingsRules } from './csrankings-rules.js';

let rawData = null;
let appData = { professors: {}, schools: {} };
let startYear = DEFAULT_START_YEAR;
let endYear = DEFAULT_END_YEAR;
let selectedRegion = 'us';
let confSet = 'csrankings-default';

let simFacultyArr = [];
let facultyFilter = '';
let dblpFacultyResults = [];
let dblpFacultyLoading = false;
let dblpSearchTimer = null;
let dblpSearchSequence = 0;
const selectedDblpProfiles = new Map();

function resetFacultySearch() {
  clearTimeout(dblpSearchTimer);
  dblpSearchSequence++;
  facultyFilter = '';
  dblpFacultyResults = [];
  dblpFacultyLoading = false;
}

function populateFacultyList(school) {
  const facultySet = new Set();
  Object.values(school.areas).forEach(a => a.faculty.forEach(f => facultySet.add(f)));
  simFacultyArr = Array.from(facultySet).sort((a, b) => {
    const profA = appData.professors[a];
    const profB = appData.professors[b];
    return (profB?.totalAdjusted || 0) - (profA?.totalAdjusted || 0);
  });

  resetFacultySearch();
  selectedDblpProfiles.clear();
  renderFacultyList();
}

function addCandidate(name, dblpProfile = null) {
  const candidatesInput = document.getElementById('sim-candidates-input');
  const names = parseCandidateNames(candidatesInput.value);
  if (dblpProfile) selectedDblpProfiles.set(name.toLowerCase(), dblpProfile);
  if (!names.some(candidate => candidate.toLowerCase() === name.toLowerCase())) {
    names.push(name);
    candidatesInput.value = names.join('\n');
  }
}

function renderFacultyList(filter = facultyFilter) {
  const listEl = document.getElementById('sim-faculty-list');
  const candidatesInput = document.getElementById('sim-candidates-input');
  if (!listEl || !candidatesInput) return;

  const filtered = filter
    ? simFacultyArr.filter(f => cleanName(f).toLowerCase().includes(filter.toLowerCase()))
    : simFacultyArr;

  const currentNames = candidatesInput.value.split('\n').map(n => n.trim()).filter(n => n);

  const localHtml = filtered.map(f => {
    const name = cleanName(f);
    const checked = currentNames.some(n => n.toLowerCase() === name.toLowerCase());
    const prof = appData.professors[f];
    const areas = prof ? Object.keys(prof.areas).length : 0;
    const papers = prof ? prof.totalPapers : 0;
    const adj = prof ? prof.totalAdjusted.toFixed(1) : '0';
    return `
      <label style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; border-bottom: 1px solid var(--border-color); font-size: 0.88em;"
             data-name="${escapeHtml(name)}">
        <input type="checkbox" ${checked ? 'checked' : ''} style="width: 15px; height: 15px; cursor: pointer;">
        <span style="flex: 1; color: var(--text-primary);">${escapeHtml(name)}</span>
        <small style="color: var(--text-secondary);">${areas} areas, ${papers} papers, ${adj} adj</small>
      </label>
    `;
  }).join('');

  let dblpHtml = '';
  if (filter.trim().length >= 2) {
    const resultHtml = dblpFacultyResults.map((result, index) => {
      const selectedProfile = selectedDblpProfiles.get(result.name.toLowerCase());
      const added = selectedProfile?.pid === result.pid;
      return `
        <button type="button" class="sim-dblp-result" data-index="${index}" ${added ? 'disabled' : ''}>
          <span>${escapeHtml(result.name)}</span>
          <small>${added ? 'Selected' : '+ Use this DBLP profile'}</small>
        </button>
      `;
    }).join('');

    const status = dblpFacultyLoading
      ? '<div class="sim-search-status">Searching DBLP…</div>'
      : (resultHtml || '<div class="sim-search-status">No DBLP matches</div>');
    dblpHtml = `<div class="sim-list-heading">DBLP authors</div>${status}${resultHtml}`;
  }

  const localHeading = filter
    ? `<div class="sim-list-heading">Current faculty (${filtered.length})</div>`
    : '';
  listEl.innerHTML = `${localHeading}${localHtml}${dblpHtml}`;

  listEl.querySelectorAll('label').forEach(label => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      const name = label.dataset.name;
      const lines = candidatesInput.value.split('\n').map(n => n.trim()).filter(n => n);
      if (checkbox.checked) {
        addCandidate(name);
      } else {
        const idx = lines.findIndex(n => n.toLowerCase() === name.toLowerCase());
        if (idx >= 0) lines.splice(idx, 1);
        selectedDblpProfiles.delete(name.toLowerCase());
        candidatesInput.value = lines.join('\n');
      }
    });
  });

  listEl.querySelectorAll('.sim-dblp-result').forEach(button => {
    button.addEventListener('click', () => {
      const profile = dblpFacultyResults[Number(button.dataset.index)];
      addCandidate(profile.name, profile);
      renderFacultyList();
    });
  });
}

function searchFaculty(filter) {
  facultyFilter = filter.trim();
  dblpFacultyResults = [];
  dblpFacultyLoading = facultyFilter.length >= 2;
  const sequence = ++dblpSearchSequence;
  clearTimeout(dblpSearchTimer);
  renderFacultyList();

  if (facultyFilter.length < 2) return;
  dblpSearchTimer = setTimeout(async () => {
    const results = await searchAuthor(facultyFilter);
    if (sequence !== dblpSearchSequence) return;
    dblpFacultyResults = results.slice(0, 10);
    dblpFacultyLoading = false;
    renderFacultyList();
  }, 350);
}

function renderCandidateResults(candidates) {
  const medals = ['🥇', '🥈', '🥉'];

  return candidates.map((c, i) => {
    if (c.error) {
      return `
        <div class="candidate-card">
          <div class="candidate-header">
            <span class="candidate-medal">❌</span>
            <div class="candidate-info">
              <div class="candidate-name">${escapeHtml(c.name)}</div>
              <div class="candidate-stats" style="color: #ef4444;">${escapeHtml(c.error)}</div>
            </div>
          </div>
        </div>
      `;
    }

    const medal = i < 3 ? medals[i] : `#${i + 1}`;
    const deltaClass = c.rankDelta > 0 ? 'positive' : (c.rankDelta < 0 ? 'negative' : 'neutral');
    const deltaText = c.rankDelta > 0 ? `+${c.rankDelta}` : (c.rankDelta < 0 ? `${c.rankDelta}` : '±0');

    let actionLabel = '';
    if (c.isRemoval) {
      actionLabel = `<span style="font-size: 0.8em; color: #ef4444; background: #fee2e2; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">Removing</span>`;
    } else if (c.sourceSchool) {
      actionLabel = `<span style="font-size: 0.8em; color: #3b82f6; background: #dbeafe; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">from ${escapeHtml(c.sourceSchool.name)}</span>`;
    }

    let dataSourceBadge = '';
    if (c.usedCSRankings) {
      dataSourceBadge = `<span style="font-size: 0.7em; color: #059669; background: #d1fae5; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">CSRankings</span>`;
    }

    let sourceImpactHtml = '';
    if (c.sourceSchool) {
      const sDelta = c.sourceSchool.delta;
      const sClass = sDelta > 0 ? 'positive' : (sDelta < 0 ? 'negative' : 'neutral');
      const sText = sDelta > 0 ? `+${sDelta}` : (sDelta < 0 ? `${sDelta}` : '±0');
      sourceImpactHtml = `
          <div style="font-size: 0.85rem; margin-top: 4px; color: #666; display: flex; align-items: center; justify-content: flex-end;">
             <span style="margin-right: 6px;">${escapeHtml(c.sourceSchool.name)}:</span>
             <span class="${sClass}" style="font-weight: 600;">${sText} ranks</span>
          </div>
      `;
    }

    const papersHtml = c.stats.papers.slice(0, 20).map(p => {
      const countLabel = p.count > 1 ? `${Math.round(p.count)} papers` : '1 paper';
      return `
      <div class="paper-item">
        <span class="paper-venue">${escapeHtml(p.venue)}</span>
        <span class="paper-year">${p.year}</span>:
        ${countLabel} <small>(~${p.authors} authors, ${p.adjusted.toFixed(2)} adj)</small>
      </div>
    `;
    }).join('');

    const countedPaperLabel = `${c.stats.totalPapers} rank-counted ${c.stats.totalPapers === 1 ? 'paper' : 'papers'}`;
    const paperSummary = Number.isFinite(c.stats.totalDblpPublications)
      ? `${countedPaperLabel} of ${c.stats.totalDblpPublications} DBLP publications in the selected years`
      : `${c.stats.totalPapers} ${c.stats.totalPapers === 1 ? 'paper' : 'papers'}`;

    // Show all areas the candidate publishes in, with rank delta for each
    const allAreas = Object.keys(c.stats.areas);
    const areaDeltaEntries = allAreas
      .map(area => {
        let d = (c.areaDeltas || {})[area];
        if (d === undefined) d = { delta: 0 };
        return [area, d];
      })
      .sort(([, a], [, b]) => {
        const getVal = (x) => {
          if (typeof x === 'number') return Math.abs(x);
          if (x && (x.dropped || x.entered)) return 1000;
          if (x && x.delta !== undefined) return Math.abs(x.delta);
          return 0;
        };
        return getVal(b) - getVal(a);
      });

    const areaPillsHtml = areaDeltaEntries.length > 0 ? `
      <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px;">
        ${areaDeltaEntries.map(([area, d]) => {
      const label = escapeHtml(areaLabels[area] || area);
      if (d && d.dropped) {
        return `<span class="area-pill negative">↓ ${label} (Unranked - was #${d.wasRank})</span>`;
      }
      if (d && d.entered) {
        return `<span class="area-pill positive">↑ ${label} +New (→ #${d.nowRank})</span>`;
      }

      const deltaVal = d && d.delta !== undefined ? d.delta : (typeof d === 'number' ? d : 0);
      const nowRank = d && d.nowRank !== undefined ? d.nowRank : null;

      if (deltaVal === 0) {
        return `<span class="area-pill neutral">${label} ±0${nowRank ? ` (#${nowRank})` : ''}</span>`;
      }
      const arrow = deltaVal > 0 ? '↑' : '↓';
      const sign = deltaVal > 0 ? '+' : '';
      const cls = deltaVal > 0 ? 'positive' : 'negative';
      return `<span class="area-pill ${cls}">${arrow} ${label} ${sign}${deltaVal} (→ #${nowRank})</span>`;
    }).join('')}
      </div>
    ` : '';


    return `
      <div class="candidate-card">
        <div class="candidate-header">
          <span class="candidate-medal">${medal}</span>
          <div class="candidate-info">
            <div class="candidate-name">
              ${escapeHtml(c.name)}
              ${actionLabel}
              ${dataSourceBadge}
            </div>
            <div class="candidate-stats">${Object.keys(c.stats.areas).length} areas, ${paperSummary}, ${c.stats.totalAdjusted.toFixed(1)} adjusted</div>
            <div class="candidate-area-breakdown">
              ${Object.entries(c.stats.areas)
        .sort(([, a], [, b]) => (b.count || b) - (a.count || a))
        .map(([area, areaStats]) => {
          const count = typeof areaStats === 'number' ? Math.ceil(areaStats) : (areaStats.count || 0);
          const adj = typeof areaStats === 'number' ? areaStats : (areaStats.adjusted || 0);
          const label = escapeHtml(areaLabels[area] || area);
          return `<span class="area-breakdown-tag">${label} <strong>(${count} ${count === 1 ? 'paper' : 'papers'})</strong></span>`;
        }).join('')}
            </div>
            ${areaPillsHtml}
          </div>
          <div class="candidate-impact">
            <div class="candidate-rank-delta ${deltaClass}">#${c.currentRank} → #${c.currentRank - c.rankDelta} (${deltaText})</div>
            ${sourceImpactHtml}
          </div>
        </div>
        <button class="papers-toggle">▶ Show Papers</button>
        <div class="papers-list">
          ${papersHtml || '<div class="paper-item">No counted papers</div>'}
        </div>
      </div>
    `;

  }).join('');
}

async function performCandidatesAnalysis(selectedUniv, uniqueNames) {
  const candidateResults = [];

  const confMap = getConferenceAreaMap(confSet);

  for (const name of uniqueNames) {
    try {
      const selectedDblpProfile = selectedDblpProfiles.get(name.toLowerCase());
      let profData = null;
      if (!selectedDblpProfile && appData.professors[name]) {
        profData = appData.professors[name];
      } else if (!selectedDblpProfile) {
        const targetFacultyNames = new Set();
        Object.values(selectedUniv.areas).forEach(a => a.faculty.forEach(f => targetFacultyNames.add(f)));
        for (const fName of targetFacultyNames) {
          if (fuzzyMatch(fName, name)) {
            profData = appData.professors[fName];
            break;
          }
        }
        if (!profData) {
          for (const pName of Object.keys(appData.professors)) {
            if (!pName.toLowerCase().includes(name.split(' ').pop().toLowerCase()) &&
              Math.abs(pName.length - name.length) > 3) continue;

            if (fuzzyMatch(pName, name)) {
              profData = appData.professors[pName];
              break;
            }
          }
        }
      }

      let stats;
      let displayName = name;
      let usedCSRankings = false;

      if (profData && profData.pubs && profData.pubs.length > 0) {
        // Use CSRankings data for existing professors
        displayName = profData.name;

        // Filter pubs by year range AND conference set
        const yearFiltered = profData.pubs.filter(p => p.year >= startYear && p.year <= endYear);

        const confFilteredPubs = yearFiltered.filter(p => publicationMatchesConferenceSet(p, confSet));

        console.log('CSRankings match for:', name, '→', profData.name, 'pubs:', profData.pubs.length, 'filtered:', confFilteredPubs.length);

        if (confFilteredPubs.length === 0) {
          // No papers in this year range/conf set - show as such
          candidateResults.push({ name: displayName, error: `No publication records found in ${startYear}–${endYear} for the active conference set` });
          continue;
        }

        usedCSRankings = true;

        stats = {
          totalAdjusted: 0,
          totalPapers: 0,
          areas: {},
          papers: []
        };

        confFilteredPubs.forEach(pub => {
          const area = confMap[pub.area] || pub.area;

          stats.totalAdjusted += pub.adjustedcount;
          stats.totalPapers += pub.count;

          if (!stats.areas[area]) {
            stats.areas[area] = { count: 0, adjusted: 0 };
          }
          stats.areas[area].count += pub.count;
          stats.areas[area].adjusted += pub.adjustedcount;

          stats.papers.push({
            title: `${area.toUpperCase()} publication`,
            venue: pub.area.toUpperCase(),
            year: pub.year,
            count: pub.count,
            authors: Math.round(1 / pub.adjustedcount),
            adjusted: pub.adjustedcount,
            area: area
          });
        });

        stats.papers.sort((a, b) => b.year - a.year);
      } else {
        // External candidate - query DBLP

        let searchName = name;
        let dblpSuffix = null;
        const suffixMatch = name.match(/^(.+?)\s+(\d{4})$/);
        if (suffixMatch) {
          searchName = suffixMatch[1];
          dblpSuffix = suffixMatch[2];
        }

        let best = selectedDblpProfile;
        if (!best) {
          const searchResults = await searchAuthor(searchName);
          if (dblpSuffix) {
            const numSuffix = parseInt(dblpSuffix, 10);
            best = searchResults.find(r => {
              if (numSuffix === 0) {
                return !r.pid.includes('-');
              }
              return r.pid.endsWith(`-${numSuffix}`);
            });
            if (!best) {
              best = searchResults.find(r =>
                r.name.includes(dblpSuffix) || r.name.endsWith(dblpSuffix)
              );
            }
            if (!best) best = searchResults[0];
          } else {
            best = searchResults[0];
          }
        }

        if (!best) {
          candidateResults.push({ name, error: 'No matching profile found in the CSRankings database or DBLP search' });
          continue;
        }

        displayName = best.name;

        stats = await fetchAuthorStats(best.pid, startYear, endYear, confSet);
        if (!stats) {
          candidateResults.push({ name, error: 'We couldn\'t retrieve publication records from DBLP. Please verify the profile is accessible.' });
          continue;
        }
      }

      let sourceSchool = null;
      let isRemovalMode = false;

      // Get all name variants to check (includes DBLP aliases)
      const namesToCheck = [displayName];
      if (stats.aliases && stats.aliases.length > 0) {
        stats.aliases.forEach(alias => {
          if (!namesToCheck.includes(alias)) namesToCheck.push(alias);
        });
      }

      const targetFaculty = new Set();
      Object.values(selectedUniv.areas).forEach(a => a.faculty.forEach(f => targetFaculty.add(f)));

      // Check if any alias matches target school faculty
      outerRemoval:
      for (const nameVariant of namesToCheck) {
        for (const f of targetFaculty) {
          if (fuzzyMatch(f, nameVariant)) {
            isRemovalMode = true;
            break outerRemoval;
          }
        }
      }

      // Check if any alias matches another school's faculty (transfer mode)
      if (!isRemovalMode) {
        outerSource:
        for (const s of Object.values(appData.schools)) {
          if (s.name === selectedUniv.name) continue;
          const sFaculty = new Set();
          Object.values(s.areas).forEach(a => a.faculty.forEach(f => sFaculty.add(f)));

          for (const nameVariant of namesToCheck) {
            for (const f of sFaculty) {
              if (fuzzyMatch(f, nameVariant)) {
                sourceSchool = s;
                break outerSource;
              }
            }
          }
        }
      }

      const ops = [];
      if (isRemovalMode) {
        ops.push({ school: selectedUniv, stats, isRemoval: true });
      } else {
        ops.push({ school: selectedUniv, stats, isRemoval: false });
      }

      if (sourceSchool && !isRemovalMode) {
        ops.push({ school: sourceSchool, stats, isRemoval: true });
      }
      const impactMap = calculateRankImpact(appData.schools, ops);
      const targetImpact = impactMap.get(selectedUniv.name) || { overall: 0, areas: {} };
      const rankDelta = targetImpact.overall;
      const areaDeltas = targetImpact.areas;
      const sourceImpactEntry = sourceSchool ? impactMap.get(sourceSchool.name) : null;
      const sourceImpact = sourceImpactEntry ? sourceImpactEntry.overall : null;

      candidateResults.push({
        name: displayName,
        stats,
        rankDelta,
        currentRank: selectedUniv.rank,
        areaDeltas,
        isRemoval: isRemovalMode,
        usedCSRankings: usedCSRankings,
        sourceSchool: sourceSchool ? { name: sourceSchool.name, delta: sourceImpact } : null,
        error: null
      });
    } catch (err) {
      console.error('Simulator error for:', name, err);
      console.error('Stack:', err.stack);
      candidateResults.push({ name, error: `An unexpected error occurred while retrieving data: ${err.message}. Please try again.` });
    }
  }

  candidateResults.sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    // Sort by impact descending
    return Math.abs(b.rankDelta || 0) - Math.abs(a.rankDelta || 0);
  });

  return candidateResults;
}


function resetSimulation() {
  resetFacultySearch();
  selectedDblpProfiles.clear();
  selectedUniv = null;
  document.getElementById('step-univ-first').classList.remove('hidden');
  document.getElementById('step-candidates').classList.add('hidden');
  document.getElementById('step-results').classList.add('hidden');
  document.getElementById('sim-univ-search').value = '';
  document.getElementById('sim-candidates-input').value = '';
  document.getElementById('sim-univ-results').innerHTML = '';
  document.getElementById('sim-candidates-results').innerHTML = '';
  document.getElementById('sim-faculty-list').innerHTML = '';
  document.getElementById('sim-faculty-search').value = '';
}

function resetCandidates() {
  if (!selectedUniv) return;
  document.getElementById('step-results').classList.add('hidden');
  document.getElementById('step-candidates').classList.remove('hidden');
  document.getElementById('sim-candidates-input').value = '';
  selectedDblpProfiles.clear();
  document.getElementById('sim-candidates-results').innerHTML = '';
  document.getElementById('sim-faculty-search').value = '';
  populateFacultyList(selectedUniv);
  document.getElementById('sim-faculty-search').focus();
}

let selectedUniv = null;

function setupSimulator() {
  const univSearch = document.getElementById('sim-univ-search');
  const candidatesInput = document.getElementById('sim-candidates-input');
  const analyzeBtn = document.getElementById('sim-analyze-btn');

  document.getElementById('sim-reset-btn').addEventListener('click', resetSimulation);
  document.getElementById('sim-change-candidates-btn').addEventListener('click', resetCandidates);
  document.getElementById('sim-faculty-search').addEventListener('input', event => searchFaculty(event.target.value));

  document.getElementById('sim-select-all').addEventListener('click', () => {
    document.querySelectorAll('#sim-faculty-list input[type="checkbox"]:not(:checked)').forEach(checkbox => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
    });
  });

  document.getElementById('sim-deselect-all').addEventListener('click', () => {
    document.querySelectorAll('#sim-faculty-list input[type="checkbox"]:checked').forEach(checkbox => {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
    });
  });

  univSearch.addEventListener('input', event => {
    const query = event.target.value.trim().toLowerCase();
    const container = document.getElementById('sim-univ-results');
    if (!query) {
      container.innerHTML = '';
      return;
    }

    const results = Object.values(appData.schools)
      .filter(school => school.name.toLowerCase().includes(query))
      .slice(0, 10);

    container.innerHTML = results.map(school => `
      <button type="button" class="sim-item" data-name="${escapeHtml(school.name)}">
        <strong>${escapeHtml(school.name)}</strong> <small>#${school.rank}</small>
      </button>
    `).join('');

    container.querySelectorAll('.sim-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedUniv = appData.schools[item.dataset.name];
        document.getElementById('selected-univ-display').textContent = `Target: ${selectedUniv.name} (#${selectedUniv.rank})`;
        document.getElementById('step-univ-first').classList.add('hidden');
        document.getElementById('step-candidates').classList.remove('hidden');
        populateFacultyList(selectedUniv);
        candidatesInput.focus();
      });
    });
  });

  candidatesInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      analyzeBtn.click();
    }
  });

  candidatesInput.addEventListener('input', () => {
    const currentNames = new Set(parseCandidateNames(candidatesInput.value).map(name => name.toLowerCase()));
    for (const name of selectedDblpProfiles.keys()) {
      if (!currentNames.has(name)) selectedDblpProfiles.delete(name);
    }
  });

  analyzeBtn.addEventListener('click', async () => {
    if (!selectedUniv) return;
    const names = parseCandidateNames(candidatesInput.value);
    if (names.length === 0) return;

    document.getElementById('step-candidates').classList.add('hidden');
    document.getElementById('step-results').classList.remove('hidden');
    document.getElementById('selected-univ-display-results').textContent = `Target: ${selectedUniv.name} (#${selectedUniv.rank})`;

    const loading = document.getElementById('sim-loading');
    const resultsContainer = document.getElementById('sim-candidates-results');
    loading.classList.remove('hidden');
    resultsContainer.innerHTML = '';

    const results = await performCandidatesAnalysis(selectedUniv, names);
    loading.classList.add('hidden');
    resultsContainer.innerHTML = renderCandidateResults(results);
    resultsContainer.querySelectorAll('.papers-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const list = button.nextElementSibling;
        list.classList.toggle('visible');
        button.textContent = list.classList.contains('visible') ? '▼ Hide Papers' : '▶ Show Papers';
      });
    });
  });
}

function setupFilters() {
  const startSelect = document.getElementById('start-year');
  const endSelect = document.getElementById('end-year');
  for (let year = DEFAULT_END_YEAR; year >= 2000; year--) {
    startSelect.add(new Option(year, year));
    endSelect.add(new Option(year, year));
  }
  startSelect.value = startYear;
  endSelect.value = endYear;
  document.getElementById('region-select').value = selectedRegion;
  document.getElementById('conf-set').value = confSet;

  const refresh = () => {
    startYear = Number(startSelect.value);
    endYear = Number(endSelect.value);
    if (startYear > endYear) {
      endYear = startYear;
      endSelect.value = endYear;
    }
    selectedRegion = document.getElementById('region-select').value;
    confSet = document.getElementById('conf-set').value;
    appData = filterByYears(rawData, startYear, endYear, selectedRegion, null, null, confSet);
    resetSimulation();
  };

  startSelect.addEventListener('change', refresh);
  endSelect.addEventListener('change', refresh);
  document.getElementById('region-select').addEventListener('change', refresh);
  document.getElementById('conf-set').addEventListener('change', refresh);
}

async function init() {
  try {
    [rawData] = await Promise.all([loadData(), syncCsrankingsRules()]);
    setupFilters();
    appData = filterByYears(rawData, startYear, endYear, selectedRegion, null, null, confSet);
    setupSimulator();
    document.getElementById('sim-loading-page').classList.add('hidden');
    document.getElementById('simulator-workflow').classList.remove('hidden');
    document.getElementById('sim-univ-search').focus();
  } catch (error) {
    console.error('Failed to initialize simulator:', error);
    document.getElementById('sim-loading-page').textContent = 'Unable to load ranking data. Please try again.';
  }
}

init();
