/**
 * Industry, national, and government research labs that hire CS PhDs (TASKS/labs.md). A curated directory
 * of careers/internship/postdoc pages, not individual postings: those labs keep evergreen openings that
 * never close, so the Jobs page links to where they hire instead of tracking each one.
 */
import { matchesKeywordOptions, parseKeywordQuery } from '../search-keywords.js';
import { areaLabels, escapeHtml, safeExternalUrl } from '../shared.js';
import { JOBS_KEYWORD_SPECS, US_STATES, resolveState } from './jobs-data.js';

export type LabKind = 'industry' | 'company' | 'national';

export interface Lab {
  id: string;
  name: string;
  /** Former or informal names a reader may search for (e.g. "Google Brain"). */
  aka?: string[];
  org: string;
  kind: LabKind;
  areas: string[];
  /** Hires across most of CS, so every `area:` search matches. */
  broad?: boolean;
  locations: string[];
  summary: string;
  careersUrl: string;
  internshipsUrl?: string;
  postdocsUrl?: string;
  /** ISO date the links were last opened and confirmed. */
  checkedAt: string;
  /** ISO date the lab's careers pages were last searched for postings (`npm run maintain:labs` queue). */
  postingsCheckedAt?: string;
}

export const LAB_KIND_LABELS: Record<LabKind, string> = {
  industry: 'Industry research labs',
  company: 'Research companies & institutes',
  national: 'National & government labs'
};

/** Job-only keywords: a search using any of them is about postings, so the lab list stays out of the way. */
const POSTING_ONLY_KEYWORDS = ['level', 'visa', 'status', 'favorites'];
/** `track:` and `dept:` values that labs hire for; any other value hides the lab list. */
const LAB_TRACKS = ['industry', 'internship', 'postdoc', 'lab'];

let cachedLabs: Lab[] | null = null;

const isIsoDay = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isHttps = (value: unknown) => typeof value === 'string' && value.startsWith('https://');
const isStringList = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);

/** Every problem in the labs dataset, one line each; empty when it is valid. */
export function labsDatasetProblems(payload: unknown): string[] {
  if (!Array.isArray(payload)) return ['labs.json: expected an array'];
  const problems: string[] = [];
  const seen = new Set<string>();
  payload.forEach((lab: Partial<Lab> | null, index) => {
    const label = typeof lab?.id === 'string' ? lab.id : `record #${index}`;
    if (!lab || typeof lab !== 'object') {
      problems.push(`${label}: not an object`);
      return;
    }
    const checks: Array<[string, boolean]> = [
      ['id', typeof lab.id === 'string' && /^[a-z0-9-]+$/.test(lab.id)],
      ['name', typeof lab.name === 'string' && lab.name.length > 0],
      ['org', typeof lab.org === 'string' && lab.org.length > 0],
      ['kind', typeof lab.kind === 'string' && lab.kind in LAB_KIND_LABELS],
      ['areas', isStringList(lab.areas) && lab.areas!.every(area => area in areaLabels)],
      ['locations', isStringList(lab.locations) && lab.locations!.length > 0],
      ['summary', typeof lab.summary === 'string' && lab.summary.length > 0],
      ['careersUrl', isHttps(lab.careersUrl)],
      ['internshipsUrl', lab.internshipsUrl === undefined || isHttps(lab.internshipsUrl)],
      ['postdocsUrl', lab.postdocsUrl === undefined || isHttps(lab.postdocsUrl)],
      ['aka', lab.aka === undefined || isStringList(lab.aka)],
      ['broad', lab.broad === undefined || typeof lab.broad === 'boolean'],
      ['checkedAt', isIsoDay(lab.checkedAt)],
      ['postingsCheckedAt', lab.postingsCheckedAt === undefined || isIsoDay(lab.postingsCheckedAt)]
    ];
    checks.filter(([, ok]) => !ok).forEach(([field]) => problems.push(`${label}: ${field}`));
    if (typeof lab.id === 'string') {
      if (seen.has(lab.id)) problems.push(`${label}: duplicate id`);
      seen.add(lab.id);
    }
  });
  return problems;
}

export function parseLabs(payload: unknown): Lab[] {
  const problems = labsDatasetProblems(payload);
  if (problems.length) throw new Error(`Invalid labs dataset (bad or missing fields):\n${problems.join('\n')}`);
  return payload as Lab[];
}

export async function loadLabsData(): Promise<Lab[]> {
  if (cachedLabs) return cachedLabs;
  const response = await fetch('/labs.json');
  if (!response.ok) throw new Error(`Failed to load labs data (${response.status})`);
  cachedLabs = parseLabs(await response.json());
  return cachedLabs;
}

