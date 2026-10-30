import { getConferenceAreaMap, loadData, publicationMatchesConferenceSet } from './data.js';
import { fetchAuthorStats, parseDblpProfileUrl, searchAuthor } from './dblp.js';
import { createFilterBar } from './filters.js';
import { calculatePerCapita } from './metrics.js';
import { wireSearchInput } from './search-controls.js';
import { SITE_NAME, updatePageMeta } from './seo.js';
import { areaLabels, cleanName, escapeHtml } from './shared.js';
import { calculateRankImpact, fuzzyMatch, parseCandidateNames } from './simulation.js';
import { initTooltipPositioning } from './tooltip-position.js';
import type { DblpAuthorResult } from './dblp.js';
import type { FilterController } from './filters.js';
import type { SimulationAreaDelta } from './simulation.js';
import type { AreaStats, FilteredData, FilteredSchool, RawData } from './types.js';

let rawData: RawData = null!;
let appData: FilteredData = { professors: {}, schools: {} };
let filters: FilterController = null!;

let simFacultyArr: string[] = [];
let facultyFilter = '';
let dblpFacultyResults: DblpAuthorResult[] = [];
let dblpFacultyLoading = false;
let dblpSearchTimer: ReturnType<typeof setTimeout> | null = null;
let dblpSearchSequence = 0;
const selectedDblpProfiles = new Map<string, DblpAuthorResult>();
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function resetFacultySearch() {
  if (dblpSearchTimer) clearTimeout(dblpSearchTimer);
  dblpSearchSequence++;
  facultyFilter = '';
  dblpFacultyResults = [];
  dblpFacultyLoading = false;
}

function populateFacultyList(school: FilteredSchool) {
  const facultySet = new Set<string>();
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

function addCandidate(name: string, dblpProfile: DblpAuthorResult | null = null) {
  const candidatesInput = byId<HTMLTextAreaElement>('sim-candidates-input');
  const names = parseCandidateNames(candidatesInput.value);
  if (dblpProfile) selectedDblpProfiles.set(name.toLowerCase(), dblpProfile);
  if (!names.some(candidate => candidate.toLowerCase() === name.toLowerCase())) {
    names.push(name);
    candidatesInput.value = names.join('\n');
  }
}

function findLocalFaculty(filter: string) {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) return simFacultyArr;

  return Object.keys(appData.professors)
    .filter(name => cleanName(name).toLowerCase().includes(normalized)
      || (appData.professors[name]?.aliases || []).some(alias => cleanName(alias).toLowerCase().includes(normalized)))
    .sort((a, b) => {
      const nameA = cleanName(a).toLowerCase();
      const nameB = cleanName(b).toLowerCase();
      const startsA = nameA.startsWith(normalized) ? 0 : 1;
      const startsB = nameB.startsWith(normalized) ? 0 : 1;
      return startsA - startsB || nameA.localeCompare(nameB);
    })
    .slice(0, 20);
}

