import Papa from 'papaparse';

const currentYear = new Date().getFullYear();
export const DEFAULT_END_YEAR = currentYear;
export const DEFAULT_START_YEAR = DEFAULT_END_YEAR - 10;

const GITHUB_RAW = 'https://raw.githubusercontent.com/dynaroars/cspicks/main/public';
let affiliationDataPromise = null;


export const schoolAliases = {
  'gmu': 'George Mason University',
  'cmu': 'Carnegie Mellon University',
  'mit': 'Massachusetts Inst. of Technology',
  'nyu': 'New York University',
  'uiuc': 'Univ. of Illinois at Urbana-Champaign',
  'ucb': 'Univ. of California - Berkeley',
  'ucla': 'Univ. of California - Los Angeles',
  'ucsd': 'Univ. of California - San Diego',
  'gatech': 'Georgia Institute of Technology',
  'uw': 'Univ. of Washington',
  'ut': 'Univ. of Texas at Austin',
  'umd': 'Univ. of Maryland - College Park',
  'unc': 'Univ. of North Carolina - Chapel Hill',
  'usc': 'Univ. of Southern California',
  'uci': 'Univ. of California - Irvine',
  'ucd': 'Univ. of California - Davis',
  'ucsb': 'Univ. of California - Santa Barbara',
  'ucsc': 'Univ. of California - Santa Cruz',
  'uva': 'University of Virginia',
  'vt': 'Virginia Tech',
  'wpi': 'Worcester Polytechnic Institute',
  'wustl': 'Washington University in St. Louis',
  'pitt': 'University of Pittsburgh',
  'psu': 'Pennsylvania State University',
  'osu': 'Ohio State University',
  'iu': 'Indiana University',
  'umn': 'University of Minnesota',
  'wisc': 'University of Wisconsin–Madison',
  'mu': 'University of Missouri',
  'msu': 'Michigan State University',
  'umich': 'University of Michigan',
  'nd': 'University of Notre Dame',
  'upenn': 'University of Pennsylvania',
  'vandy': 'Vanderbilt University',
  'tamu': 'Texas A&M University',
  'ttu': 'Texas Tech University',
  'uh': 'University of Houston',
  'asu': 'Arizona State University',
  'uofa': 'University of Arizona',
  'ucf': 'University of Central Florida',
  'fiu': 'Florida International University',
  'fsu': 'Florida State University',
  'uf': 'University of Florida',
  'rit': 'Rochester Institute of Technology',
  'ritchie': 'Colorado School of Mines',
  'neu': 'Northeastern University',
  'umd-bc': 'University of Maryland, Baltimore County',
  'ucfla': 'University of California, Fresno',
  'sjsu': 'San Jose State University',
  'sfsu': 'San Francisco State University',
  'cpp': 'Cal Poly Pomona',
  'slo': 'Cal Poly San Luis Obispo',
  // Canada
  'uoft': 'University of Toronto',
  'ubc': 'University of British Columbia',
  'mcgill': 'McGill University',
  'waterloo': 'University of Waterloo',
  'sfu': 'Simon Fraser University',
  'alberta': 'University of Alberta',
  'mcmaster': 'McMaster University',
  'queensu': 'Queen\'s University',

  // UK
  'oxford': 'University of Oxford',
  'cambridge': 'University of Cambridge',
  'imperial': 'Imperial College London',
  'ucl': 'University College London',
  'edinburgh': 'University of Edinburgh',
  'kcl': 'King\'s College London',
  'manchester': 'University of Manchester',
  'bristol': 'University of Bristol',
  'warwick': 'University of Warwick',
  'glasgow': 'University of Glasgow',

  // Europe (non-UK)
  'eth': 'ETH Zurich',
  'epfl': 'École Polytechnique Fédérale de Lausanne',
  'tum': 'Technical University of Munich',
  'tu-berlin': 'Technical University of Berlin',
  'sorbonne': 'Sorbonne University',
  'ens': 'École Normale Supérieure',
  'tudelft': 'Delft University of Technology',
  'kth': 'KTH Royal Institute of Technology',
  'chalmers': 'Chalmers University of Technology',
  'upc': 'Polytechnic University of Catalonia',
  'polimi': 'Polytechnic University of Milan',
  'sapienza': 'Sapienza University of Rome',

  // Asia
  'sjtu': 'Shanghai Jiao Tong University',
  'hkust': 'Hong Kong University of Science and Technology',
  'hku': 'University of Hong Kong',
  'cuhk': 'Chinese University of Hong Kong',
  'ntu': 'National Taiwan University',
  'ntu-sg': 'Nanyang Technological University',
  'nus': 'National University of Singapore',
  'kaist': 'Korea Advanced Institute of Science and Technology',
  'postech': 'Pohang University of Science and Technology',
  'iitb': 'Indian Institute of Technology Bombay',
  'iitd': 'Indian Institute of Technology Delhi',
  'iitk': 'Indian Institute of Technology Kanpur',
  'iisc': 'Indian Institute of Science',

  // Australia
  'anu': 'Australian National University',
  'unsw': 'University of New South Wales',
  'usyd': 'University of Sydney',
  'unimelb': 'University of Melbourne',
  'uq': 'University of Queensland',

  // Middle East
  'weizmann': 'Weizmann Institute of Science',
  'technion': 'Technion-Israel Institute of Technology',
  'tau': 'Tel Aviv University',
  'kaust': 'King Abdullah University of Science and Technology',
  'aus': 'American University of Sharjah'

};

