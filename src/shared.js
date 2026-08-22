export const areaLabels = {
  'ai': 'AI',
  'vision': 'Computer Vision',
  'mlmining': 'Machine Learning',
  'nlp': 'NLP',
  'inforet': 'Info Retrieval',
  'arch': 'Architecture',
  'sec': 'Security',
  'mod': 'Databases',
  'da': 'Design Automation',
  'bed': 'Embedded & Real-Time',
  'hpc': 'HPC',
  'mobile': 'Mobile Computing',
  'metrics': 'Measurement',
  'ops': 'Operating Systems',
  'plan': 'Programming Languages',
  'soft': 'Software Engineering',
  'comm': 'Networks',
  'graph': 'Graphics',
  'act': 'Algorithms',
  'crypt': 'Cryptography',
  'log': 'Logic & Verification',
  'bio': 'Comp. Biology',
  'ecom': 'Econ & Computation',
  'chi': 'HCI',
  'robotics': 'Robotics',
  'visualization': 'Visualization',
  'csed': 'CS Education'
};

export const conferenceLabels = {
  nips: 'NeurIPS',
  chiconf: 'CHI',
  'siggraph-asia': 'SIGGRAPH Asia',
  usenixsec: 'USENIX Security',
  usenixatc: 'USENIX ATC',
  oakland: 'IEEE S&P',
  pets: 'PETS (Privacy Enhancing Technologies Symposium)'
};

// Spelled-out venue names for the CSRankings venue set, so a result header can
// say what an abbreviation stands for.
const conferenceFullNames = {
  aaai: 'AAAI Conference on Artificial Intelligence',
  ijcai: 'International Joint Conference on Artificial Intelligence',
  cvpr: 'Conference on Computer Vision and Pattern Recognition',
  eccv: 'European Conference on Computer Vision',
  iccv: 'International Conference on Computer Vision',
  icml: 'International Conference on Machine Learning',
  iclr: 'International Conference on Learning Representations',
  kdd: 'Conference on Knowledge Discovery and Data Mining',
  nips: 'Conference on Neural Information Processing Systems',
  acl: 'Annual Meeting of the Association for Computational Linguistics',
  emnlp: 'Conference on Empirical Methods in Natural Language Processing',
  naacl: 'Conference of the North American Chapter of the ACL',
  sigir: 'Conference on Research and Development in Information Retrieval',
  www: 'The Web Conference',
  asplos: 'Architectural Support for Programming Languages and Operating Systems',
  isca: 'International Symposium on Computer Architecture',
  micro: 'International Symposium on Microarchitecture',
  hpca: 'International Symposium on High-Performance Computer Architecture',
  ccs: 'Conference on Computer and Communications Security',
  oakland: 'IEEE Symposium on Security and Privacy',
  usenixsec: 'USENIX Security Symposium',
  ndss: 'Network and Distributed System Security Symposium',
  pets: 'Privacy Enhancing Technologies Symposium',
  vldb: 'International Conference on Very Large Data Bases',
  sigmod: 'International Conference on Management of Data',
  icde: 'International Conference on Data Engineering',
  pods: 'Symposium on Principles of Database Systems',
  dac: 'Design Automation Conference',
  iccad: 'International Conference on Computer-Aided Design',
  emsoft: 'International Conference on Embedded Software',
  rtas: 'Real-Time and Embedded Technology and Applications Symposium',
  rtss: 'Real-Time Systems Symposium',
  sc: 'International Conference for High Performance Computing, Networking, Storage and Analysis',
  hpdc: 'International Symposium on High-Performance Parallel and Distributed Computing',
  ics: 'International Conference on Supercomputing',
  mobicom: 'International Conference on Mobile Computing and Networking',
  mobisys: 'International Conference on Mobile Systems, Applications, and Services',
  sensys: 'Conference on Embedded Networked Sensor Systems',
  imc: 'Internet Measurement Conference',
  sigmetrics: 'International Conference on Measurement and Modeling of Computer Systems',
  osdi: 'Symposium on Operating Systems Design and Implementation',
  sosp: 'Symposium on Operating Systems Principles',
  eurosys: 'European Conference on Computer Systems',
  fast: 'Conference on File and Storage Technologies',
  usenixatc: 'USENIX Annual Technical Conference',
  popl: 'Symposium on Principles of Programming Languages',
  pldi: 'Conference on Programming Language Design and Implementation',
  oopsla: 'Conference on Object-Oriented Programming, Systems, Languages, and Applications',
  icfp: 'International Conference on Functional Programming',
  fse: 'Symposium on the Foundations of Software Engineering',
  icse: 'International Conference on Software Engineering',
  ase: 'International Conference on Automated Software Engineering',
  issta: 'International Symposium on Software Testing and Analysis',
  nsdi: 'Symposium on Networked Systems Design and Implementation',
  sigcomm: 'Conference on Applications, Technologies, Architectures, and Protocols for Computer Communication',
  siggraph: 'Conference on Computer Graphics and Interactive Techniques',
  'siggraph-asia': 'SIGGRAPH Asia Conference',
  eurographics: 'Annual Conference of the European Association for Computer Graphics',
  focs: 'Symposium on Foundations of Computer Science',
  soda: 'Symposium on Discrete Algorithms',
  stoc: 'Symposium on Theory of Computing',
  crypto: 'International Cryptology Conference',
  eurocrypt: 'International Conference on the Theory and Applications of Cryptographic Techniques',
  cav: 'International Conference on Computer Aided Verification',
  lics: 'Symposium on Logic in Computer Science',
  ismb: 'Conference on Intelligent Systems for Molecular Biology',
  recomb: 'Conference on Research in Computational Molecular Biology',
  ec: 'Conference on Economics and Computation',
  wine: 'Conference on Web and Internet Economics',
  chiconf: 'Conference on Human Factors in Computing Systems',
  ubicomp: 'Conference on Ubiquitous and Pervasive Computing',
  uist: 'Symposium on User Interface Software and Technology',
  icra: 'International Conference on Robotics and Automation',
  iros: 'International Conference on Intelligent Robots and Systems',
  rss: 'Robotics: Science and Systems',
  vis: 'IEEE Visualization Conference',
  vr: 'IEEE Conference on Virtual Reality and 3D User Interfaces',
  sigcse: 'Technical Symposium on Computer Science Education'
};

