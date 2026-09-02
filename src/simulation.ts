import { parentMap, scoreFromAreaCounts } from './data.js';
import { rankSchoolsPerCapita } from './metrics.js';
import { cleanName } from './shared.js';
import type { AreaStats, FilteredSchool } from './types.js';

type CandidateAreaStats = number | Pick<AreaStats, 'adjusted'>;
type SimulatedSchool = FilteredSchool & { _simScore: number };

export interface SimulationOperation {
  school: FilteredSchool;
  stats: { areas: Record<string, CandidateAreaStats> };
  isRemoval: boolean;
  facultyKey?: string;
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: b.length + 1 }, () => Array<number>(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i++) { matrix[i]![0] = i; }
  for (let j = 0; j <= a.length; j++) { matrix[0]![j] = j; }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1
        );
      }
    }
  }
  return matrix[b.length]![a.length]!;
}

export function parseCandidateNames(value: unknown) {
  return [...new Set(
    String(value ?? '')
      .split(/\r?\n/)
      .map(name => name.trim())
      .filter(Boolean)
  )];
}

export function fuzzyMatch(nameA: string, nameB: string) {
  const a = cleanName(nameA).toLowerCase();
  const b = cleanName(nameB).toLowerCase();
  if (a === b) return true;

  // Split into parts and compare
  const partsA = a.split(/\s+/).filter(p => p.length > 0);
  const partsB = b.split(/\s+/).filter(p => p.length > 0);
  if (!partsA.length || !partsB.length) return false;

  // Extract first and last names
  const firstA = partsA[0]!.replace(/\.$/, '');
  const lastA = partsA[partsA.length - 1]!;
  const firstB = partsB[0]!.replace(/\.$/, '');
  const lastB = partsB[partsB.length - 1]!;
  if (!firstA || !firstB) return false;

  // Check: same last name AND (same first name OR one is initial of other)
  if (lastA === lastB) {
    if (firstA === firstB) return true;
    // Check if one first name starts with the other (handles initials like S. vs Samuel)
    if (firstA.startsWith(firstB[0]!) || firstB.startsWith(firstA[0]!)) {
      const shorter = firstA.length < firstB.length ? firstA : firstB;
      const longer = firstA.length < firstB.length ? firstB : firstA;
      // Only allow prefix match if the shorter one is an initial or short enough
      // And strictly require the longer to start with shorter
      if (shorter.length <= 2 && longer.startsWith(shorter)) return true;
    }
  }

  // Fallback: Levenshtein distance for close matches
  if (Math.abs(a.length - b.length) > 3) return false;

  if (lastA === lastB && partsA.length > 1 && partsB.length > 1) {
    const firstDist = levenshtein(firstA, firstB);
    return firstDist <= 1;
  }

  const distance = levenshtein(a, b);
  const maxLength = Math.max(a.length, b.length);

  // distance rules
  if (distance === 0) return true;
  if (distance === 1 && maxLength > 3) return true;
  if (distance === 2 && maxLength > 8) return true;

  return false;
}

function rankSchoolsByPerCapita(schoolList: FilteredSchool[], minFaculty: number) {
  return new Map(rankSchoolsPerCapita(schoolList, { minFaculty }).map(row => [row.name, row.rank]));
}

function cloneSchoolForSimulation(school: FilteredSchool): SimulatedSchool {
  const totalAdjusted = Number.isFinite(school.totalAdjusted)
    ? school.totalAdjusted
    : Object.values(school.areas || {}).reduce((sum, area) => sum + (area.adjusted || 0), 0);
  return {
    ...school,
    totalAdjusted,
    areas: Object.fromEntries(Object.entries(school.areas || {}).map(([area, stats]) => [area, {
      ...stats,
      faculty: [...(stats.faculty || [])],
      facultyStats: Object.fromEntries(Object.entries(stats.facultyStats || {}).map(([name, values]) => [name, { ...values }]))
    }])),
    facultyAdjustedCounts: { ...(school.facultyAdjustedCounts || {}) },
    facultyCounts: { ...(school.facultyCounts || {}) },
    areaAdjustedCounts: { ...(school.areaAdjustedCounts || {}) },
    areaRanks: { ...(school.areaRanks || {}) },
    _simScore: 0
  };
}

/**
 * ops: [{ school, stats, isRemoval, facultyKey }]. `facultyKey` is the name
 * this op adds to or removes from the school's faculty count — the roster
 * spelling being removed, or the candidate's own name being added — and only
 * matters when `perCapita` is on, since it drives the denominator.
 */
