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
};

// Maps nationality keywords to { lastNames: [], countries: [] }
// lastNames: common surnames for that ethnicity
// countries: country codes to show schools from (optional)
export const nationalityAliases = {
  // --- ASIAN ---
  'vietnam': {
    lastNames: ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Vo', 'Dang', 'Bui', 'Do', 'Ho', 'Ngo', 'Duong', 'Ly'],
    countries: ['vn']
  },
  'pakistan': {
    lastNames: ['Khan', 'Ahmed', 'Ali', 'Hussain', 'Hassan', 'Shah', 'Malik', 'Iqbal', 'Raza', 'Syed', 'Qureshi', 'Mirza', 'Butt', 'Chaudhry', 'Sheikh', 'Aslam', 'Abbasi', 'Javed', 'Farooq', 'Rehman'],
    countries: ['pk']
  },
  'indian': {
    lastNames: ['Patel', 'Sharma', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Rao', 'Jain', 'Agarwal', 'Chopra', 'Mehta', 'Bhatia', 'Kapoor', 'Verma', 'Malhotra', 'Saxena', 'Nair', 'Iyer', 'Pillai', 'Menon'],
    countries: ['in']
  },
  'chinese': {
    lastNames: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'Lin', 'He', 'Gao', 'Liang'],
    countries: ['cn', 'hk', 'tw']
  },
  'korean': {
    lastNames: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Shin', 'Seo', 'Kwon', 'Ko', 'Oh', 'Yoo', 'Moon', 'Song', 'Ahn'],
    countries: ['kr']
  },
  'japanese': {
    lastNames: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Mori'],
    countries: ['jp']
  },
  'iranian': {
    lastNames: ['Ahmadi', 'Hosseini', 'Mohammadi', 'Karimi', 'Hashemi', 'Mousavi', 'Rahimi', 'Moradi', 'Jafari', 'Rezaei', 'Safari', 'Ebrahimi', 'Salehi', 'Sadeghi', 'Shirazi', 'Tehrani', 'Tabatabaei', 'Nasseri', 'Tavakoli', 'Najafi'],
    countries: ['ir']
  },

  // --- ENGLISH / ANGLOSPHERE ---
  'usa': {
    lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'],
    countries: ['us']
  },
  'american': {
    lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'],
    countries: ['us']
  },
  'british': {
    lastNames: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts', 'Green', 'Hall', 'Wood', 'Harris', 'Clarke'],
    countries: ['gb']
  },
  'uk': {
    lastNames: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts', 'Green', 'Hall', 'Wood', 'Harris', 'Clarke'],
    countries: ['gb']
  },

  // --- HISPANIC / LATIN AMERICA / SPAIN ---
  'spanish': {
    lastNames: ['Garcia', 'Rodriguez', 'Gonzalez', 'Fernandez', 'Lopez', 'Martinez', 'Sanchez', 'Perez', 'Gomez', 'Martin', 'Jimenez', 'Ruiz', 'Hernandez', 'Diaz', 'Moreno', 'Muñoz', 'Alvarez', 'Romero', 'Alonso', 'Gutierrez'],
    countries: ['es', 'mx', 'co', 'ar', 'pe', 've', 'cl', 'ec', 'gt', 'cu']
  },
  'hispanic': {
    lastNames: ['Garcia', 'Rodriguez', 'Gonzalez', 'Fernandez', 'Lopez', 'Martinez', 'Sanchez', 'Perez', 'Gomez', 'Martin', 'Jimenez', 'Ruiz', 'Hernandez', 'Diaz', 'Moreno', 'Muñoz', 'Alvarez', 'Romero', 'Alonso', 'Gutierrez'],
    countries: ['es', 'mx', 'co', 'ar', 'pe', 've', 'cl', 'ec', 'gt', 'cu']
  },

  // --- EUROPEAN ---
  'french': {
    lastNames: ['Martin', 'Bernard', 'Thomas', 'Petit', 'Robert', 'Richard', 'Durand', 'Dubois', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Lefebvre', 'Leroy', 'Roux', 'David', 'Bertrand', 'Morel', 'Fournier', 'Girard'],
    countries: ['fr', 'be']
  },
  'german': {
    lastNames: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann'],
    countries: ['de', 'at', 'ch']
  },
  'italian': {
    lastNames: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti'],
    countries: ['it']
  },
  'russian': {
    lastNames: ['Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Sokolov', 'Lebedev', 'Kozlov', 'Novikov', 'Morozov', 'Petrov', 'Volkov', 'Solovyov', 'Vasilyev', 'Zaytsev', 'Pavlov', 'Semyonov', 'Golubev', 'Vinogradov', 'Bogdanov', 'Vorobyov'],
    countries: ['ru', 'by']
  },
  'portuguese': {
    lastNames: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa'],
    countries: ['pt', 'br']
  },
  'brazilian': {
    lastNames: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa'],
    countries: ['br']
  },

  // --- MIDDLE EASTERN / ARABIC ---
  'arabic': {
    lastNames: ['Mohamed', 'Ahmed', 'Ali', 'Youssef', 'Ibrahim', 'Mahmoud', 'Hassan', 'Abdallah', 'Hussein', 'Saleh', 'Saad', 'Fawzi', 'Nasser', 'Khalil', 'Ismail', 'Zayed', 'Sultan', 'Mustafa', 'Osman', 'Hamad'],
    countries: ['eg', 'sa', 'ae', 'kw', 'qa', 'jo', 'lb', 'om']
  },

  // --- AFRICAN ---
  'nigerian': {
    lastNames: ['Musa', 'Ibrahim', 'Abdullahi', 'Ali', 'Okafor', 'Adebayo', 'Okeke', 'Balogun', 'Eze', 'Obi', 'Olawale', 'Okonkwo', 'Nwachukwu', 'Abubakar', 'Danjuma', 'Bello', 'Okoro', 'Lawal', 'Umar', 'Sani'],
    countries: ['ng']
  },

  // --- SOUTHEAST ASIAN (Additional) ---
  'filipino': {
    lastNames: ['De la Cruz', 'Garcia', 'Reyes', 'Ramos', 'Mendoza', 'Santos', 'Flores', 'Gonzales', 'Bautista', 'Villanueva', 'Fernandez', 'Cruz', 'De Guzman', 'Lopez', 'Perez', 'Castillo', 'Rivera', 'Aquino', 'Del Rosario', 'Sanchez'],
    countries: ['ph']
  }
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
      if (row.area === 'pets') return;

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

export function filterByYears(data, startYear = DEFAULT_START_YEAR, endYear = DEFAULT_END_YEAR, region = 'us', historyMap = null, aliasMap = null) {
  const { professors, schools } = data;
  const filteredProfs = {};
  const filteredSchools = {};

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
        // 1. Stats for Professor Object
        const area = parentMap[pub.area] || pub.area;
        if (!areaStats[area]) {
          areaStats[area] = { count: 0, adjusted: 0 };
        }
        areaStats[area].count += pub.count;
        areaStats[area].adjusted += pub.adjustedcount;

        // 2. Stats for School (Historical Attribution)
        let pubSchoolName = prof.affiliation;

        // Check history override
        if (historyMap && historyMap[name]) {
          const h = historyMap[name].find(seg => pub.year >= seg.start && pub.year <= seg.end);
          if (h) {
            // Normalize OpenAlex school name using aliases
            if (aliasMap && Object.prototype.hasOwnProperty.call(aliasMap, h.school)) {
              pubSchoolName = aliasMap[h.school];
            } else {
              pubSchoolName = h.school;
            }
          } else {
            pubSchoolName = null;
          }
        }

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

      filteredProfs[name] = {
        ...prof,
        pubs: filteredPubs,
        areas: areaStats,
        totalCount,
        totalAdjusted,
        totalPapers
      };
    }
  }

  // Compute Geometric Mean Score for Ranking
  const schoolList = Object.values(filteredSchools).filter(s => s.name);

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

  // Compute Per-Area Rankings
  topLevelAreas.forEach(area => {
    // Get all schools that have this area
    const schoolsWithArea = schoolList
      .filter(s => s.areas[area] && s.areas[area].adjusted > 0)
      .sort((a, b) => (b.areas[area]?.adjusted || 0) - (a.areas[area]?.adjusted || 0));

    // Assign ranks
    schoolsWithArea.forEach((school, idx) => {
      if (!school.areaRanks) school.areaRanks = {};
      school.areaRanks[area] = idx + 1;
    });
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
