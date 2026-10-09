/**
 * US Jobs data engine: dataset loading, active/closed status, filtering, sorting,
 * per-school grouping, and autocomplete indexing.
 */
import { matchesKeywordOptions, parseKeywordQuery } from '../search-keywords.js';
import { areaLabels } from '../shared.js';
import { FAVORITES_KEYWORD_SPEC } from '../favorites.js';
import { US_STATES, resolveState } from './states.js';
import type { KeywordSpec } from '../search-keywords.js';
import type { Job, JobLevel, JobTrack, VisaSponsorship } from '../types.js';

let cachedJobs: Job[] | null = null;

const DAY = 86400000;
/** A posting with no deadline counts as active only while a crawl or submission has confirmed it this recently. */
export const STALE_AFTER_DAYS = 90;

export const TRACK_LABELS: Record<JobTrack, string> = {
  'tenure-track': 'Tenure-track',
  teaching: 'Teaching track',
  research: 'Research track',
  postdoc: 'Postdoc',
  visiting: 'Visiting',
  leadership: 'Chair / Dean'
};

export const LEVEL_LABELS: Record<JobLevel, string> = {
  assistant: 'Assistant',
  associate: 'Associate',
  full: 'Full',
  open: 'Open rank'
};

/** Card and export wording for what a posting says about visa sponsorship. */
export const VISA_LABELS: Record<VisaSponsorship, string> = {
  yes: 'Visa sponsorship available',
  'case-by-case': 'Visa sponsorship case by case',
  no: 'No visa sponsorship',
  'not-stated': 'Visa sponsorship not stated'
};

/** Visa filter choices: the posting's stated policy, plus `unknown` for postings nobody has read for it yet. */
export const VISA_FILTER_LABELS: Record<VisaSponsorship | 'unknown', string> = {
  yes: '✅ Sponsorship available',
  'case-by-case': '⚖️ Sponsorship case by case',
  no: '🚫 No sponsorship',
  'not-stated': '❔ Not stated on posting',
  unknown: '⏳ Not checked yet'
};

/** `visa:` keyword values; `possible` keeps every posting that does not rule sponsorship out. */
const VISA_KEYWORD_VALUES: Record<string, string[]> = {
  yes: ['yes'], available: ['yes'], sponsor: ['yes'],
  case: ['case-by-case'], 'case-by-case': ['case-by-case'], maybe: ['case-by-case'],
  no: ['no'], none: ['no'],
  'not-stated': ['not-stated'], unstated: ['not-stated'],
  unknown: ['unknown'], unchecked: ['unknown'],
  possible: ['yes', 'case-by-case', 'not-stated', 'unknown']
};

const visaKey = (job: Job) => job.visaSponsorship ?? 'unknown';

export type DepartmentKind = 'cs' | 'information' | 'ece' | 'data' | 'other';

export const DEPARTMENT_LABELS: Record<DepartmentKind, string> = {
  cs: 'Computer Science / Computing',
  information: 'Information school (IST, iSchool)',
  ece: 'Electrical & Computer Engineering',
  data: 'Data Science / Statistics',
  other: 'Other / college-wide'
};

/**
 * Classifies a posting's unit from its department text. Many non-CS units hire CS PhDs, so the page lets
 * people include or isolate them. EE-named units win first ("Electrical Engineering and Computer Science"
 * is ECE-style); CS/computing names win over "information" ("School of Computing and Information").
 */
export function departmentKind(department: string): DepartmentKind {
  const text = department.toLowerCase();
  if (/electrical|\beecs\b|\bece\b|\becec\b/.test(text)) return 'ece';
  if (/computer (and information )?(science|engineering)|computing|\bcs\b|\bcse\b/.test(text)) return 'cs';
  if (/information|informatics|ischool|\bist\b/.test(text)) return 'information';
  if (/data science|analytics|statistic/.test(text)) return 'data';
  return 'other';
}

export const JOBS_KEYWORD_SPECS: KeywordSpec[] = [
  { key: 'school', aliases: ['university'], example: 'school: stanford', description: 'University the position is at' },
  { key: 'area', aliases: ['topic'], example: 'area: security', description: 'CSRankings research area the position targets (postings open to all areas match any area)' },
  { key: 'loc', aliases: ['state', 'location'], example: 'loc: texas', description: 'US state (name or two-letter code) or city' },
  { key: 'track', example: 'track: teaching', description: 'tenure-track, teaching, research, postdoc, visiting, or leadership' },
  { key: 'level', aliases: ['rank'], example: 'level: assistant', description: 'assistant, associate, full, or open rank' },
  { key: 'dept', aliases: ['department', 'unit'], example: 'dept: information', description: 'Hiring unit: cs, information (IST/iSchool), ece, data, or other' },
  { key: 'visa', aliases: ['sponsorship'], example: 'visa: possible', description: 'What the posting says about visa sponsorship: yes, case, no, not-stated, unknown (not checked yet), or possible (anything but no)' },
  { key: 'status', example: 'status: closed', description: '"active" (default), "closed" (older postings), or "all"' },
  FAVORITES_KEYWORD_SPEC
];