function renderFacultyList(filter = facultyFilter) {
  const listEl = document.getElementById('sim-faculty-list');
  const candidatesInput = byId<HTMLTextAreaElement>('sim-candidates-input');
  if (!listEl || !candidatesInput) return;

  const filtered = findLocalFaculty(filter);

  const currentNames = candidatesInput.value.split('\n').map(n => n.trim()).filter(n => n);

  const localHtml = filtered.map(f => {
    const displayName = cleanName(f);
    const candidateName = f;
    const checked = currentNames.some(n => n.toLowerCase() === candidateName.toLowerCase());
    const prof = appData.professors[f];
    const areas = prof ? Object.keys(prof.areas).length : 0;
    const papers = prof ? prof.totalPapers : 0;
    const adj = prof ? prof.totalAdjusted.toFixed(1) : '0';
    const affiliation = prof?.affiliation || 'University unavailable';
    return `
      <label class="sim-faculty-option" data-name="${escapeHtml(candidateName)}">
        <input type="checkbox" ${checked ? 'checked' : ''}>
        <span class="sim-faculty-identity">
          <span>${escapeHtml(displayName)}</span>
          <small>${escapeHtml(affiliation)}</small>
        </span>
        <small class="sim-faculty-stats">${areas} areas, ${papers} papers, ${adj} adj</small>
      </label>
    `;
  }).join('');

  let dblpHtml = '';
  if (filter.trim().length >= 2 && filtered.length === 0) {
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
    dblpHtml = `<div class="sim-list-heading">DBLP results · affiliation unavailable</div>${status}${resultHtml}`;
  }

  const localHeading = filter
    ? (filtered.length ? `<div class="sim-list-heading">Matching faculty (${filtered.length})</div>` : '')
    : `<div class="sim-list-heading">Faculty at the selected university (${filtered.length})</div>`;
  listEl.innerHTML = `${localHeading}${localHtml}${dblpHtml}`;

  listEl.querySelectorAll('label').forEach(label => {
    const checkbox = label.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.addEventListener('change', () => {
      const name = label.dataset.name;
      if (!name) return;
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

  listEl.querySelectorAll<HTMLElement>('.sim-dblp-result').forEach(button => {
    button.addEventListener('click', () => {
      const profile = dblpFacultyResults[Number(button.dataset.index)];
      if (!profile) return;
      addCandidate(profile.name, profile);
      renderFacultyList();
    });
  });
}

function searchFaculty(filter: string) {
  facultyFilter = filter.trim();
  dblpFacultyResults = [];
  const localMatches = findLocalFaculty(facultyFilter);
  dblpFacultyLoading = facultyFilter.length >= 2 && localMatches.length === 0;
  const sequence = ++dblpSearchSequence;
  if (dblpSearchTimer) clearTimeout(dblpSearchTimer);
  renderFacultyList();

  if (facultyFilter.length < 2 || localMatches.length > 0) return;
  dblpSearchTimer = setTimeout(async () => {
    const results = await searchAuthor(facultyFilter);
    if (sequence !== dblpSearchSequence) return;
    dblpFacultyResults = results.slice(0, 10);
    dblpFacultyLoading = false;
    renderFacultyList();
  }, 350);
}



function resetSimulation() {
  resetFacultySearch();
  selectedDblpProfiles.clear();
  selectedUniv = null;
  byId('step-univ-first').classList.remove('hidden');
  byId('step-candidates').classList.add('hidden');
  byId('step-results').classList.add('hidden');
  byId<HTMLInputElement>('sim-univ-search').value = '';
  byId<HTMLTextAreaElement>('sim-candidates-input').value = '';
  byId('sim-univ-results').innerHTML = '';
  byId('sim-candidates-results').innerHTML = '';
  byId('sim-faculty-list').innerHTML = '';
  byId<HTMLInputElement>('sim-faculty-search').value = '';
  if (filters) updateSimulatorUrl();
}

function resetCandidates() {
  if (!selectedUniv) return;
  byId('step-results').classList.add('hidden');
  byId('step-candidates').classList.remove('hidden');
  byId<HTMLTextAreaElement>('sim-candidates-input').value = '';
  selectedDblpProfiles.clear();
  byId('sim-candidates-results').innerHTML = '';
  byId<HTMLInputElement>('sim-faculty-search').value = '';
  populateFacultyList(selectedUniv);
  updateSimulatorUrl();
  byId('sim-faculty-search').focus();
}

let selectedUniv: FilteredSchool | null = null;
// Recomputed whenever appData changes; keyed by school name, same rule as the
// Per capita toggle on Search and Discoveries (calculatePerCapita).
let perCapitaRanks = new Map<string, number>();

function refreshPerCapitaRanks() {
  perCapitaRanks = new Map(calculatePerCapita(appData).map(row => [row.name, row.rank]));
}

// The rank shown next to a school name, in whichever mode Per capita is set to.
function currentRankLabel(school: FilteredSchool) {
  if (!filters.perCapita) return `#${school.rank}`;
  const rank = perCapitaRanks.get(school.name);
  return rank ? `#${rank}` : 'not ranked — fewer than 5 faculty';
}

function setupSimulator() {
  const univSearch = byId<HTMLInputElement>('sim-univ-search');
  const candidatesInput = byId<HTMLTextAreaElement>('sim-candidates-input');
  const analyzeBtn = byId<HTMLButtonElement>('sim-analyze-btn');

  byId('sim-reset-btn').addEventListener('click', resetSimulation);
  byId('sim-change-candidates-btn').addEventListener('click', resetCandidates);
  wireSearchInput(byId<HTMLInputElement>('sim-faculty-search'), searchFaculty);

  byId('sim-select-all').addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('#sim-faculty-list input[type="checkbox"]:not(:checked)').forEach(checkbox => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
    });
  });

  byId('sim-deselect-all').addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('#sim-faculty-list input[type="checkbox"]:checked').forEach(checkbox => {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
    });
  });

  wireSearchInput(univSearch, rawQuery => {
    const query = rawQuery.trim().toLowerCase();
    const container = byId('sim-univ-results');
    if (!query) {
      container.innerHTML = '';
      return;
    }

    const results = Object.values(appData.schools)
      .filter(school => school.name.toLowerCase().includes(query))
      .slice(0, 10);

    container.innerHTML = results.map(school => `
      <button type="button" class="sim-item" data-name="${escapeHtml(school.name)}">
        <strong>${escapeHtml(school.name)}</strong> <small>${escapeHtml(currentRankLabel(school))}</small>
      </button>
    `).join('');

    container.querySelectorAll<HTMLElement>('.sim-item').forEach(item => {
      item.addEventListener('click', () => {
        const schoolName = item.dataset.name;
        const school = schoolName ? appData.schools[schoolName] : undefined;
        if (!school) return;
        selectedUniv = school;
        byId('selected-univ-display').textContent = `Target: ${school.name} (${currentRankLabel(school)})`;
        byId('step-univ-first').classList.add('hidden');
        byId('step-candidates').classList.remove('hidden');
        populateFacultyList(school);
        updateSimulatorUrl();
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

  analyzeBtn.addEventListener('click', () => runAnalysis());
}

async function runAnalysis() {
  const candidatesInput = byId<HTMLTextAreaElement>('sim-candidates-input');
  if (!selectedUniv) return;
  const names = parseCandidateNames(candidatesInput.value);
  if (names.length === 0) return;

  byId('step-candidates').classList.add('hidden');
  byId('step-results').classList.remove('hidden');
  byId('selected-univ-display-results').textContent = `Target: ${selectedUniv.name} (${currentRankLabel(selectedUniv)})`;
  updateSimulatorUrl();

  const loading = byId('sim-loading');
  const resultsContainer = byId('sim-candidates-results');
  loading.classList.remove('hidden');
  resultsContainer.innerHTML = '';

  const results = await performCandidatesAnalysis(selectedUniv, names, { filters, selectedDblpProfiles, appData });
  loading.classList.add('hidden');
  resultsContainer.innerHTML = renderCandidateResults(results);
  resultsContainer.querySelectorAll('.papers-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const list = button.nextElementSibling;
      if (!list) return;
      list.classList.toggle('visible');
      button.textContent = list.classList.contains('visible') ? '▼ Hide Papers' : '▶ Show Papers';
    });
  });
}

// A shareable link for the current setup: filters, the selected university,
// and whatever candidate names/DBLP links are in the box - not a URL per
// computed result (that would mean re-resolving DBLP on every page load),
// but enough that opening the link reproduces the same inputs one click away.
function updateSimulatorUrl() {
  const params = filters.toParams();
  if (selectedUniv) params.set('univ', selectedUniv.name);
  const candidatesInput = byId<HTMLTextAreaElement>('sim-candidates-input');
  const candidates = candidatesInput?.value.trim();
  if (candidates) params.set('candidates', candidates);
  window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  updatePageMeta({
    title: selectedUniv ? `${selectedUniv.name} ranking simulation - ${SITE_NAME}` : `${SITE_NAME} - Ranking Simulator`,
    description: selectedUniv
      ? `Model how adding, removing, or transferring faculty would change ${selectedUniv.name}'s ranking, overall and by research area.`
      : undefined
  });
}

function setupFilters() {
  filters = createFilterBar('#filter-bar', {
    label: 'Simulator filters',
    fields: ['region', 'years', 'history', 'percapita', 'confSet'],
    years: { min: 1970, max: new Date().getFullYear() },
    className: 'simulator-filters',
    onChange: () => {
      appData = filters.apply(rawData);
      refreshPerCapitaRanks();

      if (selectedUniv) {
        const updatedSchool = appData.schools[selectedUniv.name];
        if (updatedSchool) {
          selectedUniv = updatedSchool;
          const rankLabel = currentRankLabel(selectedUniv);
          const display1 = document.getElementById('selected-univ-display');
          const display2 = document.getElementById('selected-univ-display-results');
          if (display1) display1.textContent = `Target: ${selectedUniv.name} (${rankLabel})`;
          if (display2) display2.textContent = `Target: ${selectedUniv.name} (${rankLabel})`;

          const candidatesStep = document.getElementById('step-candidates');
          if (candidatesStep && !candidatesStep.classList.contains('hidden')) {
            populateFacultyList(selectedUniv);
          }

          const resultsStep = document.getElementById('step-results');
          if (resultsStep && !resultsStep.classList.contains('hidden')) {
            runAnalysis();
          }
          updateSimulatorUrl();
          return;
        }
      }

      resetSimulation();
    }
  });
}

// Reproduces a shared setup: the university from ?univ= (if it still exists
// under these filters) and, if given, the candidate names/DBLP links from
// ?candidates= - left for the visitor to click Analyze on, rather than
// auto-run, since that would re-query DBLP for every open of the link.
function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const univName = params.get('univ');
  const school = univName && appData.schools[univName];
  if (!school) return;
  selectedUniv = school;
  byId('selected-univ-display').textContent = `Target: ${selectedUniv.name} (${currentRankLabel(selectedUniv)})`;
  byId('step-univ-first').classList.add('hidden');
  byId('step-candidates').classList.remove('hidden');
  populateFacultyList(selectedUniv);
  const candidates = params.get('candidates');
  if (candidates) byId<HTMLTextAreaElement>('sim-candidates-input').value = candidates;
}

async function init() {
  initTooltipPositioning();
  try {
    rawData = await loadData();
    setupFilters();
    // History mode may already be on from a shared link or a stored choice,
    // and its affiliation data has to be in place before the first apply().
    await filters.ready();
    appData = filters.apply(rawData);
    refreshPerCapitaRanks();
    setupSimulator();
    restoreFromUrl();
    byId('sim-loading-page').classList.add('hidden');
    byId('simulator-workflow').classList.remove('hidden');
    byId('sim-univ-search').focus();
  } catch (error) {
    console.error('Failed to initialize simulator:', error);
    byId('sim-loading-page').textContent = 'Unable to load ranking data. Please try again.';
  }
}

init();

async function performCandidatesAnalysis(
  selectedUniv: FilteredSchool,
  uniqueNames: string[],
  { filters, selectedDblpProfiles, appData }: {
    filters: FilterController;
    selectedDblpProfiles: Map<string, DblpAuthorResult>;
    appData: FilteredData;
  }
) {
  const candidateResults: CandidateResult[] = [];

  const confMap = getConferenceAreaMap(filters.confSet);

  for (const name of uniqueNames) {
    try {
      const selectedDblpProfile = selectedDblpProfiles.get(name.toLowerCase());
      let profData = null;
      if (!selectedDblpProfile && appData.professors[name]) {
        profData = appData.professors[name];
      } else if (!selectedDblpProfile) {
        const targetFacultyNames = new Set<string>();
        Object.values(selectedUniv.areas).forEach(a => a.faculty.forEach(f => targetFacultyNames.add(f)));
        for (const fName of targetFacultyNames) {
          if (fuzzyMatch(fName, name)) {
            profData = appData.professors[fName];
            break;
          }
        }
        if (!profData) {
          for (const pName of Object.keys(appData.professors)) {
            const lastName = name.split(' ').pop()?.toLowerCase() || '';
            if (!pName.toLowerCase().includes(lastName) &&
              Math.abs(pName.length - name.length) > 3) continue;

            if (fuzzyMatch(pName, name)) {
              profData = appData.professors[pName];
              break;
            }
          }
        }
      }

      let stats: CandidateStats;
      let displayName = name;
      let usedCSRankings = false;

      if (profData && profData.pubs && profData.pubs.length > 0) {
        // Use CSRankings data for existing professors
        displayName = cleanName(profData.name);

        // Filter pubs by year range AND conference set
        const yearFiltered = profData.pubs.filter(p => p.year >= filters.startYear && p.year <= filters.endYear);

        const confFilteredPubs = yearFiltered.filter(p => publicationMatchesConferenceSet(p, filters.confSet));

        console.log('CSRankings match for:', name, '→', profData.name, 'pubs:', profData.pubs.length, 'filtered:', confFilteredPubs.length);

        if (confFilteredPubs.length === 0) {
          // No papers in this year range/conf set - show as such
          candidateResults.push({ name: displayName, error: `No publication records found in ${filters.startYear}–${filters.endYear} for the active conference set` });
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
            adjusted: pub.adjustedcount,
            area: area
          });
        });

        stats.papers.sort((a, b) => b.year - a.year);
      } else {
        // External candidate - query DBLP

        const linkedProfile = parseDblpProfileUrl(name);
        if (!linkedProfile && /^https?:\/\//i.test(name)) {
          candidateResults.push({ name, error: 'Use a DBLP author-profile link containing /pid/, such as https://dblp.org/pid/12/3456.html' });
          continue;
        }

        let searchName = name;
        let dblpSuffix = null;
        const suffixMatch = name.match(/^(.+?)\s+(\d{4})$/);
        if (suffixMatch) {
          searchName = suffixMatch[1]!;
          dblpSuffix = suffixMatch[2]!;
        }

        let best: DblpAuthorResult | (NonNullable<typeof linkedProfile> & { name?: string }) | undefined = linkedProfile || selectedDblpProfile;
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
          candidateResults.push({ name, error: 'No matching profile found in the faculty roster or DBLP search' });
          continue;
        }

        displayName = best.name || `DBLP profile ${best.pid}`;

        const fetchedStats = await fetchAuthorStats(best.pid, filters.startYear, filters.endYear, filters.confSet);
        if (!fetchedStats) {
          candidateResults.push({ name, error: 'We couldn\'t retrieve publication records from DBLP. Please verify the profile is accessible.' });
          continue;
        }
        stats = fetchedStats;
        if (!best.name && stats.aliases?.length) displayName = stats.aliases[0]!;
      }

      let sourceSchool = null;
      let isRemovalMode = false;
      // The roster spelling being removed (target school if isRemovalMode, or
      // sourceSchool on a transfer) — needed under Per capita so the
      // hypothetical faculty count drops by exactly this one entry.
      let matchedFacultyName = null;

      // Get all name variants to check (includes DBLP aliases)
      const namesToCheck = [displayName];
      if (stats.aliases && stats.aliases.length > 0) {
        stats.aliases.forEach(alias => {
          if (!namesToCheck.includes(alias)) namesToCheck.push(alias);
        });
      }

      const targetFaculty = new Set<string>();
      Object.values(selectedUniv.areas).forEach(a => a.faculty.forEach(f => targetFaculty.add(f)));

      // Check if any alias matches target school faculty
      outerRemoval:
      for (const nameVariant of namesToCheck) {
        for (const f of targetFaculty) {
          if (fuzzyMatch(f, nameVariant)) {
            isRemovalMode = true;
            matchedFacultyName = f;
            break outerRemoval;
          }
        }
      }

      // Check if any alias matches another school's faculty (transfer mode)
      if (!isRemovalMode) {
        outerSource:
        for (const s of Object.values(appData.schools)) {
          if (s.name === selectedUniv.name) continue;
          const sFaculty = new Set<string>();
          Object.values(s.areas).forEach(a => a.faculty.forEach(f => sFaculty.add(f)));

          for (const nameVariant of namesToCheck) {
            for (const f of sFaculty) {
              if (fuzzyMatch(f, nameVariant)) {
                sourceSchool = s;
                matchedFacultyName = f;
                break outerSource;
              }
            }
          }
        }
      }

      const ops = [];
      if (isRemovalMode) {
        ops.push({ school: selectedUniv, stats, isRemoval: true, facultyKey: matchedFacultyName || undefined });
      } else {
        ops.push({ school: selectedUniv, stats, isRemoval: false, facultyKey: displayName });
      }

      if (sourceSchool && !isRemovalMode) {
        ops.push({ school: sourceSchool, stats, isRemoval: true, facultyKey: matchedFacultyName || undefined });
      }
      const impactMap = calculateRankImpact(appData.schools, ops, { perCapita: filters.perCapita });
      const targetImpact = impactMap.get(selectedUniv.name) || { overall: 0, areas: {}, rankBefore: selectedUniv.rank, rankAfter: selectedUniv.rank };
      const rankDelta = targetImpact.overall;
      const areaDeltas = targetImpact.areas;
      const sourceImpactEntry = sourceSchool ? impactMap.get(sourceSchool.name) : null;
      const sourceImpact = sourceImpactEntry ? sourceImpactEntry.overall : null;

      candidateResults.push({
        name: displayName,
        stats,
        rankDelta,
        currentRank: targetImpact.rankBefore,
        newRank: targetImpact.rankAfter,
        areaDeltas,
        isRemoval: isRemovalMode,
        usedCSRankings: usedCSRankings,
        sourceSchool: sourceSchool ? { name: sourceSchool.name, delta: sourceImpact } : null,
        error: null
      });
    } catch (err) {
      console.error('Simulator error for:', name, err);
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Stack:', error.stack);
      candidateResults.push({ name, error: `An unexpected error occurred while retrieving data: ${error.message}. Please try again.` });
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

type AreaDelta = SimulationAreaDelta;

interface CandidateResultBase {
  name: string;
  rankDelta?: number | null;
  currentRank?: number | null;
  newRank?: number | null;
  areaDeltas?: Record<string, AreaDelta>;
  isRemoval?: boolean;
  usedCSRankings?: boolean;
  sourceSchool?: { name: string, delta: number | null } | null;
}

interface CandidateFailure extends CandidateResultBase {
  error: string;
  stats?: never;
}

interface CandidateSuccess extends CandidateResultBase {
  error?: null;
  stats: CandidateStats;
}

type CandidateResult = CandidateFailure | CandidateSuccess;

interface CandidateStats {
  totalAdjusted: number;
  totalPapers: number;
  totalDblpPublications?: number;
  areas: Record<string, AreaStats>;
  papers: Array<{
    title?: string | null;
    venue: string;
    year: number;
    count?: number;
    adjusted: number;
    area?: string;
  }>;
  aliases?: string[];
}

// Under Per capita, a department can sit on either side of the 5-faculty
// minimum before or after the hypothetical change, so either rank can be
// unavailable rather than a number — shown plainly instead of guessed at.
function rankMoveLabel(before: number | null | undefined, after: number | null | undefined, deltaText: string) {
  const label = (rank: number | null | undefined) => rank == null ? 'not ranked' : `#${rank}`;
  return `${label(before)} → ${label(after)} (${deltaText})`;
}

function renderCandidateResults(candidates: CandidateResult[]) {
  const medals = ['🥇', '🥈', '🥉'];

  return candidates.map((c, i) => {
    if (!c.stats) {
      return `
        <div class="candidate-card">
          <div class="candidate-header">
            <span class="candidate-medal">❌</span>
            <div class="candidate-info">
              <div class="candidate-name">${escapeHtml(c.name)}</div>
              <div class="candidate-stats candidate-stats-error">${escapeHtml(c.error)}</div>
            </div>
          </div>
        </div>
      `;
    }

    const stats = c.stats;

    const medal = i < 3 ? medals[i] : `#${i + 1}`;
    const deltaClass = c.rankDelta == null ? 'neutral' : c.rankDelta > 0 ? 'positive' : (c.rankDelta < 0 ? 'negative' : 'neutral');
    const deltaText = c.rankDelta == null ? 'n/a' : c.rankDelta > 0 ? `+${c.rankDelta}` : (c.rankDelta < 0 ? `${c.rankDelta}` : '±0');

    let actionLabel = '';
    if (c.isRemoval) {
      actionLabel = '<span class="candidate-action-remove">Removing</span>';
    } else if (c.sourceSchool) {
      actionLabel = `<span class="candidate-action-transfer">from ${escapeHtml(c.sourceSchool.name)}</span>`;
    }

    let dataSourceBadge = '';
    if (c.usedCSRankings) {
      dataSourceBadge = '<span class="candidate-badge-roster">Roster</span>';
    }

    let sourceImpactHtml = '';
    if (c.sourceSchool) {
      const sDelta = c.sourceSchool.delta;
      if (sDelta == null) {
        sourceImpactHtml = `
          <div class="candidate-source-impact">
             <span>${escapeHtml(c.sourceSchool.name)}:</span>
             <span class="neutral" style="font-weight: 600;">rank unavailable</span>
          </div>
        `;
      } else {
      const sClass = sDelta > 0 ? 'positive' : (sDelta < 0 ? 'negative' : 'neutral');
      const sText = sDelta > 0 ? `+${sDelta}` : (sDelta < 0 ? `${sDelta}` : '±0');
      sourceImpactHtml = `
          <div class="candidate-source-impact">
             <span>${escapeHtml(c.sourceSchool.name)}:</span>
             <span class="${sClass}" style="font-weight: 600;">${sText} ranks</span>
          </div>
      `;
      }
    }

    const papersHtml = stats.papers.slice(0, 20).map(p => {
      const countLabel = (p.count || 0) > 1 ? `${Math.round(p.count || 0)} papers` : '1 paper';
      return `
      <div class="paper-item">
        <span class="paper-venue">${escapeHtml(p.venue)}</span>
        <span class="paper-year">${p.year}</span>:
        ${countLabel} <small>· ${p.adjusted.toFixed(2)} adjusted</small>
      </div>
    `;
    }).join('');

    const countedPaperLabel = `${stats.totalPapers} rank-counted ${stats.totalPapers === 1 ? 'paper' : 'papers'}`;
    const paperSummary = Number.isFinite(stats.totalDblpPublications)
      ? `${countedPaperLabel} of ${stats.totalDblpPublications} DBLP publications in the selected years`
      : `${stats.totalPapers} ${stats.totalPapers === 1 ? 'paper' : 'papers'}`;

    // Show all areas the candidate publishes in, with rank delta for each
    const allAreas = Object.keys(stats.areas);
    const areaDeltaEntries = allAreas
      .map(area => {
        let d = (c.areaDeltas || {})[area];
        if (d === undefined) d = { delta: 0 };
        return [area, d] as [string, AreaDelta];
      })
      .sort(([, a], [, b]) => {
        const getVal = (x: AreaDelta) => {
          if (x.dropped || x.entered) return 1000;
          return Math.abs(x.delta ?? 0);
        };
        return getVal(b) - getVal(a);
      });

    const areaPillsHtml = areaDeltaEntries.length > 0 ? `
      <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px;">
        ${areaDeltaEntries.map(([area, d]) => {
      const label = escapeHtml(areaLabels[area] || area);
      if (d.dropped) {
        return `<span class="area-pill negative">↓ ${label} (Unranked - was #${d.wasRank})</span>`;
      }
      if (d.entered) {
        return `<span class="area-pill positive">↑ ${label} +New (→ #${d.nowRank})</span>`;
      }

      const deltaVal = d.delta || 0;
      const nowRank = d.nowRank ?? null;

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
            <div class="candidate-stats">${Object.keys(stats.areas).length} areas, ${paperSummary}, ${stats.totalAdjusted.toFixed(1)} adjusted</div>
            <div class="candidate-area-breakdown">
              ${Object.entries(stats.areas)
        .sort(([, a], [, b]) => {
          const aCount = typeof a === 'number' ? a : a.count;
          const bCount = typeof b === 'number' ? b : b.count;
          return bCount - aCount;
        })
        .map(([area, areaStats]) => {
          const count = typeof areaStats === 'number' ? Math.ceil(areaStats) : (areaStats.count || 0);
          const label = escapeHtml(areaLabels[area] || area);
          return `<span class="area-breakdown-tag">${label} <strong>(${count} ${count === 1 ? 'paper' : 'papers'})</strong></span>`;
        }).join('')}
            </div>
            ${areaPillsHtml}
          </div>
          <div class="candidate-impact">
            <div class="candidate-rank-delta ${deltaClass}">${rankMoveLabel(c.currentRank, c.newRank, deltaText)}</div>
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
