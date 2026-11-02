/**
 * CS Awards & Grants Data Engine
 * Handles dataset loading, querying, structured filtering, and autocomplete indexing.
 */

import { matchesKeywordOptions, parseKeywordQuery } from '../search-keywords.js';
import type { KeywordSpec } from '../search-keywords.js';
import { FAVORITES_KEYWORD_SPEC } from '../favorites.js';
import { addedWindowDays, dayValue, daysSince } from '../opportunity-card.js';
import type { StageView } from '../opportunity-card.js';
import type { CalendarEvent } from '../calendar.js';
import type { Grant, GrantCitizenship } from '../types.js';

let cachedGrants: Grant[] | null = null;

export const GRANTS_KEYWORD_SPECS: KeywordSpec[] = [
  { key: 'sponsor', example: 'sponsor: NSF', description: 'Sponsoring agency, foundation, or company' },
  { key: 'audience', aliases: ['who'], example: 'audience: postdoc', description: 'Who the award is for (faculty, PhD, undergrad, postdoc)' },
  { key: 'topic', aliases: ['area'], example: 'topic: AI', description: 'Research topic or area covered' },
  { key: 'loc', aliases: ['location', 'state'], example: 'loc: California', description: 'Eligible state/jurisdiction, for state-specific awards' },
  { key: 'category', aliases: ['sponsor-category'], example: 'category: industry', description: 'Sponsor category: government, industry, foundation, or society' },
  { key: 'deadline', example: 'deadline: soon', description: 'soon (next 30 days), week (next 7 days), rolling / open, fixed annual, or month number (1–12)' },
  { key: 'citizenship', aliases: ['citizen', 'eligible'], example: 'citizenship: international', description: 'international (not limited to US citizens/residents), open (stated open to all), pr (US permanent residents eligible), or us-only' },
  { key: 'added', aliases: ['new'], example: 'added: week', description: 'Added to CS Picks recently: week, month, or a number of days' },
  { key: 'status', example: 'status: historical', description: '"all" (default), "current", or "historical" (discontinued) awards' },
  FAVORITES_KEYWORD_SPEC
];

const monthNumbers: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

const ANNUAL = /\bannual(?:ly)?\b/i;
const TEXT_DATE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i;

/**
 * Give an expired, dated annual call a next-cycle projection without
 * overwriting the source-backed deadline in the dataset.  This keeps annual
 * opportunities discoverable in deadline order while clearly distinguishing
 * the projection from a sponsor-published date.
 */
export function grantDeadlinePresentation(grant: Grant, now = new Date()) {
  const deadline = grant.deadline;
  if (!/\bannual(?:ly)?\b/i.test(deadline)) return { text: deadline, estimated: Boolean(grant.estimated) };

  const match = deadline.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i);
  if (!match) return { text: deadline, estimated: Boolean(grant.estimated) };

  const [, monthName, dayText, yearText] = match;
  const month = monthNumbers[monthName!.toLowerCase()];
  const day = Number(dayText);
  let projectedYear = Number(yearText);
  if (month === undefined || !Number.isInteger(day)) return { text: deadline, estimated: Boolean(grant.estimated) };

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // A later stage of the same cycle (e.g. the full proposal after a passed white paper) keeps the cycle current.
  const anyUpcoming = [...deadline.matchAll(new RegExp(TEXT_DATE.source, 'gi'))].some(found => {
    const value = Date.UTC(Number(found[3]), monthNumbers[found[1]!.toLowerCase()]!, Number(found[2]));
    return value >= today;
  });
  if (anyUpcoming) return { text: deadline, estimated: Boolean(grant.estimated) };
  while (Date.UTC(projectedYear, month, day) < today) projectedYear += 1;
  if (projectedYear === Number(yearText)) return { text: deadline, estimated: Boolean(grant.estimated) };

  const projectedDate = `${monthName} ${day}, ${projectedYear}`;
  return {
    text: `Estimated ${deadline.replace(match[0], projectedDate)}`,
    estimated: true
  };
}

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const todayOf = (now: Date) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

