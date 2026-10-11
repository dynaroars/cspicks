import { assignCompetitionRanks, CONFERENCE_SET_IDS, filterByYears, geometricMeanScore, getConferenceAreaMap, publicationMatchesConferenceSet } from './data.js';
import type { ConferenceSetId } from './data/conference-sets.js';
import type { AffiliationHistory, FilteredData, FilteredProfessor, FilteredSchool, Professor, Publication, RawData, SchoolAliasMap } from './types.js';

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function percent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function hasProfileValue(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'noscholarpage' && normalized !== 'nohomepage';
}

function sumBy<T>(items: T[], value: (item: T) => number) {
  return items.reduce((total, item) => total + value(item), 0);
}

function topEntry(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
}

function cosineSimilarity(first: Record<string, number>, second: Record<string, number>) {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  let dot = 0;
  let firstLength = 0;
  let secondLength = 0;
  keys.forEach(key => {
    const a = first[key] || 0;
    const b = second[key] || 0;
    dot += a * b;
    firstLength += a * a;
    secondLength += b * b;
  });
  return firstLength && secondLength ? dot / Math.sqrt(firstLength * secondLength) : 0;
}

export function buildPriorPeriodData(rawData: RawData, startYear: number, endYear: number, region: string, historyMap: AffiliationHistory | null, aliasMap: SchoolAliasMap | null, confSet: string) {
  const span = endYear - startYear + 1;
  return filterByYears(rawData, startYear - span, startYear - 1, region, historyMap, aliasMap, confSet);
}

function getSchoolFaculty(filteredData: FilteredData, schoolName: string): FilteredProfessor[] {
  const school = filteredData.schools?.[schoolName];
  if (!school) return [];
  const names = new Set<string>();
  Object.values(school.areas || {}).forEach(area => {
    (area.faculty || []).forEach(name => names.add(name));
  });
  return [...names]
    .map(name => filteredData.professors?.[name])
    .filter((professor): professor is FilteredProfessor => Boolean(professor));
}

export function calculateSchoolMetrics(currentData: FilteredData, priorData: FilteredData | null, schoolName: string) {
  const school = currentData.schools?.[schoolName];
  if (!school) return null;
  const prior = priorData?.schools?.[schoolName];
  const faculty = getSchoolFaculty(currentData, schoolName);
  const contributions = faculty
    .map(prof => school.facultyAdjustedCounts
      ? school.facultyAdjustedCounts[prof.name] || 0
      : prof.totalAdjusted || 0)
    .sort((a, b) => b - a);
  const total = school.totalAdjusted || 0;
  const priorTotal = prior?.totalAdjusted || 0;
  const growth = priorTotal > 0 ? ((total - priorTotal) / priorTotal) * 100 : (total > 0 ? 100 : 0);
  const rankDelta = prior?.rank && school.rank ? prior.rank - school.rank : null;
  const activeAreas = Object.entries(school.areas || {}).filter(([, area]) => area.adjusted > 0);
  const sustainedAreas = activeAreas.filter(([area]) => (prior?.areas?.[area]?.adjusted || 0) > 0).length;
  const profileFields = faculty.length * 2;
  const profileFieldsPresent = faculty.reduce((sum, prof) => sum
    + Number(hasProfileValue(prof.homepage)) + Number(hasProfileValue(prof.scholarid)), 0);
  const profileCoverage = percent(profileFieldsPresent, profileFields);
  const confidence = profileCoverage >= 80 ? 'High' : profileCoverage >= 50 ? 'Medium' : 'Review';

  return {
    rank: school.rank,
    rankDelta,
    totalAdjusted: total,
    growth,
    facultyCount: faculty.length,
    medianPerFaculty: median(contributions),
    top1Share: percent(contributions[0] || 0, total),
    top3Share: percent(contributions.slice(0, 3).reduce((sum, value) => sum + value, 0), total),
    top5Share: percent(contributions.slice(0, 5).reduce((sum, value) => sum + value, 0), total),
    activeAreas: activeAreas.length,
    sustainedAreas,
    topTenAreas: activeAreas.filter(([area]) => (school.areaRanks?.[area] || Infinity) <= 10).length,
    collaborationRetention: percent(total, school.totalCount || 0),
    impliedTeamSize: total > 0 ? (school.totalCount || 0) / total : 0,
    profileCoverage,
    confidence
  };
}

/**
 * Find notable cross-school changes between two equal-length ranking periods.
 * Minimum-credit guards keep tiny denominators from dominating growth lists.
 */

export function rankSchoolsPerCapita(schools: Record<string, FilteredSchool> | FilteredSchool[], { minFaculty = 5 } = {}) {
  const rows = Object.values(schools || {})
    .map(school => {
      const facultyCount = Object.keys(school.facultyAdjustedCounts || {}).length;
      const totalAdjusted = Number.isFinite(school.totalAdjusted)
        ? school.totalAdjusted
        : Object.values(school.areas || {}).reduce((sum, area) => sum + (area.adjusted || 0), 0);
      return {
        name: school.name,
        school,
        facultyCount,
        overallRank: school.rank,
        perCapita: facultyCount ? totalAdjusted / facultyCount : 0
      };
    })
    .filter(row => row.name && row.facultyCount >= minFaculty);
  return assignCompetitionRanks(rows, (row: typeof rows[number]) => row.perCapita);
}

export function calculatePerCapita(filteredData: FilteredData, options?: { minFaculty?: number }) {
  return rankSchoolsPerCapita(filteredData?.schools, options);
}

/**
 * Re-ranks a filtered dataset's schools by per-capita output in place, so
 * anything that reads `school.rank` — rank-delta insights, area-rank guards,
 * the parity report — sees per-capita order without a separate code path.
 * Departments below `minFaculty` (same rule as calculatePerCapita) drop their
 * rank entirely rather than keep the departmental-total one, matching how the
 * per-capita toggle omits them from the search results list.
 */
