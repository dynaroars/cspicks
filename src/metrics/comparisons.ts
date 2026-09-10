import { CONFERENCE_SET_IDS, assignCompetitionRanks, filterByYears, geometricMeanScore, getConferenceAreaMap, publicationMatchesConferenceSet } from '../data.js';
import { hasProfileValue, percent } from './math.js';
import type { FilteredData, FilteredSchool, RawData } from '../types.js';

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