export const conferenceAliases = {
  'neurips': 'nips',
  // CSRankings files CHI under "chiconf"; "chi" alone is the HCI area's key.
  'chi conference': 'chiconf',
  'siggraph asia': 'siggraph-asia'
};


export const nextTier = {
  'ase': true,
  'issta': true,
  'icde': true,
  'pods': true,
  'hpca': true,
  'ndss': true,
  'eurosys': true,
  'eurographics': true,
  'fast': true,
  'usenixatc': true,
  'icfp': true,
  'oopsla': true,
  'kdd': true
};

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
        turingAwardYear: turingByName.get(name) || null,
        acmFellowYear: acmFellowByName.get(name) || null,
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

  authorInfo.forEach(row => {
    const annotatedName = row.name.trim();
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
        area: row.area,
        year: parseInt(row.year),
        count: parseFloat(row.count),
        adjustedcount: parseFloat(row.adjustedcount)
      });
    }
  });

  institutions.forEach(row => {
    const name = row.institution.trim();
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
        historyMap: mergeAffiliationHistory(history, manual),
        aliasMap: aliases || {}
      }))
      .catch(error => {
        affiliationDataPromise = null;
        throw error;
      });
  }

  return affiliationDataPromise;
}

// Map conferences to top-level areas (from csrankings.ts)
export const parentMap = {
  'aaai': 'ai', 'ijcai': 'ai',
  'cvpr': 'vision', 'eccv': 'vision', 'iccv': 'vision',
  'icml': 'mlmining', 'iclr': 'mlmining', 'kdd': 'mlmining', 'nips': 'mlmining',
  'acl': 'nlp', 'emnlp': 'nlp', 'naacl': 'nlp',
  'sigir': 'inforet', 'www': 'inforet',
  'asplos': 'arch', 'isca': 'arch', 'micro': 'arch', 'hpca': 'arch',
  'ccs': 'sec', 'oakland': 'sec', 'usenixsec': 'sec', 'ndss': 'sec',
  'vldb': 'mod', 'sigmod': 'mod', 'icde': 'mod', 'pods': 'mod',
  'dac': 'da', 'iccad': 'da',
  'emsoft': 'bed', 'rtas': 'bed', 'rtss': 'bed',
  'sc': 'hpc', 'hpdc': 'hpc', 'ics': 'hpc',
  'mobicom': 'mobile', 'mobisys': 'mobile', 'sensys': 'mobile',
  'imc': 'metrics', 'sigmetrics': 'metrics',
  'osdi': 'ops', 'sosp': 'ops', 'eurosys': 'ops', 'fast': 'ops', 'usenixatc': 'ops',
  'popl': 'plan', 'pldi': 'plan', 'oopsla': 'plan', 'icfp': 'plan',
  'fse': 'soft', 'icse': 'soft', 'ase': 'soft', 'issta': 'soft',
  'nsdi': 'comm', 'sigcomm': 'comm',
  'siggraph': 'graph', 'siggraph-asia': 'graph', 'eurographics': 'graph',
  'focs': 'act', 'soda': 'act', 'stoc': 'act',
  'crypto': 'crypt', 'eurocrypt': 'crypt',
  'cav': 'log', 'lics': 'log',
  'ismb': 'bio', 'recomb': 'bio',
  'ec': 'ecom', 'wine': 'ecom',
  'chiconf': 'chi', 'ubicomp': 'chi', 'uist': 'chi',
  'icra': 'robotics', 'iros': 'robotics', 'rss': 'robotics',
  'vis': 'visualization', 'vr': 'visualization',
  'sigcse': 'csed'
};

