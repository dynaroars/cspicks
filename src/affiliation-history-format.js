export const AFFILIATION_HISTORY_FORMAT = 'cspicks-affiliations-v1';

export function decodeAffiliationHistory(payload) {
  if (!payload || payload.format !== AFFILIATION_HISTORY_FORMAT) return payload || {};

  const schools = payload.schools || [];
  return Object.fromEntries(Object.entries(payload.people || {}).map(([name, segments]) => [
    name,
    segments.map(([start, end, schoolIndex]) => ({
      start,
      end,
      school: schools[schoolIndex]
    }))
  ]));
}

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
