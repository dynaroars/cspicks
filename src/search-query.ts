/** Keyword constraints select existing records; their dataset-wide metrics stay unchanged. */
import { matchesKeywordOptions } from './search-keywords.js';
import { areaLabels, getConferenceLabel } from './shared.js';
import { getConferenceAreaMap, getPublicationSchools, schoolAliases } from './data.js';
import type { AffiliationHistory, FilteredData, SchoolAliasMap } from './types.js';

export function filterSearchRecords(data: FilteredData, keywords: Record<string, string[]>, confSet: string, history: { historyMap?: AffiliationHistory | null; aliasMap?: SchoolAliasMap | null } = {}): FilteredData {
  if (!Object.keys(keywords).length) return data;
  const venues = getConferenceAreaMap(confSet);
  const schoolMatches = (name: string) => matchesKeywordOptions(keywords.school, value => {
    const canonical = schoolAliases[value] || value;
    return name.toLowerCase().includes(canonical.toLowerCase());
  });
  const subjectMatches = (professor: FilteredData['professors'][string]) => matchesKeywordOptions(keywords.area, value =>
    professor.pubs.some(pub => {
      const area = venues[pub.area] || pub.area;
      return `${area} ${areaLabels[area] || ''} ${pub.area} ${getConferenceLabel(pub.area)}`.toLowerCase().includes(value);
    }));
  const professors = Object.fromEntries(Object.entries(data.professors).filter(([, professor]) =>
    (!keywords.school || professor.pubs.some(pub => getPublicationSchools(professor, pub, history.historyMap, history.aliasMap).some(schoolMatches))) && subjectMatches(professor) && matchesKeywordOptions(keywords.prof, value =>
      [professor.name, ...(professor.aliases || [])].some(name => name.toLowerCase().includes(value)))));
  const schools = Object.fromEntries(Object.entries(data.schools).filter(([name, school]) => {
    if (!schoolMatches(name)) return false;
    if (!keywords.prof && !keywords.area) return true;
    return Object.values(school.areas).some(area => area.faculty.some(name => professors[name]));
  }));
  return { professors, schools };
}