// CORE A* conferences
export const coreAStarMap = {
  // AI
  'aaai': 'ai', 'ijcai': 'ai', 'aamas': 'ai', 'kr': 'ai', 'icaps': 'ai',
  // ML
  'icml': 'mlmining', 'nips': 'mlmining', 'iclr': 'mlmining', 'kdd': 'mlmining', 'colt': 'mlmining', 'icdm': 'mlmining',
  // CV
  'cvpr': 'vision', 'iccv': 'vision', 'eccv': 'vision',
  // NLP
  'acl': 'nlp', 'emnlp': 'nlp',
  // Security
  'oakland': 'sec', 'usenixsec': 'sec', 'ccs': 'sec', 'ndss': 'sec',
  // Systems & Architecture
  'osdi': 'ops', 'sosp': 'ops', 'isca': 'arch', 'asplos': 'arch', 'hpca': 'arch',
  // Theory & Logic
  'stoc': 'act', 'focs': 'act', 'soda': 'act', 'cav': 'log', 'lics': 'log', 'podc': 'act',
  // HCI
  'chiconf': 'chi', 'uist': 'chi',
  // Networks
  'sigcomm': 'comm', 'infocom': 'comm', 'sensys': 'mobile', 'mobicom': 'mobile', 'percom': 'mobile', 'ipsn': 'mobile',
  // Graphics & Multimedia
  'siggraph': 'graph', 'siggraph-asia': 'graph', 'acmmm': 'graph', 'vr': 'graph', 'ismar': 'graph',
  // SE
  'icse': 'soft', 'fse': 'soft', 'ase': 'soft',
  // PL
  'popl': 'plan', 'pldi': 'plan',
  // Databases / Info Retrieval
  'sigmod': 'mod', 'vldb': 'mod', 'icde': 'mod', 'pods': 'mod', 'sigir': 'inforet', 'www': 'inforet',
  // Measurement / Performance
  'sigmetrics': 'metrics',
  // RT
  'rtss': 'bed',
  // Economics
  'ec': 'ecom'
};

