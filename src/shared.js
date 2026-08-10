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
  pets: 'PETS (Privacy Enhancing Technologies Symposium)'
};

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
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
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
  'Carnegie Mellon University': 'CMU',
  'George Mason University': 'GMU',
  'Massachusetts Inst. of Technology': 'MIT',
  'Georgia Institute of Technology': 'Georgia Tech',
  'California Inst. of Technology': 'Caltech',
  'University of Illinois at Urbana-Champaign': 'UIUC',
  'Univ. of Illinois at Urbana-Champaign': 'UIUC',
  'University of Maryland, College Park': 'UMD',
  'Univ. of Maryland - College Park': 'UMD',
  'University of Texas at Austin': 'UT Austin',
  'University of Wisconsin - Madison': 'UW–Madison',
  'University of Michigan': 'UMich',
  'University of Pennsylvania': 'Penn',
  'Pennsylvania State University': 'Penn State',
  'University of Southern California': 'USC',
  'University of Washington': 'UW',
  'Virginia Polytechnic Institute and State University': 'Virginia Tech',
  'New York University': 'NYU',
  'University of North Carolina at Chapel Hill': 'UNC',
  'University of Massachusetts Amherst': 'UMass Amherst',
  'University of California, Berkeley': 'UC Berkeley',
  'University of California - Berkeley': 'UC Berkeley',
  'University of California, Los Angeles': 'UCLA',
  'University of California - Los Angeles': 'UCLA',
  'University of California, San Diego': 'UCSD',
  'University of California - San Diego': 'UCSD',
  'University of California, Santa Barbara': 'UCSB',
  'University of California - Santa Barbara': 'UCSB',
  'University of California, Irvine': 'UC Irvine',
  'University of California - Irvine': 'UC Irvine'
};

// CSRankings publishes a flag per country alongside its institution data.
const CSRANKINGS_FLAGS = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/flags';

export function countryFlag(countryCode, countryName = '') {
  const code = String(countryCode || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return '';
  const label = escapeHtml(countryName || code.toUpperCase());
  return `<img class="country-flag" src="${CSRANKINGS_FLAGS}/${code}.png" alt="${label}" title="${label}" width="16" height="11" loading="lazy" decoding="async">`;
}

export function getInstitutionShortName(name) {
  return institutionShortNames[name] || name;
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
