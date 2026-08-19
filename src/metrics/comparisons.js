import { CONFERENCE_SET_IDS, assignCompetitionRanks, filterByYears, geometricMeanScore, getConferenceAreaMap, publicationMatchesConferenceSet } from '../data.js';
import { hasProfileValue, percent } from './math.js';

export function explainRankGap(schoolA, schoolB) {
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
export function calculateParityReport(rawData, filteredData, confSet = 'csrankings-default', modes = {}) {
  const schools = Object.values(filteredData.schools || {});
  const professors = Object.values(filteredData.professors || {});
  const totalMismatches = schools.filter(school => {
    const areaTotal = Object.values(school.areas || {}).reduce((sum, area) => sum + area.adjusted, 0);
    return Math.abs(areaTotal - school.totalAdjusted) > 1e-6;
  }).length;
  const sorted = [...schools].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const rankOrderIssues = sorted.filter((school, index) => index > 0 && school.score > sorted[index - 1].score).length;
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

/**
 * Measure how a school's fractional publication output is distributed across
 * subfields. The denominator is the school's full set of active faculty in the
 * period, rather than only the people who published in a given subfield. This
 * keeps a subfield represented by one person from looking like the school's
 * dominant publishing effort merely because that person's individual rate is
 * high.
 */

const formatAdjusted = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

/**
 * Decide the one line a reader should be able to stop at. "Leads in N areas"
 * measures breadth; the headline measure — rank for schools, adjusted output
 * for researchers — measures size. The two can disagree, and saying so is the
 * most useful thing on the page: it is exactly the depth-versus-breadth
 * tradeoff a single ordered list hides.
 *
 * Returns the decision only, so the branches can be tested without markup.
 */
export function describeVerdict(type, entryA, entryB, aWins, bWins) {
  const headline = type === 'school'
    // Rank is the headline for a school, and lower wins.
    ? {
      leader: entryA.rank === entryB.rank ? null : (entryA.rank < entryB.rank ? 'a' : 'b'),
      phrase: `#${entryA.rank} vs #${entryB.rank}`,
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
  const areaLeader = aWins === bWins ? null : (aWins > bWins ? 'a' : 'b');
  const kind = !headline.leader && !areaLeader ? 'even'
    : !headline.leader ? 'breadth-only'
      : !areaLeader || headline.leader === areaLeader ? 'agree'
        : 'split';
  return { ...headline, areaLeader, kind };
}
