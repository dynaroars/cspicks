import Papa from 'papaparse';

const currentYear = new Date().getFullYear();
export const DEFAULT_START_YEAR = 2015;
export const DEFAULT_END_YEAR = currentYear;

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
    fetchCsv('https://raw.githubusercontent.com/dynaroars/CSrankings/gh-pages/csrankings.csv'),
    fetchCsv('https://raw.githubusercontent.com/dynaroars/CSrankings/gh-pages/generated-author-info.csv'),
    fetchCsv('https://raw.githubusercontent.com/dynaroars/CSrankings/gh-pages/institutions.csv')
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
      if (nextTier[row.area]) {
        return;
      }

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

// Get unique top-level areas
const topLevelAreas = [...new Set(Object.values(parentMap))];
const numAreas = topLevelAreas.length;

export function filterByYears(data, startYear = DEFAULT_START_YEAR, endYear = DEFAULT_END_YEAR, region = 'us') {
  const { professors, schools } = data;
  const filteredProfs = {};
  const filteredSchools = {};

  // Helper to check if school is in selected region
  const isInRegion = (schoolName) => {
    const school = schools[schoolName];
    if (!school) return false;

    if (region === 'world') return true;
    if (region === 'us') return school.country === 'us';
    // For continents, check region field
    return school.region === region;
  };

  for (const name in professors) {
    const prof = professors[name];

    // Only include professors from schools in the selected region
    if (!isInRegion(prof.affiliation)) {
      continue;
    }

    const filteredPubs = prof.pubs.filter(p =>
      p.year >= startYear && p.year <= endYear
    );

    if (filteredPubs.length > 0) {
      const totalCount = filteredPubs.reduce((sum, p) => sum + p.count, 0);
      const totalAdjusted = filteredPubs.reduce((sum, p) => sum + p.adjustedcount, 0);
      const totalPapers = Math.ceil(totalCount);

      const areaStats = {};
      filteredPubs.forEach(pub => {
        // Use top-level area for grouping if possible, otherwise fallback to pub area
        const area = parentMap[pub.area] || pub.area;

        if (!areaStats[area]) {
          areaStats[area] = { count: 0, adjusted: 0 };
        }
        areaStats[area].count += pub.count;
        areaStats[area].adjusted += pub.adjustedcount;
      });

      filteredProfs[name] = {
        ...prof,
        pubs: filteredPubs,
        areas: areaStats,
        totalCount,
        totalAdjusted,
        totalPapers
      };

      const schoolName = prof.affiliation;
      if (!filteredSchools[schoolName]) {
        filteredSchools[schoolName] = {
          name: schoolName,
          region: schools[schoolName]?.region,
          country: schools[schoolName]?.country,
          areas: {},
          areaAdjustedCounts: {}, // For geometric mean calculation
          totalCount: 0,
          totalAdjusted: 0
        };
      }

      const school = filteredSchools[schoolName];
      school.totalCount += totalCount;
      school.totalAdjusted += totalAdjusted;

      Object.entries(areaStats).forEach(([area, stats]) => {
        if (!school.areas[area]) {
          school.areas[area] = { count: 0, adjusted: 0, faculty: [] };
        }
        school.areas[area].count += stats.count;
        school.areas[area].adjusted += stats.adjusted;
        if (!school.areas[area].faculty.includes(name)) {
          school.areas[area].faculty.push(name);
        }

        // Accumulate for geometric mean (by top-level area)
        if (!school.areaAdjustedCounts[area]) {
          school.areaAdjustedCounts[area] = 0;
        }
        school.areaAdjustedCounts[area] += stats.adjusted;
      });
    }
  }

  // Compute Geometric Mean Score for Ranking
  const schoolList = Object.values(filteredSchools);

  schoolList.forEach(school => {
    let score = 1.0;
    topLevelAreas.forEach(area => {
      const adjustedCount = school.areaAdjustedCounts[area] || 0;
      score *= (adjustedCount + 1.0);
    });
    school.score = Math.pow(score, 1 / numAreas);
  });

  // Sort by Geometric Mean Score
  schoolList.sort((a, b) => b.score - a.score);

  schoolList.forEach((school, index) => {
    school.rank = index + 1;
    filteredSchools[school.name] = school;
  });

  return { professors: filteredProfs, schools: filteredSchools };
}

async function fetchCsv(url) {
  const response = await fetch(url);
  const text = await response.text();
  return new Promise((resolve) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data)
    });
  });
}
