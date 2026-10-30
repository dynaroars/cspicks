import fallbackRules from './csrankings-rules.generated.js';

type Issue = Array<string | number | null>;
type IssueMap = Record<string, Issue>;
export interface CsrankingsRules {
  source: string;
  sourceVersion?: string;
  syncedAt?: string;
  venueAliases: Record<string, string>;
  issues: Record<string, IssueMap>;
}

export const CSRANKINGS_RULES_URL =
  'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/util/csrankings.py';

function extractDictionary(source: string, name: string) {
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

function parsePairMap(source: string, name: string): IssueMap {
  const body = extractDictionary(source, name);
  const entries: IssueMap = {};
  const pattern = /(\d{4})\s*:\s*\(\s*(\d+)\s*,\s*(?:"([^"]+)"|'([^']+)'|(\d+))\s*\)/g;
  for (const match of body.matchAll(pattern)) {
    const year = match[1];
    if (!year) continue;
    entries[year] = [Number(match[2]), match[3] || match[4] || Number(match[5])];
  }
  if (Object.keys(entries).length === 0) throw new Error(`Unable to parse ${name}`);
  return entries;
}

function combineIssues(primary: IssueMap, secondary: IssueMap): IssueMap {
  const combined: IssueMap = {};
  for (const year of new Set([...Object.keys(primary), ...Object.keys(secondary)])) {
    const first = primary[year];
    const second = secondary[year];
    if (first && second && first[0] === second[0]) combined[year] = [first[0]!, first[1]!, second[1]!];
    else if (first) combined[year] = [first[0]!, first[1]!, null];
  }
  return combined;
}

export function parseCsrankingsRules(source: string): CsrankingsRules {
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

// The committed generated file is the single source of venue rules; `npm run sync:csrankings-rules` refreshes it
// from upstream monthly (TASKS/csrankings.md). Parsing upstream Python at page load could silently go wrong.
export function getCsrankingsRules(): CsrankingsRules {
  return fallbackRules;
}
