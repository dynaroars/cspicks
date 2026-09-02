import { cleanName, escapeHtml, getInstitutionShortName } from './shared.js';
import type { AttributedNsfAward, FilteredSchool, FundingFaculty, FundingIndex, FundingSchool, NsfAward, NsfDataset } from './types.js';

/** @param {unknown} value @returns {value is string | null} */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** @param {unknown} value @returns {value is NsfAward} */
function isNsfAward(value: unknown): value is NsfAward {
  if (!value || typeof value !== 'object') return false;
  const award = value as Record<string, unknown>;
  return typeof award.id === 'string'
    && typeof award.title === 'string'
    && typeof award.awardee === 'string'
    && typeof award.awardDate === 'string'
    && typeof award.startDate === 'string'
    && typeof award.endDate === 'string'
    && typeof award.obligatedAmount === 'number'
    && typeof award.estimatedAmount === 'number'
    && typeof award.directorate === 'string'
    && typeof award.division === 'string'
    && typeof award.program === 'string'
    && typeof award.programManager === 'string'
    && typeof award.active === 'boolean'
    && Array.isArray(award.investigators)
    && award.investigators.every(person => {
      if (!person || typeof person !== 'object') return false;
      const investigator = person as Record<string, unknown>;
      return typeof investigator.name === 'string'
        && typeof investigator.role === 'string'
        && isNullableString(investigator.facultyName)
        && isNullableString(investigator.rosterName)
        && isNullableString(investigator.affiliation);
    });
}

/** @param {unknown} payload @returns {NsfDataset} */
export function parseNsfDataset(payload: unknown): NsfDataset {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid NSF dataset');
  const dataset = payload as Record<string, unknown>;
  if (!Array.isArray(dataset.awards) || !dataset.awards.every(isNsfAward)) {
    throw new Error('Invalid NSF awards dataset');
  }
  return payload as NsfDataset;
}

// Confirmed NSF award transfers need an explicit marker: estimated funding can
// exceed current obligations for ordinary continuing grants as well.
const confirmedTransferAwards = new Set(['2304748']);

// CSRankings sometimes lists a person under more than one spelling (e.g. with
// and without a middle initial), and the NSF snapshot records whichever variant
// the sync matched. Compare on a form that ignores middle initials but KEEPS
// CSRankings' trailing disambiguation number, which is what separates distinct
// people who share a name ("Adam Smith 0001" is not "Adam Smith 0006").
export function normalizeFundingName(name: unknown) {
  const tokens = String(name || '')
    .toLowerCase()
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return tokens
    .filter((token, index) => token.length > 1 || index === 0 || index === tokens.length - 1)
    .join(' ');
}

/**
 * Exact name first — which is the normal path, since the sync stores the
 * publication-table spelling. The normalized fallback covers people hired
 * since the snapshot was taken, and is accepted only when the professor's
 * current institution also matches: CSRankings has
 * distinct people whose names differ solely by middle initial — "Michael A.
 * Goodrich" (BYU) and "Michael T. Goodrich" (UC Irvine) — and attributing one
 * person's grants to another is worse than showing none.
 */
export function findFundingFaculty(index: FundingIndex | null, name: string, affiliation: string | null = null) {
  if (!index || !name) return null;
  const exact = index.facultyByName?.get(name);
  if (exact) return exact;
  if (!affiliation) return null;
  const candidate = index.facultyByNormalizedName?.get(normalizeFundingName(name));
  return candidate && candidate.affiliation === affiliation ? candidate : null;
}

export function awardYear(award: Pick<NsfAward, 'awardDate' | 'startDate'>) {
  const match = String(award.awardDate || award.startDate || '').match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function formatFunding(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: amount >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: amount >= 1_000_000 ? 1 : 0
  }).format(amount || 0);
}

const fundingDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
});

function parseFundingDate(value: unknown) {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? date
    : null;
}

function fundingDurationLabel(start: Date, end: Date) {
  if (!start || !end || end < start) return '';
  const inclusiveDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const months = Math.max(1, Math.round(inclusiveDays / (365.2425 / 12)));
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return [
    years ? `${years} ${years === 1 ? 'year' : 'years'}` : '',
    remainingMonths ? `${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}` : ''
  ].filter(Boolean).join(' ');
}

