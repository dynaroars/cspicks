import { scoreSuggestionMatch } from './shared.js';
import { createSearchController } from './vietprofs/search-kit.js';
import type { SuggestionItem as SharedSuggestionItem } from './vietprofs/search-kit.js';
import { splitComparisonQuery } from './comparison.js';

export interface SuggestionItem {
  kind?: string;
  label: string;
  value?: string;
  /** Completed keyword query; ordinary entity suggestions retain their own value. */
  query?: string;
  detail: string;
  searchTerms?: string;
  flag?: string;
  target?: { type: 'school' | 'researcher', name: string };
  type?: string;
  grantId?: string;
}

interface SuggestionGroup {
  items: SuggestionItem[];
  total: number;
}

export type SuggestionGroups = Array<[string, SuggestionGroup]>;

// The autocomplete menu every search page shares. Each page supplies its own rows through `getGroups`, so the
// boxes look and behave alike over different data.

// Ranks candidates for one group and keeps the best `limit`, reporting how many
// matched in total so a trimmed group can say "12 of 84".
export function rankSuggestions<T extends SuggestionItem>(items: T[], query: string, limit: number) {
  const matches = items
    .map(item => ({ item, score: scoreSuggestionMatch(`${item.label} ${item.searchTerms || ''}`, query) }))
    .filter(match => Number.isFinite(match.score))
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
  return { items: matches.slice(0, limit).map(match => match.item), total: matches.length };
}

// getGroups(query, { comparing }) returns `[label, { items, total }]` pairs, or null when the page has no data to
// offer yet. The listbox itself (markup, ARIA, arrows, Enter, Escape, ArrowDown-to-open, quiet focus on load) is
// VietProfs' shared createSearchController; this adapter only adds the "A vs B" trailing-side completion and maps
// the shared rows back to the page's own items.
export function createSuggestionBox({ input, listbox, getGroups, onSelect, onChange = () => {}, emptyText = 'No matching result' }: {
  input: HTMLInputElement;
  listbox: HTMLElement;
  getGroups: (query: string, options: { comparing: boolean }) => SuggestionGroups | null;
  onSelect: (item: SuggestionItem, prefix: string) => void;
  /** Called after typing (and after Escape clears the box), with the page's query in `input.value`. */
  onChange?: () => void;
  emptyText?: string;
}) {
  let comparePrefix = '';
  const originals = new WeakMap<SharedSuggestionItem, SuggestionItem>();
  const controller = createSearchController({
    input,
    suggestionPanel: listbox,
    useScopeChip: false,
    emptyText,
    onChange,
    getSuggestionGroups: raw => {
      // While typing "A vs B", complete the trailing side only.
      const { prefix, term } = splitComparisonQuery(raw);
      comparePrefix = prefix;
      const query = term.trim().toLowerCase();
      if (!query) return [];
      return (getGroups(query, { comparing: Boolean(prefix) }) || []).map(([label, group]) => ({
        label,
        total: group.total,
        items: group.items.map(item => {
          const shared = { label: `${item.flag || ''}${item.label}`, detail: item.detail };
          originals.set(shared, item);
          return shared;
        })
      }));
    },
    onSelect: item => {
      const original = originals.get(item);
      if (original) onSelect(original, comparePrefix);
    }
  });
  return { render: () => controller.render(), close: controller.close };
}