function searchText(lab: Lab) {
  return [lab.name, ...(lab.aka || []), lab.org, LAB_KIND_LABELS[lab.kind], lab.summary, ...lab.locations,
    ...lab.areas.map(area => `${area} ${areaLabels[area] || ''}`), lab.broad ? 'all areas' : '']
    .join(' ').toLowerCase();
}

/** The US state code in a location like "Redmond, WA" or "New York, NY (remote-first)". */
function stateOf(place: string) {
  const code = /, ([A-Z]{2})\b/.exec(place)?.[1];
  return code && US_STATES[code] ? code : null;
}

function locationMatches(lab: Lab, value: string) {
  const val = value.trim().toLowerCase();
  if (['us', 'usa', 'united states'].includes(val)) return lab.locations.some(place => stateOf(place));
  const code = resolveState(value);
  return lab.locations.some(place => code ? stateOf(place) === code : place.toLowerCase().includes(val));
}

/**
 * Labs matching the Jobs search box. Uses the same `school:`, `area:`, `loc:`, `country:`, and free-text terms as
 * postings; a search for academic-only tracks or units, or a posting-only keyword (level, visa, …), matches no labs.
 */
export function filterLabs(labs: Lab[], query = ''): Lab[] {
  const { filters: keywords, rest } = parseKeywordQuery(query, JOBS_KEYWORD_SPECS);
  if (POSTING_ONLY_KEYWORDS.some(key => keywords[key]?.length)) return [];
  const labOnly = (values?: string[]) => (values || []).every(value => value.split(',').every(part => LAB_TRACKS.some(track => track.startsWith(part.trim()))));
  if (!labOnly(keywords.track) || !labOnly(keywords.dept)) return [];
  const terms = rest.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return labs.filter(lab => {
    if (keywords.area && !lab.broad && !matchesKeywordOptions(keywords.area, value =>
      lab.areas.some(key => `${key} ${areaLabels[key] || ''}`.toLowerCase().includes(value)))) return false;
    if (!matchesKeywordOptions(keywords.school, value => [lab.name, ...(lab.aka || [])].some(name => name.toLowerCase().includes(value)))) return false;
    if (!matchesKeywordOptions(keywords.loc, value => locationMatches(lab, value))) return false;
    if (!matchesKeywordOptions(keywords.country, value => locationMatches(lab, value))) return false;
    if (!terms.length) return true;
    const text = searchText(lab);
    return terms.every(term => text.includes(term));
  });
}

function link(url: string | undefined, label: string) {
  return url ? `<a href="${escapeHtml(safeExternalUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
}

/** `postings` is the lab's count of currently shown postings; a count links to them. */
export function renderLabRow(lab: Lab, postings = 0) {
  const chips = [
    ...(lab.broad ? ['<span class="opportunity-chip job-chip" title="Hires across most areas of CS">Many areas</span>'] : []),
    ...lab.areas.map(area => `<button type="button" class="opportunity-chip job-chip job-chip-area" data-search-area="${escapeHtml(area)}">${escapeHtml(areaLabels[area] || area)}</button>`)
  ].join('');
  const aka = lab.aka?.length ? ` <span class="lab-aka">(${escapeHtml(lab.aka.join(', '))})</span>` : '';
  return `<li class="lab-row" id="lab-${escapeHtml(lab.id)}">
    <div class="lab-head"><a class="lab-name" href="${escapeHtml(safeExternalUrl(lab.careersUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(lab.name)}</a>${aka}
      <span class="lab-org">${escapeHtml(lab.org)} · ${escapeHtml(lab.locations.join('; '))}</span></div>
    <p class="lab-summary">${escapeHtml(lab.summary)}</p>
    <div class="lab-links">${[
      postings ? `<button type="button" class="lab-postings" data-search-school="${escapeHtml(lab.name)}">${postings} listed posting${postings === 1 ? '' : 's'}</button>` : '',
      link(lab.careersUrl, 'Careers'), link(lab.internshipsUrl, 'Internships &amp; students'), link(lab.postdocsUrl, 'Postdocs')
    ].filter(Boolean).join('')}</div>
    <div class="opportunity-tags lab-chips">${chips}</div>
  </li>`;
}

/** Grouped by kind, alphabetical within a group; `postings` maps a lab id to its shown posting count. */
export function renderLabs(labs: Lab[], postings: Map<string, number> = new Map()) {
  return (Object.keys(LAB_KIND_LABELS) as LabKind[]).map(kind => {
    const group = labs.filter(lab => lab.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
    return group.length ? `<h3 class="lab-group-title">${LAB_KIND_LABELS[kind]} (${group.length})</h3>
      <ul class="lab-list">${group.map(lab => renderLabRow(lab, postings.get(lab.id))).join('')}</ul>` : '';
  }).join('');
}
