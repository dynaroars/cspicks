import { geometricMeanScore } from '../data.js';
import type { FilteredData } from '../types.js';

export function calculateFragility(filteredData: FilteredData, schoolName: string, {
  thresholds = [10, 25, 50],
  maxRemovals = 15,
  // Keep going past the last threshold so the trajectory shows a curve rather
  // than a single point for departments already outside every band.
  minSteps = 5
} = {}) {
  const school = filteredData?.schools?.[schoolName];
  if (!school || !Number.isFinite(school.rank)) return null;

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
  const steps = [];
  const exits: Record<number, number> = {};
  // A department already outside a threshold needs no departures to leave it.
  thresholds.forEach(threshold => { if (school.rank > threshold) exits[threshold] = 0; });

  for (let removed = 1; removed <= maxRemovals && remaining.size; removed++) {
    let best = null;
    for (const name of remaining) {
      const trial = { ...areaCounts };
      Object.entries(contributions[name]).forEach(([area, adjusted]) => {
        trial[area] = Math.max(0, (trial[area] || 0) - adjusted);
      });
      // Compare on the unrounded mean: in a large department every single
      // departure moves the reported score by less than the 0.1 it rounds to,
      // so choosing on the rounded value would tie every candidate and remove
      // an arbitrary person instead of the costliest one.
      const exact = geometricMeanScore(trial);
      if (!best || exact < best.exact) best = { name, exact, counts: trial };
    }
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

  return { rank: school.rank, score: school.score, facultyCount: names.length, steps, exits, thresholds };
}
