// @ts-check

/** @typedef {import('./types.js').AffiliationHistory} AffiliationHistory */
/** @typedef {import('./types.js').SchoolAliasMap} SchoolAliasMap */

export const AFFILIATION_HISTORY_FORMAT = 'cspicks-affiliations-v1';

/** @param {unknown} payload @returns {AffiliationHistory} */
export function decodeAffiliationHistory(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const record = /** @type {Record<string, unknown>} */ (payload);
  if (record.format !== AFFILIATION_HISTORY_FORMAT) {
    return isAffiliationHistory(record) ? record : {};
  }

  const schools = Array.isArray(record.schools) && record.schools.every(school => typeof school === 'string')
    ? record.schools
    : [];
  const people = record.people && typeof record.people === 'object'
    ? /** @type {Record<string, unknown>} */ (record.people)
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

/** @param {Record<string, unknown>} value @returns {value is AffiliationHistory} */
function isAffiliationHistory(value) {
  return Object.values(value).every(segments => Array.isArray(segments) && segments.every(segment => {
    if (!segment || typeof segment !== 'object') return false;
    const item = /** @type {Record<string, unknown>} */ (segment);
    return typeof item.school === 'string'
      && typeof item.start === 'number'
      && typeof item.end === 'number';
  }));
}

/**
 * @param {AffiliationHistory} history
 * @param {SchoolAliasMap} [aliasMap]
 */
export function encodeAffiliationHistory(history, aliasMap = {}) {
  const schools = [];
  const schoolIndexes = new Map();
  const people = {};

  for (const [name, segments] of Object.entries(decodeAffiliationHistory(history))) {
    const encoded = [];
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