export type StatusFilter = 'active' | 'closed' | 'all';
export type JobSort = 'deadline' | 'posted' | 'school' | 'rank' | 'rank-desc';
export const JOB_SORTS: JobSort[] = ['deadline', 'posted', 'school', 'rank', 'rank-desc'];

function dayParts(value: unknown): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** End of the deadline day, Anywhere on Earth. */
export function deadlineInstant(value: unknown) {
  const parts = dayParts(value);
  return parts ? Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 11, 59, 59, 999) : null;
}

function dayStart(value: unknown) {
  const parts = dayParts(value);
  return parts ? Date.UTC(parts[0], parts[1] - 1, parts[2]) : null;
}

export function formatDay(value: unknown) {
  const parts = dayParts(value);
  return parts
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])))
    : '';
}

/**
 * Active means still applicable: not marked closed, and either its deadline has not passed
 * or (with no deadline) it was confirmed live within STALE_AFTER_DAYS.
 */
export function isActive(job: Job, now = Date.now()) {
  const closedAt = dayStart(job.closedAt);
  if (closedAt !== null && closedAt <= now) return false;
  const deadline = deadlineInstant(job.deadline);
  if (deadline !== null && !job.rolling) return deadline >= now;
  const seen = dayStart(job.lastSeenAt);
  return seen !== null && now - seen <= STALE_AFTER_DAYS * DAY;
}

export function deadlineLabel(job: Job, now = Date.now()) {
  const deadline = deadlineInstant(job.deadline);
  if (!isActive(job, now)) return { text: deadline !== null ? `Closed ${formatDay(job.deadline)}` : 'Closed', className: 'is-passed' };
  if (deadline === null) return { text: job.rolling ? 'Rolling review' : 'No deadline listed', className: '' };
  const days = Math.ceil((deadline - now) / DAY);
  const when = formatDay(job.deadline);
  const prefix = job.rolling ? 'Priority date ' : '';
  if (job.rolling && deadline < now) return { text: `Rolling review · priority date ${when} passed`, className: '' };
  if (days <= 0) return { text: `${prefix}${when} · closes today (AoE)`, className: 'is-urgent' };
  const left = `${days} day${days === 1 ? '' : 's'} left`;
  return { text: `${prefix}${when} · ${left}`, className: days <= 7 ? 'is-urgent' : days <= 30 ? 'is-soon' : '' };
}

const TRACKS = Object.keys(TRACK_LABELS);
const LEVELS = Object.keys(LEVEL_LABELS);
const isoOrNull = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && dayParts(value) !== null);

function isJob(value: unknown): value is Job {
  if (!value || typeof value !== 'object') return false;
  const job = value as Record<string, unknown>;
  return typeof job.id === 'string'
    && typeof job.school === 'string'
    && typeof job.department === 'string'
    && typeof job.title === 'string'
    && typeof job.track === 'string' && TRACKS.includes(job.track)
    && (job.level === undefined || job.level === null || (typeof job.level === 'string' && LEVELS.includes(job.level)))
    && Array.isArray(job.areas) && job.areas.every(area => typeof area === 'string')
    && (job.anyArea === undefined || typeof job.anyArea === 'boolean')
    && typeof job.state === 'string' && job.state in US_STATES
    && typeof job.url === 'string'
    && typeof job.lastSeenAt === 'string' && dayParts(job.lastSeenAt) !== null
    && isoOrNull(job.deadline) && isoOrNull(job.closedAt) && isoOrNull(job.postedDate)
    && (job.visaSponsorship === undefined || (typeof job.visaSponsorship === 'string' && job.visaSponsorship in VISA_LABELS))
    && (job.source === 'crawl' || job.source === 'submission');
}

export function parseJobs(payload: unknown): Job[] {
  if (!Array.isArray(payload) || !payload.every(isJob)) throw new Error('Invalid jobs dataset');
  return payload;
}

