import { CONFERENCE_SET_IDS, assignCompetitionRanks, filterByYears, geometricMeanScore, getConferenceAreaMap, publicationMatchesConferenceSet } from '../data.js';
import { median } from './math.js';
import type { ConferenceSetId } from '../data/conference-sets.js';
import type { AffiliationHistory, RawData, SchoolAliasMap } from '../types.js';

export interface RankStabilityVariant {
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

export const RANK_STABILITY_WINDOWS = [5, 10, 20, 30];

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