export function formatAwardPeriod(award: Pick<NsfAward, 'startDate' | 'endDate'>) {
  const start = parseFundingDate(award?.startDate);
  const end = parseFundingDate(award?.endDate);
  if (!start && !end) return '';
  if (!start) return `Ends ${fundingDateFormatter.format(end!)}`;
  if (!end) return `Starts ${fundingDateFormatter.format(start)}`;
  const duration = fundingDurationLabel(start, end);
  return `${fundingDateFormatter.format(start)} – ${fundingDateFormatter.format(end)}${duration ? ` · ${duration}` : ''}`;
}

export function buildFundingIndex(dataset: NsfDataset, startYear: number, endYear: number): FundingIndex {
  const awards = (dataset?.awards || []).filter(award => {
    const year = awardYear(award);
    const hasMatchedFaculty = (award.investigators || []).some(person => person.rosterName);
    return hasMatchedFaculty && year !== null && year >= startYear && year <= endYear;
  });
  const faculty = new Map<string, FundingFaculty>();
  const schools = new Map<string, Omit<FundingSchool, 'awards' | 'faculty'> & { awards: Map<string, AttributedNsfAward>, faculty: Set<string> }>();

  awards.forEach(award => {
    const investigatorCount = Math.max(1, award.investigators.length);
    const amount = award.estimatedAmount || award.obligatedAmount || 0;
    const share = amount / investigatorCount;
    // `rosterName` is the publication-table spelling the sync resolved this
    // investigator to; `facultyName` alone only means the NSF-listed name
    // matched a CSRankings roster row, which can still have no corresponding
    // publication-table entry at all (retired/unranked rows, bad matches).
    // Those show up nowhere else in the app, so they should not show up here
    // either — trust rosterName, not the weaker facultyName.
    award.investigators.filter(person => person.rosterName).forEach(person => {
      const facultyName = person.rosterName!;
      if (!faculty.has(facultyName)) faculty.set(facultyName, {
        name: facultyName, affiliation: person.affiliation, awards: [], attributedAmount: 0, totalAwardAmount: 0
      });
      const record = faculty.get(facultyName)!;
      record.awards.push({ ...award, role: person.role, attributedAmount: share });
      record.attributedAmount += share;
      record.totalAwardAmount += award.collaborativeTotalAmount || award.estimatedAmount || award.obligatedAmount || 0;

      if (!person.affiliation) return;
      if (!schools.has(person.affiliation)) schools.set(person.affiliation, {
        name: person.affiliation, awards: new Map(), faculty: new Set(), attributedAmount: 0
      });
      const school = schools.get(person.affiliation)!;
      const schoolAward = school.awards.get(award.id) || { ...award, attributedAmount: 0 };
      schoolAward.attributedAmount += share;
      school.awards.set(award.id, schoolAward);
      school.faculty.add(facultyName);
      school.attributedAmount += share;
    });
  });

  const facultyList = [...faculty.values()]
    .sort((a, b) => b.attributedAmount - a.attributedAmount || a.name.localeCompare(b.name));

  // Ambiguous normalized names (two different people who normalize alike) are
  // recorded as misses rather than guessed at.
  const facultyByNormalizedName = new Map<string, FundingFaculty | null>();
  facultyList.forEach(record => {
    const key = normalizeFundingName(record.name);
    facultyByNormalizedName.set(key, facultyByNormalizedName.has(key) ? null : record);
  });

  return {
    awards,
    faculty: facultyList,
    facultyByName: new Map(facultyList.map(record => [record.name, record])),
    facultyByNormalizedName,
    schools: [...schools.values()].map(school => ({
      ...school, awards: [...school.awards.values()], faculty: [...school.faculty]
    })).sort((a, b) => b.attributedAmount - a.attributedAmount || a.name.localeCompare(b.name))
  };
}

function yearBars(awards: AttributedNsfAward[]) {
  const totals = new Map<number, number>();
  awards.forEach(award => {
    const year = awardYear(award);
    if (year) totals.set(year, (totals.get(year) || 0) + (award.attributedAmount ?? award.estimatedAmount ?? award.obligatedAmount ?? 0));
  });
  if (!totals.size) return '';
  const max = Math.max(...totals.values());
  return `<div class="funding-years" aria-label="Funding by award year">${[...totals.entries()].sort(([a], [b]) => a - b).map(([year, amount]) =>
    `<div class="funding-year" title="${year}: ${escapeHtml(formatFunding(amount))}"><span style="height:${Math.max(4, amount / max * 100)}%"></span><small>${String(year).slice(-2)}</small></div>`
  ).join('')}</div>`;
}

