import Papa from 'papaparse';

const currentYear = new Date().getFullYear();
export const DEFAULT_END_YEAR = currentYear;
export const DEFAULT_START_YEAR = DEFAULT_END_YEAR - 10;

const GITHUB_RAW = 'https://raw.githubusercontent.com/dynaroars/cspicks/main/public';
let affiliationDataPromise = null;


export const schoolAliases = {
  'gmu': 'George Mason University',
  'cmu': 'Carnegie Mellon University',
  'mit': 'Massachusetts Institute of Technology',
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
};


export const nextTier = {
  'ase': true,
  'issta': true,
  'icde': true,
  'pods': true,
  'hpca': true,
  'ndss': true,
  'pets': true,
  'eurosys': true,
  'eurographics': true,
  'fast': true,
  'usenixatc': true,
  'icfp': true,
  'oopsla': true,
  'kdd': true
};

export async function loadData() {
  const [csrankings, authorInfo, institutions] = await Promise.all([
    fetchCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/csrankings.csv'),
    fetchCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/generated-author-info.csv'),
    fetchCsv('https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/institutions.csv')
  ]);

  const professors = {};
  const schools = {};

  csrankings.forEach(row => {
    if (row.name) {
      const name = row.name.trim();
      professors[name] = {
        name: name,
        affiliation: row.affiliation,
        homepage: row.homepage,
        scholarid: row.scholarid,
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
    const name = row.name.trim();
    if (professors[name]) {

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
  'ccs': 'sec', 'oakland': 'sec', 'usenixsec': 'sec', 'ndss': 'sec', 'pets': 'sec',
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

export const coreAMap = {
  'acsac': true, 'aied': true, 'aistats': true, 'alenex': true, 'asiacrypt': true, 'assets': true,
  'bmvc': true, 'bpm': true, 'cade': true, 'caise': true, 'ccc': true, 'cgo': true, 'ches': true,
  'cidr': true, 'cikm': true, 'conext': true, 'cp': true, 'cscw': true, 'csf': true, 'dis': true,
  'disc': true, 'dsn': true, 'eacl': true, 'ease': true, 'ecai': true, 'ecir': true, 'ecoop': true,
  'er': true, 'esa': true, 'esem': true, 'esop': true, 'esorics': true, 'eurosys': true, 'fast': true,
  'fc': true, 'foga': true, 'fpga': true, 'gd': true, 'gecco': true, 'hotos': true, 'hpdc': true,
  'iccad': true, 'icdar': true, 'icdcs': true, 'icdt': true, 'icer': true, 'icfp': true, 'icme': true,
  'ics': true, 'icsa': true, 'icsoc': true, 'icws': true, 'icwsm': true, 'ijcar': true, 'imc': true,
  'interspeech': true, 'ipdps': true, 'iros': true, 'islped': true, 'ismb': true, 'issre': true,
  'issta': true, 'iswc': true, 'itc': true, 'itcs': true, 'iui': true, 'lak': true, 'miccai': true,
  'middleware': true, 'mmsys': true, 'msr': true, 'naacl': true, 'oopsla': true, 'pets': true,
  'ppsn': true, 're': true, 'recsys': true, 'rtas': true, 'rtss': true, 'sat': true, 'sdm': true,
  'seams': true, 'sigcse': true, 'sigspatial': true, 'soups': true, 'stacs': true, 'tacas': true,
  'uai': true, 'usenixatc': true, 'wacv': true, 'wsdm': true
};

// Get unique top-level areas
const topLevelAreas = [...new Set(Object.values(parentMap))];
const numAreas = topLevelAreas.length;

export function getPublicationSchools(professor, publication, historyMap = null, aliasMap = null) {
  const fallback = [professor.affiliation];
  const matches = historyMap?.[professor.name]?.filter(segment =>
    publication.year >= segment.start && publication.year <= segment.end
  ) || [];

  if (matches.length === 0) return fallback;

  const schools = matches
    .map(segment => Object.prototype.hasOwnProperty.call(aliasMap || {}, segment.school)
      ? aliasMap[segment.school]
      : segment.school)
    .filter(Boolean);

  return schools.length > 0 ? [...new Set(schools)] : fallback;
}


export function filterByYears(data, startYear = DEFAULT_START_YEAR, endYear = DEFAULT_END_YEAR, region = 'us', historyMap = null, aliasMap = null, confSet = 'csrankings', useRaw = false) {
  const { professors, schools } = data;
  const filteredProfs = {};
  const filteredSchools = {};
  const hasHistoricalData = Boolean(historyMap && Object.keys(historyMap).length > 0);

  // Select conference map based on confSet
  const confMap = confSet === 'core' ? coreAStarMap : parentMap;

  // Helper to check if school is in selected region
  const isInRegion = (schoolName) => {
    const school = schools[schoolName];
    if (!school) {
      return region === 'world';
    }

    if (region === 'world') return true;
    if (region === 'us') return school.country === 'us';
    // For continents, check region field
    return school.region === region;
  };

  for (const name in professors) {
    const prof = professors[name];

    // Only include professors from schools in the selected region

    if (!hasHistoricalData && !isInRegion(prof.affiliation)) {
      continue;
    }

    const filteredPubs = prof.pubs.filter(p =>
      p.year >= startYear && p.year <= endYear
    );

    if (filteredPubs.length > 0) {
      let confFilteredPubs = filteredPubs;
      if (confSet === 'core') {
        confFilteredPubs = filteredPubs.filter(p => coreAStarMap[p.area]);
      } else if (confSet === 'core-a') {
        confFilteredPubs = filteredPubs.filter(p => coreAStarMap[p.area] || coreAMap[p.area]);
      } else if (confSet === 'csrankings-default') {
        confFilteredPubs = filteredPubs.filter(p => !nextTier[p.area]);
      }
      // else: confSet === 'csrankings', include all conferences (no filtering)

      const areaStats = {};
      const regionFilteredPubs = [];

      confFilteredPubs.forEach(pub => {
        const pubSchools = getPublicationSchools(
          prof,
          pub,
          hasHistoricalData ? historyMap : null,
          aliasMap
        ).filter(isInRegion);

        // A professor's regional totals should contain only publications credited
        // to a school in the selected region.
        if (pubSchools.length === 0) return;
        regionFilteredPubs.push(pub);

        const area = confMap[pub.area] || parentMap[pub.area] || pub.area;
        if (!areaStats[area]) {
          areaStats[area] = { count: 0, adjusted: 0 };
        }
        areaStats[area].count += pub.count;
        areaStats[area].adjusted += pub.adjustedcount;

        // Credit each school (only if in selected region)
        pubSchools.forEach(pubSchoolName => {
          if (!filteredSchools[pubSchoolName]) {
            filteredSchools[pubSchoolName] = {
              name: pubSchoolName,
              region: schools[pubSchoolName]?.region,
              country: schools[pubSchoolName]?.country,
              areas: {},
              areaAdjustedCounts: {},
              totalCount: 0,
              totalAdjusted: 0
            };
          }

          const school = filteredSchools[pubSchoolName];
          school.totalCount += pub.count;
          school.totalAdjusted += pub.adjustedcount;

          if (!school.areas[area]) {
            school.areas[area] = { count: 0, adjusted: 0, faculty: [] };
          }
          school.areas[area].count += pub.count;
          school.areas[area].adjusted += pub.adjustedcount;

          if (!school.areas[area].faculty.includes(name)) {
            school.areas[area].faculty.push(name);
          }

          // Geometric mean accumulator
          if (!school.areaAdjustedCounts[area]) {
            school.areaAdjustedCounts[area] = 0;
          }
          school.areaAdjustedCounts[area] += pub.adjustedcount;
        });
      });

      if (regionFilteredPubs.length > 0) {
        const totalCount = regionFilteredPubs.reduce((sum, p) => sum + p.count, 0);
        const totalAdjusted = regionFilteredPubs.reduce((sum, p) => sum + p.adjustedcount, 0);
        filteredProfs[name] = {
          ...prof,
          pubs: regionFilteredPubs,
          areas: areaStats,
          totalCount,
          totalAdjusted,
          totalPapers: Math.ceil(totalCount)
        };
      }
    }
  }

  // Compute Geometric Mean Score for Ranking
  const schoolList = Object.values(filteredSchools).filter(s => s.name);

  schoolList.forEach(school => {
    let score = 1.0;
    topLevelAreas.forEach(area => {
      const val = useRaw ? (school.areas[area]?.count || 0) : (school.areaAdjustedCounts[area] || 0);
      score *= (val + 1.0);
    });
    // Round to 1 decimal place
    school.score = Math.round(10.0 * Math.pow(score, 1 / numAreas)) / 10.0;
  });

  // Sort by Geometric Mean Score, then alphabetically for ties
  schoolList.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.name < b.name) return -1;
    if (b.name < a.name) return 1;
    return 0;
  });

  // Standard Competition Ranking
  let rank = 0;
  let ties = 1;
  let oldScore = -1;
  schoolList.forEach((school, index) => {
    if (school.score !== oldScore) {
      rank = rank + ties;
      ties = 1;
    } else {
      ties++;
    }
    school.rank = rank;
    oldScore = school.score;
    filteredSchools[school.name] = school;
  });

  // Compute Per-Area Rankings
  topLevelAreas.forEach(area => {
    // Get all schools that have this area
    const getAreaValue = (school) => useRaw
      ? (school.areas[area]?.count || 0)
      : (school.areas[area]?.adjusted || 0);
    const schoolsWithArea = schoolList
      .filter(s => getAreaValue(s) > 0)
      .sort((a, b) => getAreaValue(b) - getAreaValue(a));

    // Assign standard competition ranks, including ties.
    let areaRank = 0;
    let previousValue = null;
    schoolsWithArea.forEach((school, idx) => {
      const value = getAreaValue(school);
      if (value !== previousValue) areaRank = idx + 1;
      if (!school.areaRanks) school.areaRanks = {};
      school.areaRanks[area] = areaRank;
      previousValue = value;
    });
  });

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
