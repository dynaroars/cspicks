import Papa from 'papaparse';

const currentYear = new Date().getFullYear();
export const DEFAULT_START_YEAR = 2015;
export const DEFAULT_END_YEAR = currentYear;

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
  // Add more as needed
};

export const nextTier = {
  /* 'ase': true,
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
  'kdd': true */
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
