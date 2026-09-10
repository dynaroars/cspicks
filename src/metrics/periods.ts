import { filterByYears } from '../data.js';
import type { AffiliationHistory, RawData, SchoolAliasMap } from '../types.js';

export function buildPriorPeriodData(rawData: RawData, startYear: number, endYear: number, region: string, historyMap: AffiliationHistory | null, aliasMap: SchoolAliasMap | null, confSet: string) {
  const span = endYear - startYear + 1;
  return filterByYears(rawData, startYear - span, startYear - 1, region, historyMap, aliasMap, confSet);
}
