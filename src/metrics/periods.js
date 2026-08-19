import { filterByYears } from '../data.js';

export function buildPriorPeriodData(rawData, startYear, endYear, region, historyMap, aliasMap, confSet) {
  const span = endYear - startYear + 1;
  return filterByYears(rawData, startYear - span, startYear - 1, region, historyMap, aliasMap, confSet);
}