export async function loadJobsData(): Promise<Job[]> {
  if (cachedJobs) return cachedJobs;
  const url = new URL('../../public/jobs.json', import.meta.url).href;
  const response = await fetch(url).catch(() => fetch('./jobs.json'));
  if (!response.ok) {
    const fallback = await fetch('./jobs.json');
    if (!fallback.ok) throw new Error(`Failed to load jobs data (${response.status})`);
    cachedJobs = parseJobs(await fallback.json());
    return cachedJobs;
  }
  cachedJobs = parseJobs(await response.json());
  return cachedJobs;
}

/** One filter's chosen values: a list matches any of them; 'all', undefined, or an empty list means no constraint. */
export type FilterChoice = string | string[];

export interface JobFilters {
  query?: string;
  track?: FilterChoice;
  dept?: FilterChoice;
  level?: FilterChoice;
  area?: FilterChoice;
  state?: FilterChoice;
  /** `VISA_FILTER_LABELS` keys. */
  visa?: FilterChoice;
  status?: StatusFilter;
  sortBy?: JobSort;
  /** Overall CSRankings rank per school, for the rank sorts; schools it cannot rank sort last. */
  rankOf?: (school: string) => number | null | undefined;
  now?: number;
}

export function filterValues(choice: FilterChoice | undefined): string[] {
  return (Array.isArray(choice) ? choice : [choice ?? 'all']).filter(value => value && value !== 'all');
}

function searchText(job: Job) {
  return [
    job.school, job.department, job.title, job.city, job.state, US_STATES[job.state],
    TRACK_LABELS[job.track], job.level ? LEVEL_LABELS[job.level] : '', job.summary, job.anyArea ? 'all areas any area open' : '',
    job.visaSponsorship && job.visaSponsorship !== 'not-stated' ? VISA_LABELS[job.visaSponsorship] : '',
    ...job.areas.map(area => `${area} ${areaLabels[area] || ''}`)
  ].filter(Boolean).join(' ').toLowerCase();
}

function stateMatches(job: Job, value: string) {
  const code = resolveState(value);
  return code ? job.state === code : `${job.city || ''} ${US_STATES[job.state]}`.toLowerCase().includes(value.toLowerCase());
}

function sortKey(job: Job, sortBy: JobSort, now: number) {
  if (sortBy === 'deadline') {
    if (!isActive(job, now)) return 3e15 - (deadlineInstant(job.deadline) ?? dayStart(job.lastSeenAt) ?? 0);
    const deadline = deadlineInstant(job.deadline);
    return deadline !== null && !job.rolling ? deadline : 1e15 + (deadline ?? 0);
  }
  // Newest first.
  return -(dayStart(job.postedDate) ?? dayStart(job.lastSeenAt) ?? 0);
}

