import Papa from 'papaparse';
import { decodeAffiliationHistory } from './affiliation-history-format.js';
import { schoolAliases } from './data/institution-aliases.js';
import { getConferenceAreaMap, numAreas, publicationMatchesConferenceSet, topLevelAreas } from './data/conference-sets.js';

export { conferenceAliases, schoolAliases } from './data/institution-aliases.js';
export { CONFERENCE_SET_IDS, coreAMap, coreAStarMap, getConferenceAreaMap, nextTier, normalizeConferenceSet, parentMap, publicationMatchesConferenceSet } from './data/conference-sets.js';

const currentYear = new Date().getFullYear();
export const DEFAULT_END_YEAR = currentYear;
export const DEFAULT_START_YEAR = DEFAULT_END_YEAR - 10;

const GITHUB_RAW = 'https://raw.githubusercontent.com/dynaroars/cspicks/main/public';
let affiliationDataPromise = null;


let dataPromise = null;

export function loadData() {
  if (!dataPromise) {
    dataPromise = loadDataFromSources().catch(error => {
      dataPromise = null;
      throw error;
    });
  }
  return dataPromise;
}

async function loadDataFromSources() {
  const optionalCsv = url => fetchCsv(url).catch(error => {
    console.warn(`Optional CSRankings metadata unavailable: ${url}`, error);
    return [];
  });
  const [csrankings, authorInfo, institutions, turingWinners, acmFellows, countries, dblpAliases, nameChanges] = await Promise.all([
    fetchCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/csrankings.csv'),
    fetchCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/generated-author-info.csv'),
    fetchCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/institutions.csv'),
    optionalCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/turing.csv'),
    optionalCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/acm-fellows.csv'),
    optionalCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/countries.csv'),
    optionalCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/dblp-aliases.csv'),
    optionalCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/name-changes.csv')
  ]);

  const professors = {};
  const schools = {};
  const turingByName = new Map(turingWinners.map(row => [row.name?.trim(), Number(row.year)]));
  const acmFellowByName = new Map(acmFellows.map(row => [row.name?.trim(), Number(row.year)]));
  const countryByCode = new Map(countries.map(row => [row.alpha_2?.trim().toLowerCase(), row.name?.trim()]));

  // turing.csv/acm-fellows.csv list plain names, but CSRankings' roster
  // appends a disambiguation number ("Vipin Kumar 0001") to names that
  // collide with someone else in the roster. Strip it and retry, but only
  // when exactly one roster entry shares that base name — an award can't be
  // safely credited to either of two people with the same name.
  const rosterNamesByBase = new Map();
  csrankings.forEach(row => {
    if (!row.name) return;
    const name = row.name.trim();
    const base = name.replace(/\s+\d{4}$/, '');
    if (!rosterNamesByBase.has(base)) rosterNamesByBase.set(base, new Set());
    rosterNamesByBase.get(base).add(name);
  });
  const lookupHonor = (honorMap, name) => {
    if (honorMap.has(name)) return honorMap.get(name);
    const base = name.replace(/\s+\d{4}$/, '');
    if (base === name || !honorMap.has(base)) return null;
    return rosterNamesByBase.get(base)?.size === 1 ? honorMap.get(base) : null;
  };

  csrankings.forEach(row => {
    if (row.name) {
      const name = row.name.trim();
      professors[name] = {
        name: name,
        affiliation: row.affiliation,
        homepage: row.homepage,
        scholarid: row.scholarid,
        orcid: /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(row.orcid?.trim()) && row.orcid !== '0000-0000-0000-0000'
          ? row.orcid.trim()
          : null,
        aliases: [],
        unitNotes: [],
        turingAwardYear: lookupHonor(turingByName, name) || null,
        acmFellowYear: lookupHonor(acmFellowByName, name) || null,
        pubs: []
      };

      if (!schools[row.affiliation]) {
        schools[row.affiliation] = {
          name: row.affiliation,
          areas: {},
          region: null,
          country: null
        };
      }
    }
  });

  let invalidPublicationRows = 0;
  authorInfo.forEach(row => {
    const annotatedName = row.name?.trim();
    const year = Number.parseInt(row.year, 10);
    const count = Number.parseFloat(row.count);
    const adjustedcount = Number.parseFloat(row.adjustedcount);
    if (!annotatedName || !row.area?.trim() || !Number.isFinite(year)
      || !Number.isFinite(count) || !Number.isFinite(adjustedcount)) {
      invalidPublicationRows++;
      return;
    }
    const noteMatch = annotatedName.match(/^(.*?)\s+\[([^\]]+)\]$/);
    const name = noteMatch ? noteMatch[1].trim() : annotatedName;
    if (professors[name]) {
      if (noteMatch && !professors[name].unitNotes.includes(noteMatch[2])) {
        professors[name].unitNotes.push(noteMatch[2]);
      }

      // Skip next-tier conferences (matches CSRankings default behavior)
      // if (nextTier[row.area]) {
      //   return;
      // }

      professors[name].pubs.push({
        area: row.area.trim(),
        year,
        count,
        adjustedcount
      });
    }
  });
  if (invalidPublicationRows) {
    console.warn(`Ignored ${invalidPublicationRows} malformed CSRankings publication row(s).`);
  }

  institutions.forEach(row => {
    const name = row.institution?.trim();
    if (!name) return;
    if (schools[name]) {
      schools[name].region = row.region;
      schools[name].country = row.countryabbrv;
      schools[name].countryName = countryByCode.get(row.countryabbrv?.trim().toLowerCase()) || row.countryabbrv;
      schools[name].homepage = row.homepage || null;
    }
  });

  const attachAlias = (alias, canonical) => {
    const professor = professors[canonical?.trim()];
    const normalizedAlias = alias?.trim();
    if (professor && normalizedAlias && normalizedAlias !== professor.name && !professor.aliases.includes(normalizedAlias)) {
      professor.aliases.push(normalizedAlias);
    }
  };
  dblpAliases.forEach(row => attachAlias(row.alias, row.name));
  nameChanges.forEach(row => {
    attachAlias(row.old_name, row.new_name);
    const professor = professors[row.new_name?.trim()];
    if (professor && !professor.orcid && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(row.orcid?.trim())) {
      professor.orcid = row.orcid.trim();
    }
  });

  for (const name in professors) {
    if (professors[name].pubs.length === 0) {
      delete professors[name];
    }
  }

  return { professors, schools };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch JSON (${response.status}) from ${url}`);
  return response.json();
}

export function loadAffiliationData() {
  if (!affiliationDataPromise) {
    affiliationDataPromise = Promise.all([
      fetchJson(`${GITHUB_RAW}/professor_history_openalex.json`),
      fetchJson(`${GITHUB_RAW}/school-aliases.json`),
      fetchCsv(`${GITHUB_RAW}/manual_affiliations.csv`)
    ])
      .then(([history, aliases, manual]) => ({
        historyMap: mergeAffiliationHistory(decodeAffiliationHistory(history), manual),
        aliasMap: aliases || {}
      }))
      .catch(error => {
        affiliationDataPromise = null;
        throw error;
      });
  }

  return affiliationDataPromise;
}

// build-openalex-history.js resolves each professor by searching OpenAlex for
// their name and taking the single top-relevance result, with no check that
// the match's own affiliations have anything to do with this person - for
// anyone whose name collides with a more prominent, unrelated researcher in
// OpenAlex's far larger cross-discipline index (common names especially), that
// silently attaches a real but wrong person's entire career. The signature of
// that failure is a history sprawling across many more institutions than one
// career plausibly has, with the professor's own current CSRankings
// affiliation nowhere in it. When both hold, the history is not trusted at
// all, and every publication falls back to the current affiliation instead -
// the same safe behavior as having no history on record. A merely sparse or
// stale history (few institutions, just missing recent coverage) still gets
// the benefit of the doubt and is used as-is.
const IMPLAUSIBLE_HISTORY_INSTITUTION_COUNT = 8;

function isImplausibleHistory(history, currentAffiliation, aliasMap) {
  const resolved = new Set(history.map(segment =>
    Object.prototype.hasOwnProperty.call(aliasMap || {}, segment.school) ? aliasMap[segment.school] : segment.school));
  return resolved.size >= IMPLAUSIBLE_HISTORY_INSTITUTION_COUNT && !resolved.has(currentAffiliation);
}

export function getPublicationSchools(professor, publication, historyMap = null, aliasMap = null) {
  const fallback = [professor.affiliation];
  const history = historyMap?.[professor.name];

  // Falling back to a professor's current school is only safe when no
  // historical record exists for that professor. OpenAlex histories can be
  // sparse; treating an uncovered old year as the current affiliation silently
  // moves old publications to the professor's present-day institution.
  if (!history || history.length === 0) return fallback;
  if (isImplausibleHistory(history, professor.affiliation, aliasMap)) return fallback;

  const matches = history.filter(segment =>
    publication.year >= segment.start && publication.year <= segment.end
  );

  if (matches.length === 0) return [];

  const schools = matches
    .map(segment => Object.prototype.hasOwnProperty.call(aliasMap || {}, segment.school)
      ? aliasMap[segment.school]
      : segment.school)
    .filter(Boolean);

  return [...new Set(schools)];
}


function makeRegionTest(schools, region) {
  return schoolName => {
    const school = schools[schoolName];
    if (!school) return region === 'world';
    if (region === 'world') return true;
    // CSRankings files a country per school and a continent per region, so the
    // two country-level options must match on country, not region.
    if (region === 'us') return school.country === 'us';
    if (region === 'canada') return school.country === 'ca';
    return school.region === region;  // continents
  };
}

function emptySchool(name, source) {
  return {
    name,
    region: source?.region,
    country: source?.country,
    countryName: source?.countryName,
    homepage: source?.homepage,
    areas: {},
    areaAdjustedCounts: {},
    facultyAdjustedCounts: {},
    facultyCounts: {},
    totalCount: 0,
    totalAdjusted: 0
  };
}

// Stage 1: keep the publications inside the year range, conference set, and
// region, crediting each one to its school(s) as it goes.
function collectFilteredData({ professors, schools }, startYear, endYear, isInRegion, historyMap, aliasMap, confSet) {
  const confMap = getConferenceAreaMap(confSet);
  const filteredProfs = {};
  const filteredSchools = {};

  for (const name in professors) {
    const prof = professors[name];
    if (!historyMap && !isInRegion(prof.affiliation)) continue;

    const inRange = prof.pubs.filter(pub =>
      pub.year >= startYear && pub.year <= endYear && publicationMatchesConferenceSet(pub, confSet));
    if (inRange.length === 0) continue;

    const areaStats = {};
    const credited = [];

    inRange.forEach(pub => {
      const pubSchools = getPublicationSchools(prof, pub, historyMap, aliasMap).filter(isInRegion);
      // A professor's regional totals should contain only publications credited
      // to a school in the selected region.
      if (pubSchools.length === 0) return;
      credited.push(pub);

      const area = confMap[pub.area] || pub.area;
      if (!areaStats[area]) areaStats[area] = { count: 0, adjusted: 0 };
      areaStats[area].count += pub.count;
      areaStats[area].adjusted += pub.adjustedcount;

      pubSchools.forEach(schoolName => {
        const school = filteredSchools[schoolName]
          || (filteredSchools[schoolName] = emptySchool(schoolName, schools[schoolName]));

        school.totalCount += pub.count;
        school.totalAdjusted += pub.adjustedcount;

        if (!school.areas[area]) school.areas[area] = { count: 0, adjusted: 0, faculty: [], facultyStats: {} };
        school.areas[area].count += pub.count;
        school.areas[area].adjusted += pub.adjustedcount;
        if (!school.areas[area].faculty.includes(name)) school.areas[area].faculty.push(name);

        // Per-area, per-person totals have to be accumulated here: in historical
        // mode a professor's own area stats span every school they published
        // from, so they cannot be re-derived for one school after the fact.
        const areaFaculty = school.areas[area].facultyStats[name]
          || (school.areas[area].facultyStats[name] = { count: 0, adjusted: 0 });
        areaFaculty.count += pub.count;
        areaFaculty.adjusted += pub.adjustedcount;

        school.areaAdjustedCounts[area] = (school.areaAdjustedCounts[area] || 0) + pub.adjustedcount;
        school.facultyAdjustedCounts[name] = (school.facultyAdjustedCounts[name] || 0) + pub.adjustedcount;
        school.facultyCounts[name] = (school.facultyCounts[name] || 0) + pub.count;
      });
    });

    if (credited.length === 0) continue;
    const totalCount = credited.reduce((sum, pub) => sum + pub.count, 0);
    filteredProfs[name] = {
      ...prof,
      pubs: credited,
      areas: areaStats,
      totalCount,
      totalAdjusted: credited.reduce((sum, pub) => sum + pub.adjustedcount, 0),
      totalPapers: Math.ceil(totalCount)
    };
  }

  return { filteredProfs, filteredSchools };
}

/**
 * CSRankings' geometric mean over every top-level area, rounded the way the
 * upstream ranking rounds it. Exported so that anything recomputing a
 * hypothetical score — the fragility analysis, the simulator — uses this exact
 * formula rather than a second copy that could drift from it.
 */
export function scoreFromAreaCounts(areaAdjustedCounts) {
  return Math.round(10.0 * geometricMeanScore(areaAdjustedCounts)) / 10.0;
}

/**
 * The same geometric mean before the one-decimal rounding. Rounding collapses
 * small differences into ties, so anything that has to *compare* hypothetical
 * scores — which departure costs a department the most — must compare these,
 * and round only the value it reports.
 */
export function geometricMeanScore(areaAdjustedCounts) {
  const product = topLevelAreas.reduce((score, area) =>
    score * ((areaAdjustedCounts?.[area] || 0) + 1.0), 1.0);
  return Math.pow(product, 1 / numAreas);
}

// Stage 2: CSRankings' geometric mean over every top-level area.
function scoreSchools(schoolList) {
  schoolList.forEach(school => {
    school.score = scoreFromAreaCounts(school.areaAdjustedCounts);
  });
}

// Stage 3: standard competition ranking overall and within each area.
/**
 * Standard competition ranking: equal values share a rank and the next value
 * skips ahead, so ties never invent an ordering the data does not support.
 */
export function assignCompetitionRanks(items, valueOf) {
  const ordered = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  let rank = 0;
  let ties = 1;
  let previousValue = null;
  ordered.forEach(item => {
    const value = valueOf(item);
    if (value !== previousValue) {
      rank += ties;
      ties = 1;
    } else {
      ties++;
    }
    item.rank = rank;
    previousValue = value;
  });
  return ordered;
}

function rankSchools(schoolList) {
  schoolList.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  let rank = 0;
  let ties = 1;
  let previousScore = -1;
  schoolList.forEach(school => {
    if (school.score !== previousScore) {
      rank += ties;
      ties = 1;
    } else {
      ties++;
    }
    school.rank = rank;
    previousScore = school.score;
  });

  topLevelAreas.forEach(area => {
    const areaValue = school => school.areas[area]?.adjusted || 0;
    const ranked = schoolList.filter(school => areaValue(school) > 0)
      .sort((a, b) => areaValue(b) - areaValue(a));

    let areaRank = 0;
    let previousValue = null;
    ranked.forEach((school, index) => {
      const value = areaValue(school);
      if (value !== previousValue) areaRank = index + 1;
      if (!school.areaRanks) school.areaRanks = {};
      school.areaRanks[area] = areaRank;
      previousValue = value;
    });
  });
}

/**
 * The query behind every view: filter publications by year, venue, and region
 * (optionally re-crediting them to historical affiliations), then aggregate and
 * rank schools. Returns `{ professors, schools }` keyed by name.
 */
export function filterByYears(data, startYear = DEFAULT_START_YEAR, endYear = DEFAULT_END_YEAR, region = 'us', historyMap = null, aliasMap = null, confSet = 'all-union') {
  const history = historyMap && Object.keys(historyMap).length > 0 ? historyMap : null;
  const isInRegion = makeRegionTest(data.schools, region);
  const { filteredProfs, filteredSchools } = collectFilteredData(
    data, startYear, endYear, isInRegion, history, aliasMap, confSet);

  const schoolList = Object.values(filteredSchools).filter(school => school.name);
  scoreSchools(schoolList);
  rankSchools(schoolList);
  // People are ranked by adjusted count over the same selection, so a person's
  // rank means the same thing as a university's.
  assignCompetitionRanks(Object.values(filteredProfs), professor => professor.totalAdjusted);

  return { professors: filteredProfs, schools: filteredSchools };
}

export async function fetchCsv(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV (${response.status}) from ${url}`);
  }
  const text = await response.text();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      comments: "#",
      complete: (results) => {
        if (results.errors?.length) {
          reject(new Error(`Failed to parse CSV from ${url}: ${results.errors[0].message}`));
          return;
        }
        resolve(results.data);
      },
      error: reject
    });
  });
}

