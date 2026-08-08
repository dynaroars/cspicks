import fallbackRules from './csrankings-rules.generated.js';

export const CSRANKINGS_RULES_URL =
  'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/util/csrankings.py';

let activeRules = fallbackRules;
let syncPromise = null;

function extractDictionary(source, name) {
  const marker = `${name} = {`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${name}`);

  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') depth--;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unclosed ${name}`);
}

function parsePairMap(source, name) {
  const body = extractDictionary(source, name);
  const entries = {};
  const pattern = /(\d{4})\s*:\s*\(\s*(\d+)\s*,\s*(?:"([^"]+)"|'([^']+)'|(\d+))\s*\)/g;
  for (const match of body.matchAll(pattern)) {
    entries[match[1]] = [Number(match[2]), match[3] || match[4] || Number(match[5])];
  }
  if (Object.keys(entries).length === 0) throw new Error(`Unable to parse ${name}`);
  return entries;
}

function combineIssues(primary, secondary) {
  const combined = {};
  for (const year of new Set([...Object.keys(primary), ...Object.keys(secondary)])) {
    const first = primary[year];
    const second = secondary[year];
    if (first && second && first[0] === second[0]) combined[year] = [first[0], first[1], second[1]];
    else if (first) combined[year] = [first[0], first[1], null];
  }
  return combined;
}

export function parseCsrankingsRules(source) {
  const tog = combineIssues(
    parsePairMap(source, 'TOG_SIGGRAPH_Volume'),
    parsePairMap(source, 'TOG_SIGGRAPH_Asia_Volume')
  );
  const tvcg = combineIssues(
    parsePairMap(source, 'TVCG_Vis_Volume'),
    parsePairMap(source, 'TVCG_VR_Volume')
  );

  return {
    ...fallbackRules,
    source: CSRANKINGS_RULES_URL,
    issues: {
      tog,
      cgf: parsePairMap(source, 'CGF_EUROGRAPHICS_Volume'),
      tvcg,
      ismb: parsePairMap(source, 'ISMB_Bioinformatics')
    }
  };
}

export function getCsrankingsRules() {
  return activeRules;
}

export function syncCsrankingsRules() {
  if (!syncPromise) {
    syncPromise = fetch(CSRANKINGS_RULES_URL, { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`CSRankings returned ${response.status}`);
        return Promise.all([
          response.text(),
          response.headers.get('etag') || response.headers.get('last-modified') || 'upstream-current'
        ]);
      })
      .then(([source, sourceVersion]) => {
        activeRules = parseCsrankingsRules(source);
        activeRules.sourceVersion = sourceVersion;
        return activeRules;
      })
      .catch(error => {
        console.warn('Using bundled CSRankings venue rules:', error);
        return activeRules;
      });
  }
  return syncPromise;
}