/** Best CSRankings rank first (`rank`) or last (`rank-desc`); unranked schools, or ranks not loaded yet, go last either way. */
function rankOrder(a: Job, b: Job, rankOf: JobFilters['rankOf'], descending: boolean) {
  const rank = (job: Job) => {
    const value = rankOf?.(job.school);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const [first, second] = [rank(a), rank(b)];
  if (first === null || second === null) return Number(first === null) - Number(second === null);
  return descending ? second - first : first - second;
}

/** `ignoreState` lets the state map count jobs per state without the state filter hiding the others. */
export function filterJobs(jobs: Job[], filters: JobFilters = {}, ignoreState = false) {
  const { query = '', status = 'active', sortBy = 'deadline', rankOf, now = Date.now() } = filters;
  const tracks = filterValues(filters.track);
  const depts = filterValues(filters.dept);
  const levels = filterValues(filters.level);
  const areas = filterValues(filters.area);
  const states = filterValues(filters.state);
  const visas = filterValues(filters.visa);
  const { filters: keywords, rest } = parseKeywordQuery(query, JOBS_KEYWORD_SPECS);
  const terms = rest.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const results = jobs.filter(job => {
    const active = isActive(job, now);
    if (keywords.status?.length) {
      if (!matchesKeywordOptions(keywords.status, value => value === 'all' || value === (active ? 'active' : 'closed'))) return false;
    } else {
      if (status === 'active' && !active) return false;
      if (status === 'closed' && active) return false;
    }
    if (tracks.length && !tracks.includes(job.track)) return false;
    if (levels.length && !levels.includes(job.level ?? '')) return false;
    if (depts.length && !depts.includes(departmentKind(job.department))) return false;
    if (keywords.dept) {
      const kind = departmentKind(job.department);
      // Short values ("cs", "ece") match the unit kind only; longer ones also match the posting's department text.
      if (!matchesKeywordOptions(keywords.dept, value => value === kind || (value.length > 3 && `${DEPARTMENT_LABELS[kind]} ${job.department}`.toLowerCase().includes(value)))) return false;
    }
    // A posting open to all areas matches every area; one that names none matches none.
    if (areas.length && !job.anyArea && !areas.some(key => job.areas.includes(key))) return false;
    if (!ignoreState && states.length && !states.includes(job.state)) return false;
    if (visas.length && !visas.includes(visaKey(job))) return false;
    if (keywords.visa && !matchesKeywordOptions(keywords.visa, value => (VISA_KEYWORD_VALUES[value] ?? []).includes(visaKey(job)))) return false;
    if (!matchesKeywordOptions(keywords.school, value => job.school.toLowerCase().includes(value))) return false;
    if (keywords.area && !job.anyArea && !matchesKeywordOptions(keywords.area, value => job.areas.some(key => `${key} ${areaLabels[key] || ''}`.toLowerCase().includes(value)))) return false;
    if (!matchesKeywordOptions(keywords.track, value => `${job.track} ${TRACK_LABELS[job.track]}`.toLowerCase().includes(value))) return false;
    if (!matchesKeywordOptions(keywords.level, value => Boolean(job.level && `${job.level} ${LEVEL_LABELS[job.level]}`.toLowerCase().includes(value)))) return false;
    if (!ignoreState && !matchesKeywordOptions(keywords.loc, value => stateMatches(job, value))) return false;
    if (!terms.length) return true;
    const text = searchText(job);
    return terms.every(term => text.includes(term));
  });

  if (sortBy === 'school') return results.sort((a, b) => a.school.localeCompare(b.school) || a.title.localeCompare(b.title));
  if (sortBy === 'rank' || sortBy === 'rank-desc') {
    // Schools sharing a rank (and the unranked ones) stay grouped; a school's own postings go by soonest deadline.
    return results.sort((a, b) => rankOrder(a, b, rankOf, sortBy === 'rank-desc') || a.school.localeCompare(b.school)
      || sortKey(a, 'deadline', now) - sortKey(b, 'deadline', now) || a.title.localeCompare(b.title));
  }
  return results.sort((a, b) =>
    sortKey(a, sortBy, now) - sortKey(b, sortBy, now) || a.school.localeCompare(b.school) || a.title.localeCompare(b.title));
}

export function stateCounts(jobs: Job[]) {
  const counts: Record<string, number> = {};
  jobs.forEach(job => { counts[job.state] = (counts[job.state] || 0) + 1; });
  return counts;
}

export interface SchoolJobs { school: string; state: string; jobs: Job[] }

/** Group an already sorted list by school, keeping schools in order of their best-ranked posting. */
export function groupBySchool(jobs: Job[]): SchoolJobs[] {
  const groups = new Map<string, SchoolJobs>();
  jobs.forEach(job => {
    if (!groups.has(job.school)) groups.set(job.school, { school: job.school, state: job.state, jobs: [] });
    groups.get(job.school)!.jobs.push(job);
  });
  return [...groups.values()];
}

export function jobsSuggestions(jobs: Job[]) {
  const schools = new Map<string, number>();
  const areas = new Map<string, number>();
  const states = new Map<string, number>();
  jobs.forEach(job => {
    schools.set(job.school, (schools.get(job.school) || 0) + 1);
    job.areas.forEach(area => areas.set(area, (areas.get(area) || 0) + 1));
    states.set(job.state, (states.get(job.state) || 0) + 1);
  });
  const plural = (count: number) => `${count} position${count === 1 ? '' : 's'}`;
  return {
    schools: [...schools].map(([label, count]) => ({ label, detail: plural(count), searchTerms: label })).sort((a, b) => a.label.localeCompare(b.label)),
    areas: [...areas].map(([key, count]) => ({ label: areaLabels[key] || key, detail: `Research area · ${plural(count)}`, searchTerms: key })).sort((a, b) => a.label.localeCompare(b.label)),
    states: [...states].map(([code, count]) => ({ label: US_STATES[code]!, detail: `State · ${plural(count)}`, searchTerms: `${code} ${US_STATES[code]}` })).sort((a, b) => a.label.localeCompare(b.label)),
    tracks: (Object.keys(TRACK_LABELS) as JobTrack[]).map(key => ({ label: TRACK_LABELS[key], detail: 'Position type', searchTerms: key }))
  };
}