function awardAmount(award: AttributedNsfAward, affiliation: string | null) {
  const attributed = award.attributedAmount ?? award.estimatedAmount ?? award.obligatedAmount ?? 0;
  const estimatedTotal = award.estimatedAmount || 0;
  const obligated = award.obligatedAmount || 0;
  const institution = getInstitutionShortName(affiliation || award.awardee || 'matched university');
  const collaborativeDetail = (award.collaborativeTotalAmount ?? 0) > Math.max(estimatedTotal, obligated)
    ? `<small class="funding-award-amount-detail">(${escapeHtml(formatFunding(award.collaborativeTotalAmount || 0))} collaborative intended total; ${escapeHtml(formatFunding(estimatedTotal || obligated))} local intended award)</small>`
    : '';
  const transferDetail = !collaborativeDetail && confirmedTransferAwards.has(String(award.id))
    ? `<small class="funding-award-amount-detail">(${escapeHtml(formatFunding(obligated))} obligated to ${escapeHtml(institution)})</small>`
    : '';
  return `<span class="funding-award-amount"><b>${escapeHtml(formatFunding(attributed))}</b><small class="funding-award-amount-label">intended share</small>${collaborativeDetail || transferDetail}</span>`;
}

function awardList(awards: AttributedNsfAward[], affiliation: string | null = '') {
  const sorted = [...awards].sort((a, b) => (awardYear(b) || 0) - (awardYear(a) || 0));
  return `<div class="funding-awards">${sorted.map(award => `
    <a href="https://www.nsf.gov/awardsearch/showAward?AWD_ID=${encodeURIComponent(award.id)}" target="_blank" rel="noopener noreferrer" class="funding-award">
      <span><strong>${escapeHtml(award.title)}</strong><small>${escapeHtml(award.program || award.division || 'NSF award')} · ${awardYear(award) || '—'} · ${escapeHtml(award.role || 'Matched investigator')}</small>${award.programManager ? `<small>Program manager: ${escapeHtml(award.programManager)}</small>` : ''}${formatAwardPeriod(award) ? `<small class="funding-award-period">Project: ${escapeHtml(formatAwardPeriod(award))}</small>` : ''}</span>
      ${awardAmount(award, affiliation)}
    </a>`).join('')}</div>`;
}

// Collapsed by default, like the Search cards: a name you can open. Listed
// under a university the details are already the point, so they stay open and
// lose the toggle.
export function renderFundingFacultyCard(person: FundingFaculty, { expanded = false, collapsible = true } = {}) {
  const heading = `<span class="professor-heading"><h2>${escapeHtml(cleanName(person.name))}</h2></span>`;
  const header = collapsible
    ? `<button type="button" class="card-header" data-action="open-funding-target">${heading}</button>`
    : `<div class="card-header">${heading}</div>`;
  return `<article class="card funding-card${expanded || !collapsible ? '' : ' collapsed'}" data-name="${escapeHtml(cleanName(person.name))}">
    ${header}
    <div class="card-content">
      <div class="card-stats funding-professor-summary">${escapeHtml(person.affiliation || 'Current affiliation')} · <strong>${person.awards.length}</strong> NSF ${person.awards.length === 1 ? 'award' : 'awards'} · <strong>${escapeHtml(formatFunding(person.attributedAmount))}</strong> intended share (<strong>${escapeHtml(formatFunding(person.totalAwardAmount))}</strong> full project value)</div>
      ${yearBars(person.awards)}
      ${awardList(person.awards, person.affiliation)}
    </div>
  </article>`;
}

