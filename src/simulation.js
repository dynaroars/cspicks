import { parentMap, scoreFromAreaCounts } from './data.js';
import { cleanName } from './shared.js';

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
  for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function parseCandidateNames(value) {
  return [...new Set(
    String(value ?? '')
      .split(/\r?\n/)
      .map(name => name.trim())
      .filter(Boolean)
  )];
}

export function fuzzyMatch(nameA, nameB) {
  const a = cleanName(nameA).toLowerCase();
  const b = cleanName(nameB).toLowerCase();
  if (a === b) return true;

  // Split into parts and compare
  const partsA = a.split(/\s+/).filter(p => p.length > 0);
  const partsB = b.split(/\s+/).filter(p => p.length > 0);

  // Extract first and last names
  const firstA = partsA[0].replace(/\.$/, '');
  const lastA = partsA[partsA.length - 1];
  const firstB = partsB[0].replace(/\.$/, '');
  const lastB = partsB[partsB.length - 1];

  // Check: same last name AND (same first name OR one is initial of other)
  if (lastA === lastB) {
    if (firstA === firstB) return true;
    // Check if one first name starts with the other (handles initials like S. vs Samuel)
    if (firstA.startsWith(firstB[0]) || firstB.startsWith(firstA[0])) {
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

export function calculateRankImpact(schools, ops) {
  const schoolClones = new Map();
  ops.forEach(op => {
    const clone = JSON.parse(JSON.stringify(op.school));
    schoolClones.set(op.school.name, clone);
  });

  // Apply stats changes
  ops.forEach(op => {
    const clone = schoolClones.get(op.school.name);
    for (const [area, areaStats] of Object.entries(op.stats.areas)) {
      const val = typeof areaStats === 'number' ? areaStats : areaStats.adjusted;
      if (!clone.areas[area]) {
        clone.areas[area] = { count: 0, adjusted: 0, faculty: [] };
      }
      if (op.isRemoval) {
        clone.areas[area].adjusted = Math.max(0, clone.areas[area].adjusted - val);
      } else {
        clone.areas[area].adjusted += val;
      }
    }
  });

  // Construct full list for ranking
  const allSchools = Object.values(schools).map(school =>
    schoolClones.has(school.name) ? schoolClones.get(school.name) : { ...school }
  );

  const areas = new Set();
  Object.values(parentMap).forEach(a => areas.add(a));
  const areaList = Array.from(areas);

  // The ranking formula lives in data.js; a hypothetical score has to use that
  // one rather than a copy here that could drift from it.
  const calcScore = (s) => scoreFromAreaCounts(
    Object.fromEntries(areaList.map(area => [area, s.areas[area]?.adjusted || 0])));

  allSchools.forEach(s => {
    s._simScore = calcScore(s);
  });

  allSchools.sort((a, b) => b._simScore - a._simScore || a.name.localeCompare(b.name));

  let overallRank = 0;
  let previousScore = null;
  const overallRanks = new Map();
  allSchools.forEach((school, index) => {
    if (school._simScore !== previousScore) overallRank = index + 1;
    overallRanks.set(school.name, overallRank);
    previousScore = school._simScore;
  });

  // area rankings for simulation
  const areaRanksBefore = {};
  const areaRanksAfter = {};
  ops.forEach(op => {
    areaRanksBefore[op.school.name] = op.school.areaRanks || {};
    areaRanksAfter[op.school.name] = {};
  });

  areaList.forEach(area => {
    const sorted = allSchools
      .filter(s => (s.areas[area]?.adjusted || 0) > 0)
      .sort((a, b) => (b.areas[area]?.adjusted || 0) - (a.areas[area]?.adjusted || 0));
    let rank = 0;
    let previousValue = null;
    sorted.forEach((school, index) => {
      const value = school.areas[area].adjusted;
      if (value !== previousValue) rank = index + 1;
      if (areaRanksAfter[school.name] !== undefined) areaRanksAfter[school.name][area] = rank;
      previousValue = value;
    });
  });

  const deltaMap = new Map();
  ops.forEach(op => {
    const newRank = overallRanks.get(op.school.name);
    const delta = op.school.rank - newRank;

    const areaDeltasBefore = areaRanksBefore[op.school.name];
    const areaDeltasAfter = areaRanksAfter[op.school.name];
    const areaDeltas = {};
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

    deltaMap.set(op.school.name, { overall: delta, areas: areaDeltas });
  });

  return deltaMap;
}