/** First full calendar date in free text, as YYYY-MM-DD. */
export function firstTextDate(text: string) {
  const match = TEXT_DATE.exec(text);
  if (!match) return null;
  const month = monthNumbers[match[1]!.toLowerCase()]!;
  const value = Date.UTC(Number(match[3]), month, Number(match[2]));
  return new Date(value).getUTCDate() === Number(match[2]) ? iso(value) : null;
}

function shiftYears(day: string, years: number) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return iso(Date.UTC(y + years, m - 1, d));
}

/**
 * The structured stages of the current cycle with their state. When every stage of an annual program has passed,
 * the whole cycle is projected forward a year at a time (and marked estimated), like `grantDeadlinePresentation`.
 */
export function grantStages(grant: Grant, now = new Date()): { stages: StageView[]; estimated: boolean } {
  const source = grant.deadlines || [];
  if (!source.length || grant.status === 'historical') return { stages: [], estimated: false };
  const today = todayOf(now);
  let years = 0;
  if (ANNUAL.test(grant.deadline)) {
    while (years < 10 && source.every(stage => (dayValue(shiftYears(stage.date, years)) ?? 0) < today)) years += 1;
    if (years === 10) years = 0;
  }
  let nextSeen = false;
  const stages = source.map(stage => {
    const date = shiftYears(stage.date, years);
    const daysLeft = Math.round(((dayValue(date) ?? 0) - today) / DAY);
    const state: StageView['state'] = daysLeft < 0 ? 'passed' : nextSeen ? 'later' : 'next';
    if (state === 'next') nextSeen = true;
    return { ...stage, date, daysLeft, state };
  });
  return { stages, estimated: years > 0 || Boolean(grant.estimated) };
}

export interface NextDeadline {
  /** YYYY-MM-DD, or null when the program has no dated or monthly cycle (rolling). */
  date: string | null;
  stage?: string;
  /** Projected from an earlier cycle. */
  estimated: boolean;
  /** Only the month is known; `date` is the 1st of the next such month. */
  approximate: boolean;
  /** Every known date has passed and nothing projects it forward. */
  passed: boolean;
}

/** The next actionable deadline: the next structured stage, else the (projected) date in the text, else the month. */
export function nextGrantDeadline(grant: Grant, now = new Date()): NextDeadline {
  const today = todayOf(now);
  const { stages, estimated } = grantStages(grant, now);
  const next = stages.find(stage => stage.state === 'next');
  if (next) return { date: next.date, stage: next.stage, estimated, approximate: false, passed: false };
  const presentation = grantDeadlinePresentation(grant, now);
  const textDate = firstTextDate(presentation.text);
  if (textDate && (dayValue(textDate) ?? 0) >= today) return { date: textDate, estimated: presentation.estimated, approximate: false, passed: false };
  if (grant.deadlineMonth >= 1 && grant.deadlineMonth <= 12) {
    const current = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear() + (grant.deadlineMonth < current ? 1 : 0);
    return { date: iso(Date.UTC(year, grant.deadlineMonth - 1, 1)), estimated: true, approximate: true, passed: false };
  }
  return { date: null, estimated: false, approximate: false, passed: Boolean(textDate) || stages.length > 0 };
}

/** Days until the next exact (not month-only) deadline, or null. */
export function daysUntilNextDeadline(grant: Grant, now = new Date()) {
  const next = nextGrantDeadline(grant, now);
  if (!next.date || next.approximate) return null;
  return Math.round(((dayValue(next.date) ?? 0) - todayOf(now)) / DAY);
}

export const CITIZENSHIP_LABELS: Record<GrantCitizenship, string> = {
  'us-citizen': 'US citizens only',
  'us-citizen-or-pr': 'US citizens or permanent residents',
  open: 'Open to international applicants',
  other: 'Nationality or residency limits'
};