// CORE A venues must map to a CSRankings research area. Using booleans here
// caused venue identifiers such as "pets" to leak into charts as fake areas.
export const coreAMap = {
  'acsac': 'sec', 'aied': 'csed', 'aistats': 'mlmining', 'alenex': 'act', 'asiacrypt': 'crypt', 'assets': 'chi',
  'bmvc': 'vision', 'bpm': 'soft', 'cade': 'log', 'caise': 'soft', 'ccc': 'act', 'cgo': 'arch', 'ches': 'crypt',
  'cidr': 'mod', 'cikm': 'inforet', 'conext': 'comm', 'cp': 'act', 'cscw': 'chi', 'csf': 'sec', 'dis': 'chi',
  'disc': 'act', 'dsn': 'ops', 'eacl': 'nlp', 'ease': 'soft', 'ecai': 'ai', 'ecir': 'inforet', 'ecoop': 'plan',
  'er': 'mod', 'esa': 'act', 'esem': 'soft', 'esop': 'plan', 'esorics': 'sec', 'eurosys': 'ops', 'fast': 'ops',
  'fc': 'crypt', 'foga': 'ai', 'fpga': 'da', 'gd': 'visualization', 'gecco': 'ai', 'hotos': 'ops', 'hpdc': 'hpc',
  'iccad': 'da', 'icdar': 'vision', 'icdcs': 'ops', 'icdt': 'mod', 'icer': 'csed', 'icfp': 'plan', 'icme': 'graph',
  'ics': 'hpc', 'icsa': 'soft', 'icsoc': 'soft', 'icws': 'soft', 'icwsm': 'inforet', 'ijcar': 'log', 'imc': 'metrics',
  'interspeech': 'nlp', 'ipdps': 'hpc', 'iros': 'robotics', 'islped': 'da', 'ismb': 'bio', 'issre': 'soft',
  'issta': 'soft', 'iswc': 'inforet', 'itc': 'da', 'itcs': 'act', 'iui': 'chi', 'lak': 'csed', 'miccai': 'vision',
  'middleware': 'ops', 'mmsys': 'graph', 'msr': 'soft', 'naacl': 'nlp', 'oopsla': 'plan', 'pets': 'sec',
  'ppsn': 'ai', 're': 'soft', 'recsys': 'inforet', 'rtas': 'bed', 'rtss': 'bed', 'sat': 'log', 'sdm': 'mlmining',
  'seams': 'soft', 'sigcse': 'csed', 'sigspatial': 'mod', 'soups': 'sec', 'stacs': 'act', 'tacas': 'log',
  'uai': 'ai', 'usenixatc': 'ops', 'wacv': 'vision', 'wsdm': 'inforet'
};

export const CONFERENCE_SET_IDS = ['csrankings-default', 'csrankings', 'core', 'core-a'];

export function normalizeConferenceSet(confSet) {
  return CONFERENCE_SET_IDS.includes(confSet) ? confSet : 'csrankings-default';
}

export function publicationMatchesConferenceSet(publication, confSet = 'csrankings-default') {
  const selectedSet = normalizeConferenceSet(confSet);
  if (selectedSet === 'core') return Boolean(coreAStarMap[publication.area]);
  if (selectedSet === 'core-a') return Boolean(coreAStarMap[publication.area] || coreAMap[publication.area]);
  // Upstream scrapes venues it never assigns to an area (PoPETs, for example);
  // CSRankings itself counts none of them, so neither set may include one.
  if (!parentMap[publication.area]) return false;
  if (selectedSet === 'csrankings-default') return !nextTier[publication.area];
  return true;
}

export function getConferenceAreaMap(confSet = 'csrankings-default') {
  const selectedSet = normalizeConferenceSet(confSet);
  if (selectedSet === 'core' || selectedSet === 'core-a') {
    // CORE occasionally categorizes a venue differently from CSRankings, so
    // CORE's mapping must win when both contain the venue.
    return selectedSet === 'core-a'
      ? { ...parentMap, ...coreAStarMap, ...coreAMap }
      : { ...parentMap, ...coreAStarMap };
  }
  return parentMap;
}

// Get unique top-level areas
const topLevelAreas = [...new Set(Object.values(parentMap))];
const numAreas = topLevelAreas.length;

export function getPublicationSchools(professor, publication, historyMap = null, aliasMap = null) {
  const fallback = [professor.affiliation];
  const history = historyMap?.[professor.name];

  // Falling back to a professor's current school is only safe when no
  // historical record exists for that professor. OpenAlex histories can be
  // sparse; treating an uncovered old year as the current affiliation silently
  // moves old publications to the professor's present-day institution.
  if (!history || history.length === 0) return fallback;

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

// Stage 2: CSRankings' geometric mean over every top-level area.
function scoreSchools(schoolList) {
  schoolList.forEach(school => {
    const product = topLevelAreas.reduce((score, area) =>
      score * ((school.areaAdjustedCounts[area] || 0) + 1.0), 1.0);
    school.score = Math.round(10.0 * Math.pow(product, 1 / numAreas)) / 10.0;
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
export function filterByYears(data, startYear = DEFAULT_START_YEAR, endYear = DEFAULT_END_YEAR, region = 'us', historyMap = null, aliasMap = null, confSet = 'csrankings-default') {
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