export function calculateRankImpact(schools: Record<string, FilteredSchool>, ops: SimulationOperation[], { perCapita = false, minFaculty = 5 } = {}) {
  const schoolClones = new Map<string, SimulatedSchool>();
  ops.forEach(op => {
    if (!schoolClones.has(op.school.name)) {
      schoolClones.set(op.school.name, cloneSchoolForSimulation(op.school));
    }
  });

  // Apply stats changes
  ops.forEach(op => {
    const clone = schoolClones.get(op.school.name)!;
    let adjustedDelta = 0;
    for (const [area, areaStats] of Object.entries(op.stats.areas)) {
      const val = typeof areaStats === 'number' ? areaStats : areaStats.adjusted;
      const cloneArea = clone.areas[area]
        || (clone.areas[area] = { count: 0, adjusted: 0, faculty: [], facultyStats: {} });
      const beforeAdjusted = cloneArea.adjusted;
      if (op.isRemoval) {
        cloneArea.adjusted = Math.max(0, cloneArea.adjusted - val);
      } else {
        cloneArea.adjusted += val;
      }
      adjustedDelta += cloneArea.adjusted - beforeAdjusted;
    }
    clone.totalAdjusted = Math.max(0, (clone.totalAdjusted || 0) + adjustedDelta);
    // Keep facultyAdjustedCounts (headcount) in sync with the same add/remove,
    // so a hypothetical faculty change also moves the per-capita denominator.
    if (op.facultyKey) {
      if (!clone.facultyAdjustedCounts) clone.facultyAdjustedCounts = {};
      if (op.isRemoval) delete clone.facultyAdjustedCounts[op.facultyKey];
      else {
        const total = Object.values(op.stats.areas).reduce<number>((sum, areaStats) =>
          sum + (typeof areaStats === 'number' ? areaStats : areaStats.adjusted || 0), 0);
        clone.facultyAdjustedCounts[op.facultyKey] = total;
      }
    }
  });

  // Construct full list for ranking
  const allSchools: SimulatedSchool[] = Object.values(schools).map(school =>
    schoolClones.get(school.name) ?? { ...school, _simScore: 0 }
  );

  const areas = new Set<string>();
  Object.values(parentMap).forEach(a => areas.add(a));
  const areaList = Array.from(areas);

  // The ranking formula lives in data.js; a hypothetical score has to use that
  // one rather than a copy here that could drift from it.
  const calcScore = (s: SimulatedSchool) => scoreFromAreaCounts(
    Object.fromEntries(areaList.map(area => [area, s.areas[area]?.adjusted || 0])));

  allSchools.forEach(s => {
    s._simScore = calcScore(s);
  });

  allSchools.sort((a, b) => b._simScore - a._simScore || a.name.localeCompare(b.name));

  let overallRank = 0;
  let previousScore: number | null = null;
  const overallRanks = new Map<string, number>();
  allSchools.forEach((school, index) => {
    if (school._simScore !== previousScore) overallRank = index + 1;
    overallRanks.set(school.name, overallRank);
    previousScore = school._simScore;
  });

  // Per-capita ranks mirror the toggle on Search and Discoveries: same rule,
  // computed once over the real (unmodified) schools for "before" and once
  // over the hypothetical allSchools for "after".
  const perCapitaRanksBefore = perCapita ? rankSchoolsByPerCapita(Object.values(schools), minFaculty) : null;
  const perCapitaRanksAfter = perCapita ? rankSchoolsByPerCapita(allSchools, minFaculty) : null;

  // area rankings for simulation
  const areaRanksBefore: Record<string, Record<string, number>> = {};
  const areaRanksAfter: Record<string, Record<string, number>> = {};
  ops.forEach(op => {
    areaRanksBefore[op.school.name] = op.school.areaRanks || {};
    areaRanksAfter[op.school.name] = {};
  });

  areaList.forEach(area => {
    const sorted = allSchools
      .filter(s => (s.areas[area]?.adjusted || 0) > 0)
      .sort((a, b) => (b.areas[area]?.adjusted || 0) - (a.areas[area]?.adjusted || 0));
    let rank = 0;
    let previousValue: number | null = null;
    sorted.forEach((school, index) => {
      const value = school.areas[area]!.adjusted;
      if (value !== previousValue) rank = index + 1;
      if (areaRanksAfter[school.name] !== undefined) areaRanksAfter[school.name]![area] = rank;
      previousValue = value;
    });
  });

  const deltaMap = new Map<string, { overall: number | null, areas: Record<string, unknown>, rankBefore: number | null | undefined, rankAfter: number | null | undefined }>();
  ops.forEach(op => {
    // rankBefore/rankAfter always reflect the active mode, so a caller reading
    // just `overall` (and, for display, `rankBefore`) never has to branch on
    // perCapita itself. Either side can be null: a department that crosses the
    // minFaculty line (in or out) as a direct result of this op has no
    // per-capita rank on that side, and the delta is reported as unavailable
    // rather than guessed at.
    const rankBefore = perCapita ? (perCapitaRanksBefore!.get(op.school.name) ?? null) : op.school.rank;
    const rankAfter = perCapita ? (perCapitaRanksAfter!.get(op.school.name) ?? null) : overallRanks.get(op.school.name);
    const delta = (rankBefore != null && rankAfter != null) ? rankBefore - rankAfter : null;

    const areaDeltasBefore = areaRanksBefore[op.school.name] || {};
    const areaDeltasAfter = areaRanksAfter[op.school.name] || {};
    const areaDeltas: Record<string, unknown> = {};
    areaList.forEach(area => {
      const before = areaDeltasBefore[area];
      const after = areaDeltasAfter[area];
      if (before !== undefined && after === undefined) {
        areaDeltas[area] = { dropped: true, wasRank: before };
      } else if (before === undefined && after !== undefined) {
        areaDeltas[area] = { entered: true, nowRank: after };
      } else if (before !== undefined && after !== undefined) {
        areaDeltas[area] = { delta: before - after, nowRank: after };
      }
    });

    deltaMap.set(op.school.name, { overall: delta, areas: areaDeltas, rankBefore, rankAfter });
  });

  return deltaMap;
}