function citizenshipMatches(grant: Grant, value: string) {
  const rule = grant.citizenship;
  if (value === 'all') return true;
  if (value === 'open') return rule === 'open';
  if (value === 'international' || value === 'intl') return rule !== 'us-citizen' && rule !== 'us-citizen-or-pr';
  if (value === 'pr' || value === 'resident') return rule !== 'us-citizen';
  if (value === 'us-only' || value === 'us') return rule === 'us-citizen';
  if (value === 'restricted') return rule === 'us-citizen' || rule === 'us-citizen-or-pr' || rule === 'other';
  if (value === 'unknown') return rule === undefined;
  return true;
}

/** Calendar events for every upcoming stage (or the next dated deadline) of a grant. */
export function grantCalendarEvents(grant: Grant, now = new Date()): CalendarEvent[] {
  const page = `https://cspicks.roars.dev/grants.html?q=${encodeURIComponent(grant.id)}#${encodeURIComponent(grant.id)}`;
  const description = (extra: string) => [extra, grant.deadline, `Official page: ${grant.url}`, `CS Picks: ${page}`,
    'Confirm the date on the official page; details change.'].filter(Boolean).join('\n');
  const { stages, estimated } = grantStages(grant, now);
  const upcoming = stages.filter(stage => stage.state !== 'passed');
  if (upcoming.length) {
    return upcoming.map(stage => ({
      uid: `grant-${grant.id}-${stage.stage}-${stage.date}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      date: stage.date,
      title: `${estimated ? '(Estimated) ' : ''}${grant.shortName || grant.name}: ${stage.stage}`,
      description: description([stage.required === true ? 'Required stage.' : '', stage.note || ''].filter(Boolean).join(' ')),
      url: grant.url
    }));
  }
  const next = nextGrantDeadline(grant, now);
  if (!next.date || next.approximate) return [];
  return [{
    uid: `grant-${grant.id}-${next.date}`,
    date: next.date,
    title: `${next.estimated ? '(Estimated) ' : ''}${grant.shortName || grant.name} deadline`,
    description: description(''),
    url: grant.url
  }];
}

/**
 * Validate the fields the grants UI relies on before treating fetched JSON as
 * application data. Optional presentation fields remain optional.
 * @param {unknown} value
 * @returns {value is Grant}
 */
function isGrant(value: unknown): value is Grant {
  if (!value || typeof value !== 'object') return false;
  const grant = value as Record<string, unknown>;
  return typeof grant.id === 'string'
    && typeof grant.name === 'string'
    && typeof grant.shortName === 'string'
    && typeof grant.sponsor === 'string'
    && typeof grant.sponsorCategory === 'string'
    && Array.isArray(grant.targetAudience)
    && typeof grant.whoFor === 'string'
    && typeof grant.deadline === 'string'
    && typeof grant.deadlineMonth === 'number'
    && typeof grant.amount === 'string'
    && typeof grant.summary === 'string'
    && Array.isArray(grant.eligibility)
    && Array.isArray(grant.topics)
    && typeof grant.url === 'string'
    && (grant.estimated === undefined || typeof grant.estimated === 'boolean');
}

/** @param {unknown} payload @returns {Grant[]} */
export function parseGrants(payload: unknown): Grant[] {
  if (!Array.isArray(payload) || !payload.every(isGrant)) {
    throw new Error('Invalid grants dataset');
  }
  return payload;
}

/** @returns {Promise<Grant[]>} */
export async function loadGrantsData(): Promise<Grant[]> {
  if (cachedGrants) return cachedGrants;
  const response = await fetch('/grants.json');
  if (!response.ok) throw new Error(`Failed to load grants data (${response.status})`);
  cachedGrants = parseGrants(await response.json());
  return cachedGrants;
}

function audienceMatches(grant: Grant, value: string) {
  if (value === 'all') return true;
  const text = grant.targetAudience.join(' ').toLowerCase();
  if (value === 'students') return /student|phd|undergraduate|doctoral/.test(text);
  if (value === 'phd') return /phd|doctoral/.test(text);
  if (value === 'undergrad') return text.includes('undergraduate');
  if (value === 'postdoc') return /postdoc|fellow/.test(text);
  return text.includes(value);
}

function categoryMatches(grant: Grant, value: string) {
  if (value === 'all') return true;
  const text = grant.sponsorCategory.toLowerCase();
  if (value === 'foundation') return /foundation|non-profit/.test(text);
  if (value === 'society') return /society|professional/.test(text);
  return text.includes(value);
}

function deadlineMatches(grant: Grant, value: string, now = new Date()) {
  if (value === 'all') return true;
  if (grant.status === 'historical') return false;
  const rolling = grant.deadlineMonth === 0 || /rolling/i.test(grant.deadline);
  if (value === 'rolling') return rolling;
  if (value === 'fixed') return !rolling;
  if (value === 'soon' || value === 'week') {
    const days = daysUntilNextDeadline(grant, now);
    return days !== null && days >= 0 && days <= (value === 'week' ? 7 : 30);
  }
  return !Number.isNaN(Number(value)) && grant.deadlineMonth === Number(value);
}

export function filterGrants(grants: Grant[], {
  query = '',
  audience = 'all',
  sponsorCategory = 'all',
  status = 'all',
  topic = 'all',
  deadlineFilter = 'all',
  sortBy = 'featured',
  now = new Date()
}: { query?: string, audience?: string, sponsorCategory?: string, status?: string, topic?: string, deadlineFilter?: string, sortBy?: string, now?: Date } = {}) {
  const { filters: keywordFilters, rest } = parseKeywordQuery(String(query || ''), GRANTS_KEYWORD_SPECS);
  const q = rest.trim().toLowerCase();

  let results = grants.filter(grant => {
    // Program status filter. Records without a status are treated as current.
    if (status === 'historical' && grant.status !== 'historical') return false;
    if (status === 'current' && grant.status === 'historical') return false;
    if (!matchesKeywordOptions(keywordFilters.status, value => value === 'all' || value === (grant.status === 'historical' ? 'historical' : 'current'))) return false;
    if (!matchesKeywordOptions(keywordFilters.sponsor, value => grant.sponsor.toLowerCase().includes(value))) return false;
    if (!matchesKeywordOptions(keywordFilters.audience, value => audienceMatches(grant, value))) return false;
    if (!matchesKeywordOptions(keywordFilters.category, value => categoryMatches(grant, value))) return false;
    if (!matchesKeywordOptions(keywordFilters.topic, value => grant.topics.some(topic => topic.toLowerCase().includes(value)))) return false;
    if (!matchesKeywordOptions(keywordFilters.loc, value => [grant.locationLabel, ...(grant.locations || [])].filter(Boolean).join(' ').toLowerCase().includes(value))) return false;
    if (!matchesKeywordOptions(keywordFilters.deadline, value => deadlineMatches(grant, value, now))) return false;
    if (!matchesKeywordOptions(keywordFilters.citizenship, value => citizenshipMatches(grant, value))) return false;
    if (keywordFilters.added && !matchesKeywordOptions(keywordFilters.added, value => {
      const window = addedWindowDays(value);
      const age = daysSince(grant.addedAt, now.getTime());
      return window !== null && age !== null && age <= window;
    })) return false;

    // Retain the pure filter API for callers using structured options.
    if (!audienceMatches(grant, audience)) return false;
    if (!categoryMatches(grant, sponsorCategory)) return false;
    if (topic !== 'all' && !grant.topics.some(value => value.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(value.toLowerCase()))) return false;
    if (!deadlineMatches(grant, deadlineFilter, now)) return false;

    // Free-text Query filter
    if (q) {
      const textToSearch = [
        grant.id,
        grant.name,
        grant.shortName,
        grant.sponsor,
        grant.whoFor,
        grant.summary,
        grant.amount,
        grant.deadline,
        grant.status === 'historical' ? 'historical inactive discontinued archived' : 'current active',
        ...(grant.locations || []),
        ...(grant.topics || []),
        ...(grant.eligibility || [])
      ].join(' ').toLowerCase();

      // Support multi-term queries
      const tokens = q.split(/\s+/).filter(Boolean);
      return tokens.every(tok => textToSearch.includes(tok));
    }

    return true;
  });

  // Sorting: upcoming dates first (exact or month-only), then rolling/undated, then passed, then historical.
  const sortKeys = new Map<Grant, number>();
  const deadlineSortKey = (grant: Grant) => {
    if (sortKeys.has(grant)) return sortKeys.get(grant)!;
    let key: number;
    if (grant.status === 'historical') key = 4e15;
    else {
      const next = nextGrantDeadline(grant, now);
      key = next.date ? dayValue(next.date)! : next.passed ? 3e15 : 2e15;
    }
    sortKeys.set(grant, key);
    return key;
  };

  results.sort((a, b) => {
    if (sortBy === 'featured') {
      if (Boolean(a.featured) !== Boolean(b.featured)) {
        return a.featured ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'deadline') {
      const keyA = deadlineSortKey(a), keyB = deadlineSortKey(b);
      if (keyA !== keyB) return keyA - keyB;
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'added') {
      const cmp = (b.addedAt || '').localeCompare(a.addedAt || '');
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'sponsor') {
      const cmp = (a.sponsor || '').localeCompare(b.sponsor || '');
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });

  return results;
}

/** @param {Grant[]} grants */
export function grantsSuggestions(grants: Grant[]) {
  const awardItems = [];
  const sponsorSet = new Map();
  const topicSet = new Map();
  const audienceSet = new Map();

  for (const grant of grants) {
    // Award names
    awardItems.push({
      label: grant.shortName || grant.name,
      detail: `${grant.sponsor} • ${grant.whoFor}`,
      searchTerms: `${grant.name} ${grant.sponsor} ${(grant.locations || []).join(' ')} ${(grant.topics || []).join(' ')}`,
      type: 'award',
      grantId: grant.id
    });

    // Sponsors
    const sponsorName = grant.sponsor.replace(/\s*\(.*\)/, '').trim();
    if (!sponsorSet.has(sponsorName)) {
      sponsorSet.set(sponsorName, {
        label: grant.sponsor,
        detail: `${grant.sponsorCategory} sponsor`,
        searchTerms: `${grant.sponsor} ${grant.sponsorCategory}`,
        type: 'sponsor'
      });
    }

    // Topics
    for (const t of grant.topics || []) {
      if (!topicSet.has(t)) {
        topicSet.set(t, {
          label: t,
          detail: 'Research area & topic',
          searchTerms: t,
          type: 'topic'
        });
      }
    }

    // Audiences
    for (const aud of grant.targetAudience || []) {
      if (!audienceSet.has(aud)) {
        audienceSet.set(aud, {
          label: aud,
          detail: 'Target audience',
          searchTerms: aud,
          type: 'audience'
        });
      }
    }
  }

  return {
    awards: awardItems,
    sponsors: Array.from(sponsorSet.values()),
    topics: Array.from(topicSet.values()),
    audiences: Array.from(audienceSet.values())
  };
}

export interface SponsorGrants { sponsor: string, category: string, grants: Grant[] }

/** Groups awards by sponsor, keeping the order of each sponsor's first appearance. */
export function groupBySponsor(grants: Grant[]): SponsorGrants[] {
  const groups = new Map<string, SponsorGrants>();
  grants.forEach(grant => {
    if (!groups.has(grant.sponsor)) groups.set(grant.sponsor, { sponsor: grant.sponsor, category: grant.sponsorCategory, grants: [] });
    groups.get(grant.sponsor)!.grants.push(grant);
  });
  return [...groups.values()];
}