/** "ICSE (International Conference on Software Engineering)" when known. */
export function getConferenceFullLabel(key) {
  const label = getConferenceLabel(key);
  const full = conferenceFullNames[key];
  return full && !label.includes('(') ? `${label} (${full})` : label;
}

const VALID_REGIONS = new Set(['world', 'us', 'europe', 'asia', 'canada', 'australasia']);
const EUROPE_COUNTRIES = new Set('AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH TR UA GB VA'.split(' '));
const ASIA_COUNTRIES = new Set('AF AM AZ BH BD BT BN KH CN GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP KR OM PK PS PH QA SA SG LK SY TW TJ TH TL TM AE UZ VN YE'.split(' '));
const AUSTRALASIA_COUNTRIES = new Set('AU NZ FJ PG SB VU WS TO KI FM MH PW NR TV'.split(' '));
const REGION_STORAGE_KEY = 'cspicks:preferred-region';

export function detectRegionFromLocales(locales = []) {
  for (const locale of locales) {
    try {
      const parsedLocale = new Intl.Locale(locale);
      const region = (parsedLocale.region || parsedLocale.maximize().region)?.toUpperCase();
      if (!region) continue;
      if (region === 'US') return 'us';
      if (region === 'CA') return 'canada';
      if (EUROPE_COUNTRIES.has(region)) return 'europe';
      if (ASIA_COUNTRIES.has(region)) return 'asia';
      if (AUSTRALASIA_COUNTRIES.has(region)) return 'australasia';
      return 'world';
    } catch {
      // Try the next browser locale when a malformed locale is present.
    }
  }
  return 'world';
}

