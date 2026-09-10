import type { AffiliationHistory, SchoolAliasMap } from './types.js';

export const AFFILIATION_HISTORY_FORMAT = 'cspicks-affiliations-v1';

export function decodeAffiliationHistory(payload: unknown): AffiliationHistory {
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as Record<string, unknown>;
  if (record.format !== AFFILIATION_HISTORY_FORMAT) {
    return isAffiliationHistory(record) ? record : {};
  }

  const schools = Array.isArray(record.schools) && record.schools.every(school => typeof school === 'string')
    ? record.schools
    : [];
  const people = record.people && typeof record.people === 'object'
    ? record.people as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.entries(people).map(([name, value]) => [
    name,
    Array.isArray(value) ? value.flatMap(segment => {
      if (!Array.isArray(segment) || segment.length !== 3) return [];
      const [start, end, schoolIndex] = segment;
      const school = typeof schoolIndex === 'number' ? schools[schoolIndex] : undefined;
      return typeof start === 'number' && typeof end === 'number' && school
        ? [{ start, end, school }]
        : [];
    }) : []
  ]));
}

function isAffiliationHistory(value: Record<string, unknown>): value is AffiliationHistory {
  return Object.values(value).every(segments => Array.isArray(segments) && segments.every(segment => {
    if (!segment || typeof segment !== 'object') return false;
    const item = segment as Record<string, unknown>;
    return typeof item.school === 'string'
      && typeof item.start === 'number'
      && typeof item.end === 'number';
  }));
}

export function encodeAffiliationHistory(history: AffiliationHistory, aliasMap: SchoolAliasMap = {}) {
  const schools: string[] = [];
  const schoolIndexes = new Map<string, number>();
  const people: Record<string, [number, number, number][]> = {};

  for (const [name, segments] of Object.entries(decodeAffiliationHistory(history))) {
    const encoded: [number, number, number][] = [];
    for (const segment of segments || []) {
      const school = Object.prototype.hasOwnProperty.call(aliasMap, segment.school)
        ? aliasMap[segment.school]
        : segment.school;
      if (!school) continue;

      let schoolIndex = schoolIndexes.get(school);
      if (schoolIndex === undefined) {
        schoolIndex = schools.length;
        schools.push(school);
        schoolIndexes.set(school, schoolIndex);
      }
      encoded.push([segment.start, segment.end, schoolIndex]);
    }
    if (encoded.length) people[name] = encoded;
  }

  return { format: AFFILIATION_HISTORY_FORMAT, schools, people };
}