export function applyPerCapitaRanks(filteredData: FilteredData, options?: { minFaculty?: number }) {
  const ranked = calculatePerCapita(filteredData, options);
  const rankedSchools = new Set();
  ranked.forEach(row => {
    row.school.rank = row.rank;
    rankedSchools.add(row.school);
  });
  Object.values(filteredData?.schools || {}).forEach(school => {
    if (!rankedSchools.has(school)) school.rank = null;
  });
  return filteredData;
}

export function calculateFragility(filteredData: FilteredData, schoolName: string, {
  thresholds = [10, 25, 50],
  maxRemovals = 15,
  // Keep going past the last threshold so the trajectory shows a curve rather
  // than a single point for departments already outside every band.
  minSteps = 5
} = {}) {
  const school = filteredData?.schools?.[schoolName];
  if (!school || !Number.isFinite(school.rank)) return null;
  const schoolRank = school.rank!;

  // Per-person, per-area credit, accumulated by the data pipeline.
  const contributions: Record<string, Record<string, number>> = {};
  Object.entries(school.areas || {}).forEach(([area, data]) => {
    Object.entries(data.facultyStats || {}).forEach(([name, stats]) => {
      if (!contributions[name]) contributions[name] = {};
      contributions[name][area] = (contributions[name][area] || 0) + (stats.adjusted || 0);
    });
  });
  const names = Object.keys(contributions);
  if (!names.length) return null;

  const otherScores = Object.values(filteredData.schools)
    .filter(other => other.name !== schoolName && Number.isFinite(other.score))
    .map(other => other.score ?? 0);
  const rankOf = (score: number) => 1 + otherScores.filter(other => other > score).length;

  let areaCounts = { ...school.areaAdjustedCounts };
  const remaining = new Set(names);
  const steps: Array<{ removed: string, score: number, rank: number }> = [];
  const exits: Record<number, number> = {};
  // A department already outside a threshold needs no departures to leave it.
  thresholds.forEach(threshold => { if (schoolRank > threshold) exits[threshold] = 0; });

  for (let removed = 1; removed <= maxRemovals && remaining.size; removed++) {
    let best: { name: string, exact: number, counts: Record<string, number> } | null = null;
    for (const name of remaining) {
      const trial = { ...areaCounts };
      Object.entries(contributions[name]!).forEach(([area, adjusted]) => {
        trial[area] = Math.max(0, (trial[area] || 0) - adjusted);
      });
      // Compare on the unrounded mean: in a large department every single
      // departure moves the reported score by less than the 0.1 it rounds to,
      // so choosing on the rounded value would tie every candidate and remove
      // an arbitrary person instead of the costliest one.
      const exact = geometricMeanScore(trial);
      if (!best || exact < best.exact) best = { name, exact, counts: trial };
    }
    if (!best) break;
    areaCounts = best.counts;
    remaining.delete(best.name);
    // Ranking is against other departments' rounded scores, so report rounded.
    const score = Math.round(10 * best.exact) / 10;
    const rank = rankOf(score);
    steps.push({ removed: best.name, score, rank });
    thresholds.forEach(threshold => {
      if (!(threshold in exits) && rank > threshold) exits[threshold] = removed;
    });
    if (thresholds.every(threshold => threshold in exits) && steps.length >= minSteps) break;
  }

  return { rank: schoolRank, score: school.score, facultyCount: names.length, steps, exits, thresholds };
}

export function calculatePublishingEffort(
  professors: Record<string, Professor>,
  { startYear, endYear, parentAreas, includesPublication }: {
    startYear: number;
    endYear: number;
    parentAreas: Record<string, string>;
    includesPublication: (professor: Professor, publication: Publication) => boolean;
  }
) {
  const years = endYear - startYear + 1;
  if (!Number.isFinite(years) || years <= 0) {
    return { activeFaculty: 0, subfields: [] };
  }

  const facultyOutput: Record<string, number>[] = [];
  Object.values(professors || {}).forEach(professor => {
    const output: Record<string, number> = {};
    (professor.pubs || []).forEach(publication => {
      if (publication.year < startYear || publication.year > endYear) return;
      if (!includesPublication(professor, publication)) return;

      const subfield = parentAreas[publication.area] || publication.area;
      const credit = Number(publication.adjustedcount) || 0;
      if (credit > 0) output[subfield] = (output[subfield] || 0) + credit;
    });
    if (Object.keys(output).length) facultyOutput.push(output);
  });

  const activeFaculty = facultyOutput.length;
  if (!activeFaculty) return { activeFaculty: 0, subfields: [] };

  const totals: Record<string, number> = {};
  const researchers: Record<string, number> = {};
  facultyOutput.forEach(output => {
    Object.entries(output).forEach(([subfield, credit]) => {
      totals[subfield] = (totals[subfield] || 0) + credit;
      researchers[subfield] = (researchers[subfield] || 0) + 1;
    });
  });

  const subfields = Object.entries(totals).map(([subfield, total]) => ({
    subfield,
    total,
    activeResearchers: researchers[subfield],
    effort: total / activeFaculty / years
  })).sort((a, b) => b.effort - a.effort || a.subfield.localeCompare(b.subfield));

  return { activeFaculty, subfields };
}

