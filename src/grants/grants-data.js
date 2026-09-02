// @ts-check

/**
 * CS Awards & Grants Data Engine
 * Handles dataset loading, querying, structured filtering, and autocomplete indexing.
 */

/** @typedef {import('../types.js').Grant} Grant */

/** @type {Grant[] | null} */
let cachedGrants = null;

/**
 * Validate the fields the grants UI relies on before treating fetched JSON as
 * application data. Optional presentation fields remain optional.
 * @param {unknown} value
 * @returns {value is Grant}
 */
function isGrant(value) {
  if (!value || typeof value !== 'object') return false;
  const grant = /** @type {Record<string, unknown>} */ (value);
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
    && typeof grant.url === 'string';
}

/** @param {unknown} payload @returns {Grant[]} */
export function parseGrants(payload) {
  if (!Array.isArray(payload) || !payload.every(isGrant)) {
    throw new Error('Invalid grants dataset');
  }
  return payload;
}

/** @returns {Promise<Grant[]>} */
export async function loadGrantsData() {
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

/**
 * @param {Grant[]} grants
 * @param {{query?: string, audience?: string, sponsorCategory?: string, status?: string, topic?: string, deadlineFilter?: string, sortBy?: string}} [filters]
 */
export function filterGrants(grants, {
  query = '',
  audience = 'all',
  sponsorCategory = 'all',
  status = 'all',
  topic = 'all',
  deadlineFilter = 'all',
  sortBy = 'featured'
} = {}) {
  const q = String(query || '').trim().toLowerCase();

  let results = grants.filter(grant => {
    // Program status filter. Records without a status are treated as current.
    if (status === 'historical' && grant.status !== 'historical') return false;
    if (status === 'current' && grant.status === 'historical') return false;

    // Audience filter
    if (audience !== 'all') {
      const auds = (grant.targetAudience || []).map(a => a.toLowerCase());
      if (audience === 'faculty' && !auds.some(a => a.includes('faculty'))) return false;
      if (audience === 'students' && !auds.some(a => a.includes('student') || a.includes('phd') || a.includes('undergraduate') || a.includes('doctoral'))) return false;
      if (audience === 'phd' && !auds.some(a => a.includes('phd') || a.includes('doctoral'))) return false;
      if (audience === 'undergrad' && !auds.some(a => a.includes('undergraduate'))) return false;
      if (audience === 'postdoc' && !auds.some(a => a.includes('postdoc') || a.includes('fellow'))) return false;
    }

    // Sponsor Category filter
    if (sponsorCategory !== 'all') {
      const cat = (grant.sponsorCategory || '').toLowerCase();
      if (sponsorCategory === 'government' && !cat.includes('government')) return false;
      if (sponsorCategory === 'industry' && !cat.includes('industry')) return false;
      if (sponsorCategory === 'foundation' && !cat.includes('foundation') && !cat.includes('non-profit')) return false;
      if (sponsorCategory === 'society' && !cat.includes('society') && !cat.includes('professional')) return false;
    }

    // Topic filter
    if (topic !== 'all') {
      const topics = (grant.topics || []).map(t => t.toLowerCase());
      const targetTopic = topic.toLowerCase();
      if (!topics.some(t => t.includes(targetTopic) || targetTopic.includes(t))) return false;
    }

    // Deadline / Timing filter
    if (deadlineFilter !== 'all') {
      if (grant.status === 'historical') return false;
      if (deadlineFilter === 'rolling') {
        if (grant.deadlineMonth !== 0 && !grant.deadline.toLowerCase().includes('rolling')) return false;
      } else if (deadlineFilter === 'fixed') {
        if (grant.deadlineMonth === 0 || grant.deadline.toLowerCase().includes('rolling')) return false;
      } else if (!Number.isNaN(Number(deadlineFilter))) {
        const monthNum = Number(deadlineFilter);
        if (grant.deadlineMonth !== monthNum) return false;
      }
    }

    // Free-text Query filter
    if (q) {
      const textToSearch = [
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
      const getMonthOrder = m => {
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
export function grantsSuggestions(grants) {
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
