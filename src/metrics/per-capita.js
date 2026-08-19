import { assignCompetitionRanks } from '../data.js';

export function rankSchoolsPerCapita(schools, { minFaculty = 5 } = {}) {
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
  return assignCompetitionRanks(rows, row => row.perCapita);
}

export function calculatePerCapita(filteredData, options) {
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
export function applyPerCapitaRanks(filteredData, options) {
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
