/**
 * CS Awards & Grants Data Engine
 * Handles dataset loading, querying, structured filtering, and autocomplete indexing.
 */

import { matchesKeywordOptions, parseKeywordQuery } from '../search-keywords.js';
import type { KeywordSpec } from '../search-keywords.js';
import { FAVORITES_KEYWORD_SPEC } from '../favorites.js';
import type { Grant } from '../types.js';

let cachedGrants: Grant[] | null = null;

export const GRANTS_KEYWORD_SPECS: KeywordSpec[] = [
  { key: 'sponsor', example: 'sponsor: NSF', description: 'Sponsoring agency, foundation, or company' },
  { key: 'audience', aliases: ['who'], example: 'audience: postdoc', description: 'Who the award is for (faculty, PhD, undergrad, postdoc)' },
  { key: 'topic', aliases: ['area'], example: 'topic: AI', description: 'Research topic or area covered' },
  { key: 'loc', aliases: ['location', 'state'], example: 'loc: California', description: 'Eligible state/jurisdiction, for state-specific awards' },
  { key: 'category', aliases: ['sponsor-category'], example: 'category: industry', description: 'Sponsor category: government, industry, foundation, or society' },
  { key: 'deadline', example: 'deadline: rolling', description: 'rolling / open, fixed annual, or month number (1–12)' },
  { key: 'status', example: 'status: historical', description: '"all" (default), "current", or "historical" (discontinued) awards' },
  FAVORITES_KEYWORD_SPEC
];

const monthNumbers: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

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
  while (Date.UTC(projectedYear, month, day) < today) projectedYear += 1;
  if (projectedYear === Number(yearText)) return { text: deadline, estimated: Boolean(grant.estimated) };

  const projectedDate = `${monthName} ${day}, ${projectedYear}`;
  return {
    text: `Estimated ${deadline.replace(match[0], projectedDate)}`,
    estimated: true
  };
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
  const url = new URL('../../public/grants.json', import.meta.url).href;
  const response = await fetch(url).catch(() => fetch('./grants.json'));
  if (!response.ok) {
    const fallback = await fetch('./grants.json');
    if (!fallback.ok) throw new Error(`Failed to load grants data (${response.status})`);
    cachedGrants = parseGrants(await fallback.json());
    return cachedGrants;
  }
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

function deadlineMatches(grant: Grant, value: string) {
  if (value === 'all') return true;
  if (grant.status === 'historical') return false;
  const rolling = grant.deadlineMonth === 0 || /rolling/i.test(grant.deadline);
  if (value === 'rolling') return rolling;
  if (value === 'fixed') return !rolling;
  return !Number.isNaN(Number(value)) && grant.deadlineMonth === Number(value);
}

export function filterGrants(grants: Grant[], {
  query = '',
  audience = 'all',
  sponsorCategory = 'all',
  status = 'all',
  topic = 'all',
  deadlineFilter = 'all',
  sortBy = 'featured'
}: { query?: string, audience?: string, sponsorCategory?: string, status?: string, topic?: string, deadlineFilter?: string, sortBy?: string } = {}) {
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
    if (!matchesKeywordOptions(keywordFilters.deadline, value => deadlineMatches(grant, value))) return false;

    // Retain the pure filter API for callers using structured options.
    if (!audienceMatches(grant, audience)) return false;
    if (!categoryMatches(grant, sponsorCategory)) return false;
    if (topic !== 'all' && !grant.topics.some(value => value.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(value.toLowerCase()))) return false;
    if (!deadlineMatches(grant, deadlineFilter)) return false;

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

  // Sorting
  const currentMonth = new Date().getMonth() + 1; // 1-12

  results.sort((a, b) => {
    if (sortBy === 'featured') {
      if (Boolean(a.featured) !== Boolean(b.featured)) {
        return a.featured ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'deadline') {
      const getMonthOrder = (m: number) => {
        if (m === 0) return 99; // rolling at end
        return (m - currentMonth + 12) % 12;
      };
      const orderA = getMonthOrder(a.deadlineMonth || 0);
      const orderB = getMonthOrder(b.deadlineMonth || 0);
      if (orderA !== orderB) return orderA - orderB;
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
