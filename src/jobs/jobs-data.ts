/**
 * US Jobs data engine: dataset loading, active/closed status, filtering, sorting,
 * per-school grouping, and autocomplete indexing.
 */
import { matchesKeyword, parseKeywordQuery } from '../search-keywords.js';
import { areaLabels } from '../shared.js';
import { US_STATES, resolveState } from './states.js';
import type { KeywordSpec } from '../search-keywords.js';
import type { Job, JobLevel, JobTrack } from '../types.js';

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

export const JOBS_KEYWORD_SPECS: KeywordSpec[] = [
  { key: 'school', aliases: ['university'], example: 'school: stanford', description: 'University the position is at' },
  { key: 'area', aliases: ['topic'], example: 'area: security', description: 'CSRankings research area the position targets' },
  { key: 'loc', aliases: ['state', 'location'], example: 'loc: texas', description: 'US state (name or two-letter code) or city' },
  { key: 'track', example: 'track: teaching', description: 'tenure-track, teaching, research, postdoc, visiting, or leadership' },
  { key: 'level', aliases: ['rank'], example: 'level: assistant', description: 'assistant, associate, full, or open rank' },
  { key: 'status', example: 'status: closed', description: '"active" (default), "closed" (older postings), or "all"' }
];

export type StatusFilter = 'active' | 'closed' | 'all';
export type JobSort = 'deadline' | 'posted' | 'school';
export const JOB_SORTS: JobSort[] = ['deadline', 'posted', 'school'];

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
    && typeof job.state === 'string' && job.state in US_STATES
    && typeof job.url === 'string'
    && typeof job.lastSeenAt === 'string' && dayParts(job.lastSeenAt) !== null
    && isoOrNull(job.deadline) && isoOrNull(job.closedAt) && isoOrNull(job.postedDate)
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

export interface JobFilters {
  query?: string;
  track?: string;
  level?: string;
  area?: string;
  state?: string;
  status?: StatusFilter;
  sortBy?: JobSort;
  now?: number;
}

function searchText(job: Job) {
  return [
    job.school, job.department, job.title, job.city, job.state, US_STATES[job.state],
    TRACK_LABELS[job.track], job.level ? LEVEL_LABELS[job.level] : '', job.summary,
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

/** `ignoreState` lets the state map count jobs per state without the state filter hiding the others. */
export function filterJobs(jobs: Job[], filters: JobFilters = {}, ignoreState = false) {
  const { query = '', track = 'all', level = 'all', area = 'all', state = 'all', status = 'active', sortBy = 'deadline', now = Date.now() } = filters;
  const { filters: keywords, rest } = parseKeywordQuery(query, JOBS_KEYWORD_SPECS);
  const statusKeyword = keywords.status?.[0];
  const wantStatus: StatusFilter = statusKeyword === 'closed' || statusKeyword === 'all' || statusKeyword === 'active'
    ? statusKeyword : status;
  const terms = rest.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const results = jobs.filter(job => {
    const active = isActive(job, now);
    if (wantStatus === 'active' && !active) return false;
    if (wantStatus === 'closed' && active) return false;
    if (track !== 'all' && job.track !== track) return false;
    if (level !== 'all' && job.level !== level) return false;
    if (area !== 'all' && job.areas.length && !job.areas.includes(area)) return false;
    if (area !== 'all' && !job.areas.length) return false;
    if (!ignoreState && state !== 'all' && job.state !== state) return false;
    if (!matchesKeyword(keywords.school, job.school)) return false;
    if (!matchesKeyword(keywords.area, job.areas.map(key => `${key} ${areaLabels[key] || ''}`).join(' '))) return false;
    if (!matchesKeyword(keywords.track, `${job.track} ${TRACK_LABELS[job.track]}`)) return false;
    if (!matchesKeyword(keywords.level, job.level ? `${job.level} ${LEVEL_LABELS[job.level]}` : '')) return false;
    if (keywords.loc && !keywords.loc.every(value => stateMatches(job, value))) return false;
    if (!terms.length) return true;
    const text = searchText(job);
    return terms.every(term => text.includes(term));
  });

  return results.sort((a, b) =>
    sortBy === 'school'
      ? a.school.localeCompare(b.school) || a.title.localeCompare(b.title)
      : sortKey(a, sortBy, now) - sortKey(b, sortBy, now) || a.school.localeCompare(b.school) || a.title.localeCompare(b.title));
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