export function calculateAreaMomentum(current: FilteredData, prior: FilteredData | null, schoolName: string, { minAdjusted = 2, limit = 4 } = {}) {
  const currentSchool = current?.schools?.[schoolName];
  if (!currentSchool) return [];
  const priorSchool = prior?.schools?.[schoolName];

  const fieldTotals = (data: FilteredData | null) => {
    const totals: Record<string, number> = {};
    Object.values(data?.schools || {}).forEach(school => {
      Object.entries(school.areaAdjustedCounts || {}).forEach(([area, value]) => {
        totals[area] = (totals[area] || 0) + value;
      });
    });
    return totals;
  };
  const growth = (now: number, before: number) => before > 0 ? ((now - before) / before) * 100 : null;

  const fieldNow = fieldTotals(current);
  const fieldBefore = fieldTotals(prior);

  return Object.entries(currentSchool.areaAdjustedCounts || {})
    .map(([area, value]) => {
      const before = priorSchool?.areaAdjustedCounts?.[area] || 0;
      return {
        area,
        current: value,
        prior: before,
        growth: growth(value, before),
        fieldGrowth: growth(fieldNow[area] || 0, fieldBefore[area] || 0)
      };
    })
    .filter(entry => entry.growth !== null && entry.fieldGrowth !== null
      && entry.current >= minAdjusted && entry.prior >= minAdjusted)
    .map(entry => ({ ...entry, delta: entry.growth! - entry.fieldGrowth! }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

interface RankStabilityVariant {
  key: string;
  span: number;
  confSet: ConferenceSetId;
  startYear: number;
  endYear: number;
}

export interface RankStabilitySample {
  key: string;
  variant: RankStabilityVariant;
  ranks: Record<string, number>;
  ranked: number;
}

const RANK_STABILITY_WINDOWS = [5, 10, 20, 30];

export function rankStabilityVariants(endYear: number): RankStabilityVariant[] {
  return RANK_STABILITY_WINDOWS.flatMap(span => CONFERENCE_SET_IDS.map(confSet => ({
    key: `${span}|${confSet}`,
    span,
    confSet,
    // Inclusive, matching every other year range in the app: a 5-year window
    // ending in 2026 is 2022–2026, not 2021–2026.
    startYear: endYear - span + 1,
    endYear
  })));
}

/**
 * One sweep run. Returns every school's rank under this variant, so a single
 * pass over the data serves every school rather than one.
 */
export function collectVariantRanks(
  rawData: RawData,
  variant: RankStabilityVariant,
  { region, historyMap, aliasMap }: { region: string, historyMap: AffiliationHistory | null, aliasMap: SchoolAliasMap | null }
): RankStabilitySample {
  const data = filterByYears(rawData, variant.startYear, variant.endYear, region, historyMap, aliasMap, variant.confSet);
  const ranks: Record<string, number> = {};
  let ranked = 0;
  Object.values(data.schools).forEach(school => {
    if (!school.name || !Number.isFinite(school.rank)) return;
    ranks[school.name] = school.rank!;
    ranked++;
  });
  return { key: variant.key, variant, ranks, ranked };
}

/**
 * Collapse the sweep into one school's rank envelope. `samples` are the
 * `collectVariantRanks` results; variants where the school never ranks are
 * reported rather than silently dropped.
 */
export function summarizeRankStability(samples: RankStabilitySample[], schoolName: string) {
  const rows = samples.map(sample => ({
    span: sample.variant.span,
    confSet: sample.variant.confSet,
    rank: sample.ranks[schoolName] ?? null,
    of: sample.ranked
  }));
  const ranked = rows.filter(row => Number.isFinite(row.rank));
  if (!ranked.length) return null;

  const values = ranked.map(row => row.rank as number);
  const best = Math.min(...values);
  const worst = Math.max(...values);
  return {
    rows,
    best,
    worst,
    spread: worst - best,
    // A rank is an integer position: an even sample count would otherwise
    // report a half-place ("#12.5"), which is not a rank anyone can occupy.
    median: Math.round(median(values)),
    settings: rows.length,
    unranked: rows.length - ranked.length,
    // A rank that barely moves is a property of the department; one that swings
    // across tens of places is mostly an artifact of the settings.
    stable: worst - best <= Math.max(3, Math.round(best * 0.25))
  };
}

export function calculateResearcherPatterns(
  professor: Professor | null,
  peers: Record<string, FilteredProfessor> = {},
  options: { startYear?: number, endYear?: number, confSet?: string, areaMap?: Record<string, string> } = {}
) {
  if (!professor) return null;
  const startYear = Number(options.startYear);
  const endYear = Number(options.endYear);
  const confSet = options.confSet || 'all-union';
  const areaMap = options.areaMap || getConferenceAreaMap(confSet);
  const publications = (professor.pubs || []).filter(pub =>
    pub.year >= startYear && pub.year <= endYear && publicationMatchesConferenceSet(pub, confSet)
  );
  if (!publications.length) return null;

  const yearly: Record<number, { count: number, adjusted: number }> = {};
  const areas: Record<string, number> = {};
  const venues: Record<string, { count: number, adjusted: number, years: Set<number> }> = {};
  publications.forEach(pub => {
    if (!yearly[pub.year]) yearly[pub.year] = { count: 0, adjusted: 0 };
    yearly[pub.year]!.count += pub.count || 0;
    yearly[pub.year]!.adjusted += pub.adjustedcount || 0;
    const area = areaMap[pub.area] || pub.area;
    areas[area] = (areas[area] || 0) + (pub.adjustedcount || 0);
    if (!venues[pub.area]) venues[pub.area] = { count: 0, adjusted: 0, years: new Set() };
    venues[pub.area]!.count += pub.count || 0;
    venues[pub.area]!.adjusted += pub.adjustedcount || 0;
    venues[pub.area]!.years.add(pub.year);
  });

  const activeYears = Object.keys(yearly).map(Number).sort((a, b) => a - b);
  const selectedYears = Math.max(1, endYear - startYear + 1);
  const totalAdjusted = sumBy(publications, pub => pub.adjustedcount || 0);
  const totalPapers = sumBy(publications, pub => pub.count || 0);
  const peak = Object.entries(yearly).sort(([, a], [, b]) => b.adjusted - a.adjusted)[0];
  let activeStreak = 1;
  for (let index = activeYears.length - 1; index > 0 && activeYears[index]! - activeYears[index - 1]! === 1; index--) activeStreak++;

  const recentStart = Math.max(startYear, endYear - 2);
  const priorStart = Math.max(startYear, recentStart - 3);
  const recentAdjusted = sumBy(publications.filter(pub => pub.year >= recentStart), pub => pub.adjustedcount || 0);
  const priorAdjusted = sumBy(publications.filter(pub => pub.year >= priorStart && pub.year < recentStart), pub => pub.adjustedcount || 0);
  const momentum = priorAdjusted > 0 ? ((recentAdjusted - priorAdjusted) / priorAdjusted) * 100 : null;
  const annualValues = Array.from({ length: selectedYears }, (_, index) => yearly[startYear + index]?.adjusted || 0);
  const annualMean = sumBy(annualValues, value => value) / selectedYears;
  const annualVariance = sumBy(annualValues, value => (value - annualMean) ** 2) / selectedYears;
  const volatility = annualMean > 0 ? Math.sqrt(annualVariance) / annualMean : 0;

  const primaryArea = topEntry(areas);
  const areaShares = Object.values(areas).map(value => value / totalAdjusted).filter(value => value > 0);
  const entropy = areaShares.length > 1
    ? -sumBy(areaShares, share => share * Math.log(share)) / Math.log(areaShares.length)
    : 0;
  const midpoint = Math.floor((startYear + endYear) / 2);
  const periodAreas = (range: (publication: Publication) => boolean) => {
    const counts: Record<string, number> = {};
    publications.filter(range).forEach(pub => {
      const area = areaMap[pub.area] || pub.area;
      counts[area] = (counts[area] || 0) + (pub.adjustedcount || 0);
    });
    return counts;
  };
  const earlyAreas = periodAreas(pub => pub.year <= midpoint);
  const recentAreas = periodAreas(pub => pub.year > midpoint);
  const earlyPrimary = topEntry(earlyAreas);
  const recentPrimary = topEntry(recentAreas);
  const pivot = earlyPrimary && recentPrimary && earlyPrimary[0] !== recentPrimary[0]
    && earlyPrimary[1] >= 0.5 && recentPrimary[1] >= 0.5
    ? { from: earlyPrimary[0], to: recentPrimary[0], midpoint }
    : null;
  const emergingAreas = Object.keys(recentAreas).filter(area => (recentAreas[area] || 0) >= 0.5 && !((earlyAreas[area] || 0) > 0));
  const dormantAreas = Object.keys(earlyAreas).filter(area => (earlyAreas[area] || 0) >= 0.5 && !((recentAreas[area] || 0) > 0));

  const topVenue = Object.entries(venues).sort(([, a], [, b]) => b.adjusted - a.adjusted)[0] || null;
  const venueConcentration = topVenue ? percent(topVenue[1].adjusted, totalAdjusted) : 0;
  const mostPersistentVenue = Object.entries(venues).sort(([, a], [, b]) => b.years.size - a.years.size || b.adjusted - a.adjusted)[0] || null;
  const earlyVenues: Record<string, number> = {};
  const recentVenues: Record<string, number> = {};
  publications.forEach(pub => {
    const target = pub.year <= midpoint ? earlyVenues : recentVenues;
    target[pub.area] = (target[pub.area] || 0) + (pub.adjustedcount || 0);
  });
  const earlyTopVenue = topEntry(earlyVenues);
  const recentTopVenue = topEntry(recentVenues);
  const venueShift = earlyTopVenue && recentTopVenue && earlyTopVenue[0] !== recentTopVenue[0]
    ? { from: earlyTopVenue[0], to: recentTopVenue[0] }
    : null;

  // Peers are only useful as "where else could I work on this?", so colleagues
  // at the target's own university are excluded from both rankings.
  const peerList = Object.values(peers).filter(peer =>
    peer.name !== professor.name && peer.totalAdjusted > 0 && peer.affiliation !== professor.affiliation);

  const similarPeers = peerList
    .map(peer => ({
      name: peer.name,
      affiliation: peer.affiliation,
      similarity: cosineSimilarity(areas,
        Object.fromEntries(Object.entries(peer.areas || {}).map(([area, values]) => [area, values.adjusted || 0])))
    }))
    .filter(peer => peer.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name))
    .slice(0, 3);

  const highlights: string[] = [];
  if (pivot) highlights.push(`Primary research emphasis shifted between the earlier and later halves of the selected period.`);
  if (momentum !== null && Math.abs(momentum) >= 25) highlights.push(`Recent three-year adjusted output is ${Math.abs(momentum).toFixed(0)}% ${momentum > 0 ? 'higher' : 'lower'} than the preceding three-year window.`);
  if (primaryArea && percent(primaryArea[1], totalAdjusted) >= 60) highlights.push(`${percent(primaryArea[1], totalAdjusted).toFixed(0)}% of adjusted output is concentrated in one research area.`);
  if (!highlights.length && activeYears.length >= 3) highlights.push(`Eligible publications appear in ${activeYears.length} of ${selectedYears} selected years.`);

  return {
    publications, yearly, totalAdjusted, totalPapers, activeYears,
    consistency: percent(activeYears.length, selectedYears), activeStreak,
    peak: peak ? { year: Number(peak[0]), ...peak[1] } : null,
    recentAdjusted, priorAdjusted, momentum, volatility,
    areas, breadth: Object.keys(areas).length, primaryArea,
    primaryAreaShare: primaryArea ? percent(primaryArea[1], totalAdjusted) : 0,
    balance: entropy * 100, pivot, emergingAreas, dormantAreas,
    venues, venueBreadth: Object.keys(venues).length, topVenue,
    venueConcentration, mostPersistentVenue, venueShift,
    similarPeers, highlights
  };
}

export function explainRankGap(schoolA: FilteredSchool | null, schoolB: FilteredSchool | null) {
  const areas = new Set([
    ...Object.keys(schoolA?.areaAdjustedCounts || {}),
    ...Object.keys(schoolB?.areaAdjustedCounts || {})
  ]);
  return [...areas].map(area => {
    const a = schoolA?.areaAdjustedCounts?.[area] || 0;
    const b = schoolB?.areaAdjustedCounts?.[area] || 0;
    const logGap = Math.log1p(a) - Math.log1p(b);
    return { area, a, b, logGap, leader: logGap >= 0 ? 'a' : 'b' };
  }).sort((x, y) => Math.abs(y.logGap) - Math.abs(x.logGap));
}

/**
 * `modes` carries the settings that change the ranking away from the official
 * CSRankings one. Venue set is not the only one: per-capita reorders the whole
 * list, and History reattributes publications to past affiliations, so a
 * "matches CSRankings" claim has to account for all three.
 */
export function calculateParityReport(rawData: RawData, filteredData: FilteredData, confSet = 'csrankings-default', modes: { perCapita?: boolean, historical?: boolean } = {}) {
  const schools = Object.values(filteredData.schools || {});
  const professors = Object.values(filteredData.professors || {});
  const totalMismatches = schools.filter(school => {
    const areaTotal = Object.values(school.areas || {}).reduce((sum, area) => sum + area.adjusted, 0);
    return Math.abs(areaTotal - school.totalAdjusted) > 1e-6;
  }).length;
  const sorted = [...schools].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
  const rankOrderIssues = sorted.filter((school, index) => index > 0
    && (school.score || 0) > (sorted[index - 1]?.score || 0)).length;
  const institutionCoverage = percent(
    schools.filter(school => school.country || school.region).length,
    schools.length
  );
  const profileCoverage = percent(
    professors.filter(prof => hasProfileValue(prof.homepage) || hasProfileValue(prof.scholarid)).length,
    professors.length
  );

  const officialVenueMode = confSet === 'csrankings-default';
  // Each entry names a setting that makes this view intentionally differ from
  // csrankings.org, so the panel can say *why* rather than only that it does.
  const divergences = [
    !officialVenueMode && 'a non-default venue set',
    modes.perCapita && 'per-capita ranking',
    modes.historical && 'historical affiliations'
  ].filter(Boolean);
  const matchesCsrankings = divergences.length === 0
    && totalMismatches === 0
    && rankOrderIssues === 0;

  return {
    sourceFaculty: Object.keys(rawData.professors || {}).length,
    rankedSchools: schools.length,
    totalMismatches,
    rankOrderIssues,
    institutionCoverage,
    profileCoverage,
    officialVenueMode,
    divergences,
    matchesCsrankings
  };
}

export function calculateCorpusDiagnostics(rawData: RawData, filteredData: FilteredData) {
  const activeProfs = Object.values(filteredData.professors || {}).filter(p => (p.totalAdjusted || 0) > 0);
  const areaTotals: Record<string, number> = {};
  let totalAdjusted = 0;
  for (const school of Object.values(filteredData.schools || {})) {
    for (const [area, info] of Object.entries(school.areas || {})) {
      const adj = info.adjusted || 0;
      areaTotals[area] = (areaTotals[area] || 0) + adj;
      totalAdjusted += adj;
    }
  }

  // 1. Shannon Entropy & Field HHI
  const areaEntries = Object.entries(areaTotals).sort((a, b) => b[1] - a[1]);
  let entropy = 0;
  let hhi = 0;
  for (const [, count] of areaEntries) {
    const p = totalAdjusted > 0 ? count / totalAdjusted : 0;
    if (p > 0) entropy -= p * Math.log(p);
    hhi += Math.pow(p * 100, 2);
  }
  const maxEntropy = areaEntries.length > 0 ? Math.log(areaEntries.length) : 0;
  const normalizedEntropy = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;

  // 2. Gini coefficient of faculty output
  const scores = activeProfs.map(p => p.totalAdjusted || 0).sort((a, b) => a - b);
  const n = scores.length;
  const sumScores = scores.reduce((a, b) => a + b, 0);
  let gini = 0;
  if (n > 0 && sumScores > 0) {
    let weightedSum = 0;
    for (let i = 0; i < n; i++) {
      weightedSum += (2 * (i + 1) - n - 1) * scores[i]!;
    }
    gini = weightedSum / (n * sumScores);
  }

  // Top 10% concentration
  const top10Count = Math.max(1, Math.round(n * 0.1));
  const top10Sum = scores.slice(-top10Count).reduce((a, b) => a + b, 0);
  const top10Concentration = sumScores > 0 ? (top10Sum / sumScores) * 100 : 0;

  // 3. Interdisciplinary bridge ratio (authors with >= 2 subfields)
  const bridgeProfs = activeProfs.filter(p => {
    const uniqueAreas = new Set((p.pubs || []).map(pub => pub.area));
    return uniqueAreas.size >= 2;
  });
  const bridgeRatio = activeProfs.length > 0 ? (bridgeProfs.length / activeProfs.length) * 100 : 0;

  // 4. Team size / co-authorship depth
  let totalRawCount = 0;
  for (const prof of activeProfs) {
    totalRawCount += prof.totalCount || 0;
  }
  const coauthorshipDepth = totalAdjusted > 0 ? (totalRawCount / totalAdjusted) : 1;

  // 5. Name disambiguation pressure in raw roster
  const disambiguatedAuthors = Object.keys(rawData.professors || {}).filter(name =>
    /\s+\d+$|\s+\[\d+\]|\s+\(.*\)/.test(name) || (rawData.professors[name]?.unitNotes && rawData.professors[name].unitNotes.length > 0)
  ).length;

  return {
    entropy,
    normalizedEntropy,
    hhi: Math.round(hhi),
    topArea: areaEntries[0] ? { key: areaEntries[0][0], share: totalAdjusted > 0 ? (areaEntries[0][1] / totalAdjusted) * 100 : 0 } : null,
    gini,
    top10Concentration,
    bridgeRatio,
    coauthorshipDepth,
    disambiguatedAuthors,
    activeFacultyCount: activeProfs.length
  };
}

/**
 * Measure how a school's fractional publication output is distributed across
 * subfields. The denominator is the school's full set of active faculty in the
 * period, rather than only the people who published in a given subfield. This
 * keeps a subfield represented by one person from looking like the school's
 * dominant publishing effort merely because that person's individual rate is
 * high.
 */

const formatAdjusted = (value: unknown) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

interface VerdictEntry {
  rank?: number | null;
  totalAdjusted?: number;
}

type VerdictSide = 'a' | 'b';

/**
 * Decide the one line a reader should be able to stop at. "Leads in N areas"
 * measures breadth; the headline measure — rank for schools, adjusted output
 * for researchers — measures size. The two can disagree, and saying so is the
 * most useful thing on the page: it is exactly the depth-versus-breadth
 * tradeoff a single ordered list hides.
 *
 * Returns the decision only, so the branches can be tested without markup.
 */
export function describeVerdict(
  type: 'school' | 'researcher',
  entryA: VerdictEntry,
  entryB: VerdictEntry,
  aWins: number,
  bWins: number
) {
  const rankA = entryA.rank;
  const rankB = entryB.rank;
  const headline: { leader: VerdictSide | null, phrase: string, verb: string } = type === 'school'
    // Rank is the headline for a school, and lower wins.
    ? {
      leader: rankA === rankB ? null : rankA == null ? 'b' : rankB == null ? 'a' : rankA < rankB ? 'a' : 'b',
      phrase: `${rankA == null ? 'unranked' : `#${rankA}`} vs ${rankB == null ? 'unranked' : `#${rankB}`}`,
      verb: 'ranks higher'
    }
    : (() => {
      // Compare at the precision the sentence quotes, or a 12.44-vs-12.35 pair
      // reads as "12.4 vs 12.4 adjusted" while naming a leader.
      const shownA = Math.round(Number(entryA.totalAdjusted || 0) * 10);
      const shownB = Math.round(Number(entryB.totalAdjusted || 0) * 10);
      return {
        leader: shownA === shownB ? null : (shownA > shownB ? 'a' : 'b'),
        phrase: `${formatAdjusted(entryA.totalAdjusted)} vs ${formatAdjusted(entryB.totalAdjusted)} adjusted`,
        verb: 'has more output'
      };
    })();
  const areaLeader: VerdictSide | null = aWins === bWins ? null : (aWins > bWins ? 'a' : 'b');
  const kind = !headline.leader && !areaLeader ? 'even'
    : !headline.leader ? 'breadth-only'
      : !areaLeader || headline.leader === areaLeader ? 'agree'
        : 'split';
  return { ...headline, areaLeader, kind };
}

type SchoolCredit = { name: string, credit: number };
type AreaChange = { name: string, area: string, currentCredit: number, priorCredit: number, gain: number };

export function calculateDiscoveryInsights(currentData: FilteredData, priorData: FilteredData, limit = 5) {
  const regionalAreaTotals: Record<string, number> = {};
  let regionalTotal = 0;
  Object.values(currentData?.schools || {}).forEach(school => {
    regionalTotal += school.totalAdjusted || 0;
    Object.entries(school.areas || {}).forEach(([area, values]) => {
      regionalAreaTotals[area] = (regionalAreaTotals[area] || 0) + (values.adjusted || 0);
    });
  });

  const schools = Object.values(currentData?.schools || {}).map(school => {
    const prior = priorData?.schools?.[school.name];
    const metrics = calculateSchoolMetrics(currentData, priorData, school.name)!;
    const priorAreas = Object.values(prior?.areas || {}).filter(area => area.adjusted > 0).length;
    const topArea = Object.entries(school.areas || {})
      .map(([area, values]) => ({ area, credit: values.adjusted || 0 }))
      .sort((a, b) => b.credit - a.credit)[0];
    const focusArea = Object.entries(school.areas || {})
      .map(([area, values]) => {
        const credit = values.adjusted || 0;
        const portfolioShare = percent(credit, school.totalAdjusted || 0);
        const regionalBaseline = percent(regionalAreaTotals[area] || 0, regionalTotal);
        return {
          area,
          credit,
          regionalShare: percent(credit, regionalAreaTotals[area] || 0),
          portfolioShare,
          regionalBaseline,
          specialization: regionalBaseline > 0 ? portfolioShare / regionalBaseline : 0,
          areaRank: school.areaRanks?.[area] || null
        };
      })
      .filter(area => area.credit >= 2 && area.areaRank && area.areaRank <= 25)
      .sort((a, b) => b.specialization - a.specialization || b.regionalShare - a.regionalShare)[0];
    return {
      name: school.name,
      school,
      prior,
      metrics,
      outputGain: (school.totalAdjusted || 0) - (prior?.totalAdjusted || 0),
      breadthGain: metrics.activeAreas - priorAreas,
      topArea,
      focusArea,
      topAreaShare: topArea && school.totalAdjusted > 0
        ? percent(topArea.credit, school.totalAdjusted)
        : 0
    };
  });

  const take = <T>(items: T[], compare: (a: T, b: T) => number) => [...items].sort(compare).slice(0, limit);
  const established = schools.filter(item =>
    item.prior?.rank && item.prior.totalAdjusted >= 2 && item.school.totalAdjusted >= 2
  );
  const substantive = schools.filter(item =>
    item.school.totalAdjusted >= 5 && item.metrics.facultyCount >= 3
  );
  const portfolioSchools = schools.filter(item =>
    item.school.totalAdjusted >= 5 && item.metrics.facultyCount >= 5
  );

  const areaBreakouts: AreaChange[] = [];
  const areaDeclines: AreaChange[] = [];
  schools.forEach(item => {
    const areas = new Set([
      ...Object.keys(item.school.areas || {}),
      ...Object.keys(item.prior?.areas || {})
    ]);
    areas.forEach(area => {
      const currentCredit = item.school.areas?.[area]?.adjusted || 0;
      const priorCredit = item.prior?.areas?.[area]?.adjusted || 0;
      const gain = currentCredit - priorCredit;
      if (currentCredit >= 2 && gain > 0) {
        areaBreakouts.push({ name: item.name, area, currentCredit, priorCredit, gain });
      }
      if (priorCredit >= 2 && gain < 0) {
        areaDeclines.push({ name: item.name, area, currentCredit, priorCredit, gain });
      }
    });
  });

  return {
    rankClimbers: take(
      established.filter(item => (item.metrics.rankDelta || 0) > 0),
      (a, b) => (b.metrics.rankDelta || 0) - (a.metrics.rankDelta || 0) || (a.metrics.rank || Infinity) - (b.metrics.rank || Infinity)
    ),
    rankDroppers: take(
      established.filter(item => (item.metrics.rankDelta || 0) < 0),
      (a, b) => (a.metrics.rankDelta || 0) - (b.metrics.rankDelta || 0) || (a.metrics.rank || Infinity) - (b.metrics.rank || Infinity)
    ),
    momentum: take(
      established.filter(item => item.metrics.growth > 0),
      (a, b) => b.metrics.growth - a.metrics.growth || b.outputGain - a.outputGain
    ),
    slowdowns: take(
      established.filter(item => item.metrics.growth < 0),
      (a, b) => a.metrics.growth - b.metrics.growth || a.outputGain - b.outputGain
    ),
    outputGains: take(
      schools.filter(item => item.outputGain > 0),
      (a, b) => b.outputGain - a.outputGain
    ),
    outputLosses: take(
      schools.filter(item => item.prior && item.outputGain < 0),
      (a, b) => a.outputGain - b.outputGain
    ),
    breadthBuilders: take(
      established.filter(item => item.breadthGain > 0),
      (a, b) => b.breadthGain - a.breadthGain || b.outputGain - a.outputGain
    ),
    breadthContractions: take(
      established.filter(item => item.breadthGain < 0),
      (a, b) => a.breadthGain - b.breadthGain || a.outputGain - b.outputGain
    ),
    balancedPortfolios: take(
      portfolioSchools,
      (a, b) => a.metrics.top3Share - b.metrics.top3Share || b.school.totalAdjusted - a.school.totalAdjusted
    ),
    focusedPowerhouses: take(
      substantive.filter(item => item.focusArea),
      (a, b) => b.focusArea!.specialization - a.focusArea!.specialization || b.focusArea!.regionalShare - a.focusArea!.regionalShare
    ),
    areaBreakouts: take(areaBreakouts, (a, b) => b.gain - a.gain || b.currentCredit - a.currentCredit),
    areaDeclines: take(areaDeclines, (a, b) => a.gain - b.gain || b.priorCredit - a.priorCredit)
  };
}

/**
 * The subfield-level counterpart to calculateDiscoveryInsights: instead of
 * asking which universities moved, asks which research areas themselves grew,
 * shrank, broadened, narrowed, or changed leader region-wide. Same
 * equal-length-period comparison and minimum-credit guards.
 */
export function calculateSubfieldDiscoveries(currentData: FilteredData, priorData: FilteredData, limit = 5) {
  const areasOf = (data: FilteredData) => Object.values(data.schools).flatMap(school => Object.keys(school.areas || {}));
  const areas = new Set([...areasOf(currentData), ...areasOf(priorData)]);

  const activeSchools = (data: FilteredData, area: string): SchoolCredit[] => Object.values(data.schools)
    .map(school => ({ name: school.name, credit: school.areas?.[area]?.adjusted || 0 }))
    .filter(row => row.credit > 0);

  const leadersOf = (rows: SchoolCredit[]) => {
    const max = rows.reduce((best, row) => Math.max(best, row.credit), 0);
    return max > 0 ? rows.filter(row => row.credit === max).map(row => row.name) : [];
  };

  const summaries = [...areas].map(area => {
    const current = activeSchools(currentData, area);
    const prior = activeSchools(priorData, area);
    const currentTotal = current.reduce((sum, row) => sum + row.credit, 0);
    const priorTotal = prior.reduce((sum, row) => sum + row.credit, 0);
    const currentLeaders = leadersOf(current);
    const priorLeaders = leadersOf(prior);
    const leaderChanged = priorLeaders.length > 0 && currentLeaders.length > 0
      && !currentLeaders.some(name => priorLeaders.includes(name));

    return {
      area, currentTotal, priorTotal,
      growth: priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal) * 100 : (currentTotal > 0 ? 100 : 0),
      schoolCount: current.length,
      priorSchoolCount: prior.length,
      schoolGain: current.length - prior.length,
      leaderChanged,
      newLeader: currentLeaders[0] || null,
      formerLeader: priorLeaders[0] || null
    };
  });

  const take = <T>(items: T[], compare: (a: T, b: T) => number) => [...items].sort(compare).slice(0, limit);
  // Both periods need at least a small amount of real output, so a subfield
  // with a couple of stray publications doesn't dominate a percentage list.
  const established = summaries.filter(s => s.priorTotal >= 2 && s.currentTotal >= 2);
  const withSpread = summaries.filter(s => s.priorSchoolCount >= 3);

  return {
    growth: take(
      established.filter(s => s.growth > 0),
      (a, b) => b.growth - a.growth || b.currentTotal - a.currentTotal
    ),
    decline: take(
      established.filter(s => s.growth < 0),
      (a, b) => a.growth - b.growth || b.priorTotal - a.priorTotal
    ),
    expandingReach: take(
      withSpread.filter(s => s.schoolGain > 0),
      (a, b) => b.schoolGain - a.schoolGain || b.schoolCount - a.schoolCount
    ),
    narrowingReach: take(
      withSpread.filter(s => s.schoolGain < 0),
      (a, b) => a.schoolGain - b.schoolGain || a.schoolCount - b.schoolCount
    ),
    leadershipChanges: take(
      established.filter(s => s.leaderChanged),
      (a, b) => b.currentTotal - a.currentTotal
    )
  };
}

/**
 * Head-to-head between two research areas: region-wide totals, growth versus
 * the preceding equal-length period, and the universities and researchers
 * active in both - the area-level counterpart to a school-vs-school or
 * researcher-vs-researcher comparison.
 */
export function compareAreas(currentData: FilteredData, priorData: FilteredData, areaA: string, areaB: string) {
  const schoolsIn = (data: FilteredData, area: string): SchoolCredit[] => Object.values(data.schools)
    .map(school => ({ name: school.name, credit: school.areas?.[area]?.adjusted || 0 }))
    .filter(row => row.credit > 0)
    .sort((a, b) => b.credit - a.credit);

  const facultyIn = (data: FilteredData, area: string) => {
    const names = new Set<string>();
    Object.values(data.schools).forEach(school => {
      (school.areas?.[area]?.faculty || []).forEach(name => names.add(name));
    });
    return names;
  };

  const totalOf = (data: FilteredData, area: string) => Object.values(data.schools)
    .reduce((sum, school) => sum + (school.areas?.[area]?.adjusted || 0), 0);

  const sideOf = (area: string) => {
    const currentTotal = totalOf(currentData, area);
    const priorTotal = totalOf(priorData, area);
    const currentFaculty = facultyIn(currentData, area);
    const priorFaculty = facultyIn(priorData, area);
    return {
      area,
      currentTotal,
      priorTotal,
      growth: priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal) * 100 : (currentTotal > 0 ? 100 : 0),
      schools: schoolsIn(currentData, area),
      facultyCount: currentFaculty.size,
      // In the field now but not in the preceding period at all - a fresh
      // entrant to the subfield, not just someone publishing more there.
      newFaculty: [...currentFaculty].filter(name => !priorFaculty.has(name)).sort()
    };
  };

  const a = sideOf(areaA);
  const b = sideOf(areaB);

  const facultyA = facultyIn(currentData, areaA);
  const facultyB = facultyIn(currentData, areaB);
  const bothFaculty = [...facultyA].filter(name => facultyB.has(name)).sort();

  const creditBByName = new Map(b.schools.map(row => [row.name, row.credit]));
  const bothSchools = a.schools
    .filter(row => creditBByName.has(row.name))
    .map(row => ({ name: row.name, creditA: row.credit, creditB: creditBByName.get(row.name) }))
    .sort((x, y) => (y.creditA + y.creditB!) - (x.creditA + x.creditB!));

  return { a, b, bothFaculty, bothSchools };
}