export function getInitialRegion(search = globalThis.location?.search || '') {
  const queryRegion = new URLSearchParams(search).get('region');
  if (VALID_REGIONS.has(queryRegion)) return queryRegion;
  try {
    const stored = globalThis.localStorage?.getItem(REGION_STORAGE_KEY);
    if (VALID_REGIONS.has(stored)) return stored;
  } catch {
    // Privacy modes can disable storage.
  }
  const locales = globalThis.navigator?.languages?.length
    ? globalThis.navigator.languages
    : [globalThis.navigator?.language].filter(Boolean);
  return detectRegionFromLocales(locales);
}

export function rememberRegion(region) {
  if (!VALID_REGIONS.has(region)) return;
  try {
    globalThis.localStorage?.setItem(REGION_STORAGE_KEY, region);
  } catch {
    // Region selection still works for the current page without storage.
  }
}

export function getConferenceLabel(key) {
  return conferenceLabels[key] || key.toUpperCase();
}

export function getChartColors() {
  const isDark = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
  return {
    text: isDark ? '#e0e0e0' : '#666666',
    grid: isDark ? '#3d4043' : '#e5e7eb',
    title: isDark ? '#ffffff' : '#111111'
  };
}

export function updateChartDefaults(Chart) {
  const colors = getChartColors();
  Chart.defaults.color = colors.text;
  Chart.defaults.borderColor = colors.grid;
  Chart.defaults.plugins.title.color = colors.title;
  Chart.defaults.plugins.legend.labels.color = colors.text;
  Chart.defaults.scale.ticks.color = colors.text;
  Chart.defaults.scale.title.color = colors.text;
  if (Chart.defaults.plugins?.tooltip) {
    Chart.defaults.plugins.tooltip.backgroundColor = '#2d2d2d';
    Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
    Chart.defaults.plugins.tooltip.bodyColor = '#ffffff';
    Chart.defaults.plugins.tooltip.footerColor = '#ffffff';
    Chart.defaults.plugins.tooltip.padding = { top: 6, bottom: 6, left: 10, right: 10 };
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.plugins.tooltip.titleFont = { family: 'Inter, sans-serif', size: 12, weight: '600' };
    Chart.defaults.plugins.tooltip.bodyFont = { family: 'Inter, sans-serif', size: 12, weight: '400' };
    Chart.defaults.plugins.tooltip.footerFont = { family: 'Inter, sans-serif', size: 12, weight: '400' };
    Chart.defaults.plugins.tooltip.boxPadding = 4;
  }
}

/**
 * Ranks how well `text` matches a lowercased `query` (lower is better,
 * Infinity means no match). The last tier lets every query token match the
 * start of some word, so "michael goodrich" still finds "Michael T. Goodrich".
 */
export function scoreSuggestionMatch(text, query) {
  const normalized = text.toLowerCase();
  if (normalized.startsWith(query)) return 0;
  const words = normalized.split(/\s+/);
  if (words.some(word => word.startsWith(query))) return 1;
  if (normalized.includes(query)) return 2;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every(token => words.some(word => word.startsWith(token)))) return 3;
  return Infinity;
}

export function cleanName(name) {
  return name.replace(/\s+\d+$/, '');
}