// Discards 1-year affiliations if the professor has a longer (2+ year)
// overlapping affiliation during that same period.
function filterSabbaticals(affiliations) {
  if (!affiliations || affiliations.length <= 1) return affiliations;

  return affiliations.filter(aff => {
    const duration = aff.end - aff.start + 1;
    if (duration > 1) return true;

    const overlapsLonger = affiliations.some(other => {
      if (other === aff) return false;
      const otherDuration = other.end - other.start + 1;
      const overlaps = aff.start >= other.start && aff.end <= other.end;
      return overlaps && otherDuration >= 2;
    });

    return !overlapsLonger;
  });
}

export function mergeAffiliationHistory(historyMap, manualList) {
  if (!historyMap) historyMap = {};

  const filtered = {};
  for (const name in historyMap) {
    filtered[name] = filterSabbaticals(historyMap[name]);
  }

  if (!manualList || manualList.length === 0) return filtered;

  const merged = { ...filtered };

  // Group manual entries by name
  const manualGroups = {};
  manualList.forEach(item => {
    if (!item.name || !item.school) return;
    const name = item.name.trim();
    if (!manualGroups[name]) manualGroups[name] = [];
    manualGroups[name].push({
      school: item.school.trim(),
      start: parseInt(item.start) || 1970,
      end: parseInt(item.end) || currentYear
    });
  });

  // Apply manual overrides
  for (const name in manualGroups) {
    merged[name] = manualGroups[name];
  }

  return merged;
}