/**
 * The same head-to-head as compareAreas, one level down: two individual venues
 * rather than two research areas. School rollups are keyed by top-level area,
 * so venue totals have to come from each professor's own publication list,
 * where the conference key survives.
 */
export function compareConferences(currentData: FilteredData, priorData: FilteredData, confA: string, confB: string) {
  const collect = (data: FilteredData, conf: string) => {
    const totals = { conf, total: 0, schools: new Map<string, number>(), faculty: new Set<string>() };
    Object.values(data.professors).forEach(professor => {
      const credit = (professor.pubs || [])
        .filter(pub => pub.area === conf)
        .reduce((sum, pub) => sum + (Number(pub.adjustedcount) || 0), 0);
      if (credit <= 0) return;
      totals.total += credit;
      totals.faculty.add(professor.name);
      const school = professor.affiliation;
      if (school) totals.schools.set(school, (totals.schools.get(school) || 0) + credit);
    });
    return totals;
  };

  const build = (conf: string) => {
    const now = collect(currentData, conf);
    const before = collect(priorData, conf);
    return {
      area: conf,
      currentTotal: now.total,
      priorTotal: before.total,
      growth: before.total > 0
        ? ((now.total - before.total) / before.total) * 100
        : (now.total > 0 ? 100 : 0),
      schools: [...now.schools.entries()]
        .map(([name, credit]) => ({ name, credit }))
        .sort((x, y) => y.credit - x.credit),
      facultyCount: now.faculty.size,
      newFaculty: [...now.faculty].filter(name => !before.faculty.has(name)).sort(),
      faculty: now.faculty
    };
  };

  const a = build(confA);
  const b = build(confB);
  const bothFaculty = [...a.faculty].filter(name => b.faculty.has(name)).sort();
  const creditBByName = new Map(b.schools.map(row => [row.name, row.credit]));
  const bothSchools = a.schools
    .filter(row => creditBByName.has(row.name))
    .map(row => ({ name: row.name, creditA: row.credit, creditB: creditBByName.get(row.name) }))
    .sort((x, y) => (y.creditA + y.creditB!) - (x.creditA + x.creditB!));

  return { a, b, bothFaculty, bothSchools };
}