export function renderFundingSchoolCard(school: FundingSchool, { expanded = false, collapsible = true } = {}) {
  const heading = `<h2>${escapeHtml(school.name)} <span class="card-badge">${school.faculty.length} CS faculty with NSF awards</span></h2>`;
  const header = collapsible
    ? `<button type="button" class="card-header" data-action="open-funding-target">${heading}</button>`
    : `<div class="card-header">${heading}</div>`;
  return `<article class="card funding-card${expanded || !collapsible ? '' : ' collapsed'}" data-name="${escapeHtml(school.name)}">
    ${header}
    <div class="card-content">
      <div class="card-stats"><strong>${school.awards.length}</strong> NSF ${school.awards.length === 1 ? 'award' : 'awards'} · <strong>${escapeHtml(formatFunding(school.attributedAmount))}</strong> intended funding attributed</div>
      <p class="funding-definition">Sum of intended-award shares for matched current CS faculty; this is not the university's complete NSF portfolio.</p>
      ${yearBars(school.awards)}
    </div>
  </article>`;
}

export function fundingMatches(record: FundingFaculty, query: string) {
  const haystack = [record.name, record.affiliation, ...(record.awards || []).flatMap(award => [award.title, award.program, award.programManager, award.division, award.directorate])]
    .filter(Boolean).join(' ').toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).every(token => haystack.includes(token));
}

function normalizedSearchTokens(value: unknown) {
  return String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

export function fundingFacultyNameMatches(record: FundingFaculty, query: string) {
  const nameTokens = normalizedSearchTokens(cleanName(record?.name));
  const queryTokens = normalizedSearchTokens(query);
  return queryTokens.length > 0 && queryTokens.every(queryToken =>
    nameTokens.some(nameToken => nameToken.startsWith(queryToken))
  );
}

export function fundingSchoolNameMatches(record: FundingSchool, query: string) {
  const name = String(record?.name || '').toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).every(token => name.includes(token));
}

export function fundingScopeLabel(dataset: NsfDataset) {
  return (dataset?.scope || []).map(getInstitutionShortName).join(', ') || 'No institutions';
}

export function calculateFundingDiscoveries(current: FundingIndex, prior: FundingIndex, publicationSchools: Record<string, FilteredSchool> = {}) {
  const currentByName = new Map(current.schools.map(school => [school.name, school]));
  const priorByName = new Map(prior.schools.map(school => [school.name, school]));
  const changes = current.schools.map(school => {
    const earlier = priorByName.get(school.name);
    const priorAmount = earlier?.attributedAmount || 0;
    const delta = school.attributedAmount - priorAmount;
    return { school, prior: earlier, priorAmount, delta, growth: priorAmount ? delta / priorAmount * 100 : null };
  });
  const substantive = changes.filter(item => item.priorAmount >= 100000 && item.school.attributedAmount >= 100000);
  const fundingRanks = new Map(current.schools.map((school, index) => [school.name, index + 1]));
  const rankGaps = current.schools.flatMap(school => {
    const publication = publicationSchools[school.name];
    if (!publication || school.attributedAmount < 100000 || publication.totalAdjusted < 2
      || !Number.isFinite(publication.rank)) return [];
    const fundingRank = fundingRanks.get(school.name)!;
    return [{ school, fundingRank, publicationRank: publication.rank!, gap: publication.rank! - fundingRank }];
  });
  const collaborative = new Map<string, NsfAward>();
  current.awards.filter(award => award.collaborativeTotalAmount).forEach(award => {
    const key = `${award.title}|${award.collaborativeTotalAmount}`;
    if (!collaborative.has(key)) collaborative.set(key, award);
  });

  return {
    topFunding: current.schools.slice(0, 5),
    fastestGrowth: substantive.filter(item => (item.growth || 0) > 0).sort((a, b) => (b.growth || 0) - (a.growth || 0)).slice(0, 5),
    fastestDecline: substantive.filter(item => (item.growth || 0) < 0).sort((a, b) => (a.growth || 0) - (b.growth || 0)).slice(0, 5),
    broadParticipation: [...current.schools].sort((a, b) => b.faculty.length - a.faculty.length || b.attributedAmount - a.attributedAmount).slice(0, 5),
    fundingAhead: rankGaps.filter(item => item.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 5),
    publicationsAhead: rankGaps.filter(item => item.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, 5),
    largestCollaborations: [...collaborative.values()].sort((a, b) => (b.collaborativeTotalAmount ?? 0) - (a.collaborativeTotalAmount ?? 0)).slice(0, 5),
    matchedSchools: currentByName.size
  };
}
