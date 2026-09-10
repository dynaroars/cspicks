import { getConferenceAreaMap, publicationMatchesConferenceSet, schoolAliases } from './data.js';
import { areaLabels, cleanName, countryFlag, getConferenceLabel } from './shared.js';
import { createSuggestionBox, rankSuggestions } from './suggestion-box.js';
import type { FilteredData } from './types.js';
import type { SuggestionItem } from './suggestion-box.js';

// The Search box's autocomplete: universities, professors, areas, and
// conferences, ranked by how well they match what has been typed.
//
// The list is scrollable, so groups keep enough rows to hold every plausible
// match — a surname like "Nguyen" has dozens — and each group says how many
// matches exist when it has to trim.
const GROUP_LIMITS = { schools: 12, professors: 25, areas: 8, conferences: 8 };

export function createSearchSuggestionBox({ input, listbox, getContext, onSelect }: {
  input: HTMLInputElement;
  listbox: HTMLElement;
  getContext: () => { appData: FilteredData | null, confSet: string };
  onSelect: (item: SuggestionItem, prefix: string) => void;
}) {
  return createSuggestionBox({
    input,
    listbox,
    onSelect,
    emptyText: 'No matching university, professor, area, or conference',
    getGroups: (query, { comparing }) => {
      const { appData, confSet } = getContext();
      if (!appData) return null;

      const aliasesBySchool = new Map<string, string[]>();
      Object.entries(schoolAliases).forEach(([alias, school]) => {
        if (!aliasesBySchool.has(school)) aliasesBySchool.set(school, []);
        aliasesBySchool.get(school)!.push(alias);
      });

      const schools = rankSuggestions(Object.values(appData.schools).map(school => ({
        kind: 'school',
        label: school.name,
        value: school.name,
        flag: countryFlag(school.country, school.countryName),
        detail: Number.isFinite(school.rank) ? `University · #${school.rank}` : 'University',
        searchTerms: (aliasesBySchool.get(school.name) || []).join(' '),
        target: { type: 'school', name: school.name }
      })), query, GROUP_LIMITS.schools);
      const professors = rankSuggestions(Object.values(appData.professors).map(professor => ({
        kind: 'researcher',
        label: cleanName(professor.name),
        value: professor.name,
        detail: professor.affiliation || 'Professor',
        searchTerms: (professor.aliases || []).join(' '),
        target: { type: 'researcher', name: professor.name }
      })), query, GROUP_LIMITS.professors);

      // Only entities can be compared, so "A vs …" narrows the menu.
      if (comparing) return [['Universities', schools], ['Professors', professors]];

      const areas = rankSuggestions(Object.entries(areaLabels).map(([key, label]) => ({
        kind: 'area', label, value: label, detail: 'Research area', searchTerms: key
      })), query, GROUP_LIMITS.areas);
      const conferences = rankSuggestions(Object.keys(getConferenceAreaMap(confSet))
        .filter(key => publicationMatchesConferenceSet({ area: key }, confSet))
        .map(key => ({
          kind: 'conference', label: getConferenceLabel(key), value: key, detail: 'Conference'
        })), query, GROUP_LIMITS.conferences);

      return [
        ['Universities', schools],
        ['Professors', professors],
        ['Research areas', areas],
        ['Conferences', conferences]
      ];
    }
  });
}