const institutionShortNames = {
  // Keys are CSRankings' own spellings, which are not always the institution's
  // canonical name ("Univ. of California - Berkeley", not "University of
  // California, Berkeley"). Every key here is verified to exist in the roster;
  // entries that do not match are silently dead, which is how the whole
  // University of California set went unshortened for a while.
  'Carnegie Mellon University': 'CMU',
  'George Mason University': 'GMU',
  'Massachusetts Inst. of Technology': 'MIT',
  'Georgia Institute of Technology': 'Georgia Tech',
  'California Inst. of Technology': 'Caltech',
  'Illinois Institute of Technology': 'Illinois Tech',
  'Univ. of Illinois at Urbana-Champaign': 'UIUC',
  'Univ. of Maryland - College Park': 'UMD',
  'Univ. of Maryland - Baltimore County': 'UMBC',
  'University of Texas at Austin': 'UT Austin',
  'University of Wisconsin - Madison': 'UW–Madison',
  'University of Michigan': 'UMich',
  'University of Pennsylvania': 'Penn',
  'Pennsylvania State University': 'Penn State',
  'University of Southern California': 'USC',
  'University of Washington': 'UW',
  'University of Chicago': 'UChicago',
  'University of North Carolina': 'UNC',
  'New York University': 'NYU',
  'Johns Hopkins University': 'Johns Hopkins',
  'Stony Brook University': 'Stony Brook',
  'Univ. of Massachusetts Amherst': 'UMass Amherst',
  'Univ. of California - Berkeley': 'UC Berkeley',
  'Univ. of California - Los Angeles': 'UCLA',
  'Univ. of California - San Diego': 'UCSD',
  'Univ. of California - Santa Barbara': 'UCSB',
  'Univ. of California - Santa Cruz': 'UC Santa Cruz',
  'Univ. of California - Irvine': 'UC Irvine',
  'Univ. of California - Davis': 'UC Davis',
  'Univ. of California - Riverside': 'UC Riverside',
  'Univ. of California - Merced': 'UC Merced'
};


// CSRankings publishes a flag per country alongside its institution data.
const CSRANKINGS_FLAGS = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/flags';

export function countryFlag(countryCode, countryName = '') {
  const code = String(countryCode || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return '';
  const label = escapeHtml(countryName || code.toUpperCase());
  return `<img class="country-flag" src="${CSRANKINGS_FLAGS}/${code}.png" alt="${label}" title="${label}" width="16" height="11" loading="lazy" decoding="async">`;
}

/**
 * A display-only friendly name. The CSRankings spelling remains the key for
 * every lookup, join, and URL; this is only what a reader sees.
 *
 * The table above holds names that shorten to something a rule could not
 * derive — acronyms, and cases where the common name is not a substring.
 * Beyond it, most institutions are "<Name> University" and are universally
 * called just "<Name>": Harvard, Stanford, Columbia, Ohio State. Dropping the
 * suffix is applied only when the remainder stands on its own, meaning a single
 * word or one ending in "State". Multi-word remainders keep the suffix, because
 * "Istanbul Technical" or "De La Salle" do not read as institution names
 * without it. Verified against the full CSRankings roster: 159 of 702 names
 * shorten, and no two collapse to the same string.
 */
export function getInstitutionShortName(name) {
  const mapped = institutionShortNames[name];
  if (mapped) return mapped;
  const match = String(name || '').match(/^(.+) University$/);
  if (!match) return name;
  const rest = match[1];
  return !/\s/.test(rest) || /\sState$/.test(rest) ? rest : name;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Produces a value that is safe inside a quoted inline-handler argument.
// decodeURIComponent() must be used by the handler before consuming it.
export function encodeInlineValue(value) {
  return encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
  } catch {
    return '#';
  }
}

export function formatRelativeTime(dateInput, now = Date.now()) {
  const time = typeof dateInput === 'number' ? dateInput : new Date(dateInput).getTime();
  if (Number.isNaN(time)) return 'Unknown';
  const diffSec = Math.max(0, Math.floor((now - time) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

let cachedRepoCommit = null;
let repoCommitPromise = null;

export async function fetchLatestRepoCommit() {
  if (cachedRepoCommit) return cachedRepoCommit;
  if (!repoCommitPromise) {
    repoCommitPromise = fetch('https://api.github.com/repos/dynaroars/cspicks/commits?per_page=1')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (Array.isArray(data) && data[0]) {
          cachedRepoCommit = {
            sha: data[0].sha.slice(0, 7),
            fullSha: data[0].sha,
            date: data[0].commit?.committer?.date || data[0].commit?.author?.date,
            url: `https://github.com/dynaroars/cspicks/commit/${data[0].sha}`
          };
        }
        return cachedRepoCommit;
      })
      .catch(() => null);
  }
  return repoCommitPromise;
}
