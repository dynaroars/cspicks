import { getConferenceAreaMap, publicationMatchesConferenceSet, schoolAliases } from './data.js';
import { areaLabels, cleanName, countryFlag, getConferenceLabel } from './shared.js';
import { rankSuggestions } from './suggestion-box.js';
import { createSearchControls } from './search-controls.js';
import type { FilteredData } from './types.js';
import type { SuggestionGroups, SuggestionItem } from './suggestion-box.js';

type Context = { appData: FilteredData | null; confSet: string };
function searchSources({ appData, confSet }: Context): Record<string, SuggestionItem[]> {
  if (!appData) return { school: [], prof: [], area: [], conferences: [] };
  const aliases = new Map<string, string[]>();
  Object.entries(schoolAliases).forEach(([alias, school]) => aliases.set(school, [...(aliases.get(school) || []), alias]));
  return {
    school: Object.values(appData.schools).map(school => ({
      kind: 'school', label: school.name, value: school.name, flag: countryFlag(school.country, school.countryName),
      detail: Number.isFinite(school.rank) ? `University · #${school.rank}` : 'University',
      searchTerms: (aliases.get(school.name) || []).join(' '), target: { type: 'school', name: school.name }
    })),
    prof: Object.values(appData.professors).map(professor => ({
      kind: 'researcher', label: cleanName(professor.name), value: professor.name,
      detail: professor.affiliation || 'Professor', searchTerms: (professor.aliases || []).join(' '),
      target: { type: 'researcher', name: professor.name }
    })),
    area: Object.entries(areaLabels).map(([key, label]) => ({ kind: 'area', label, value: label, detail: 'Research area', searchTerms: key })),
    conferences: Object.keys(getConferenceAreaMap(confSet)).filter(key => publicationMatchesConferenceSet({ area: key }, confSet))
      .map(key => ({ kind: 'conference', label: getConferenceLabel(key), value: key, detail: 'Conference' }))
  };
}

export function createSearchSuggestionBox(options: Omit<Parameters<typeof createSearchControls>[0], 'getGroups' | 'getKeywordSources'> & {
  getContext: () => Context;
}) {
  return createSearchControls({
    ...options,
    emptyText: 'No matching university, professor, area, or conference',
    getKeywordSources: () => {
      const sources = searchSources(options.getContext());
      return { ...sources, area: [...sources.area!, ...sources.conferences!] };
    },
    getGroups: (query, { comparing }) => {
      const sources = searchSources(options.getContext());
      const groups: SuggestionGroups = [
        ['Universities', rankSuggestions(sources.school!, query, 12)],
        ['Professors', rankSuggestions(sources.prof!, query, 25)]
      ];
      if (comparing) return groups;
      return [...groups, ['Research areas', rankSuggestions(sources.area!, query, 8)], ['Conferences', rankSuggestions(sources.conferences!, query, 8)]];
    }
  });
}
