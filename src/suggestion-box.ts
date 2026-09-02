import { escapeHtml, scoreSuggestionMatch } from './shared.js';
import { splitComparisonQuery } from './comparison.js';

export interface SuggestionItem {
  kind?: string;
  label: string;
  value?: string;
  detail: string;
  searchTerms?: string;
  flag?: string;
  target?: { type: 'school' | 'researcher', name: string };
  type?: string;
  grantId?: string;
}

export interface SuggestionGroup {
  items: SuggestionItem[];
  total: number;
}

export type SuggestionGroups = Array<[string, SuggestionGroup]>;

// The autocomplete menu shared by Search and NSF Funding: keyboard handling,
// ARIA wiring, and the grouped listbox markup. Each page supplies its own rows
// through `getGroups`, so the two boxes look and behave alike over different
// data.

// Ranks candidates for one group and keeps the best `limit`, reporting how many
// matched in total so a trimmed group can say "12 of 84".
export function rankSuggestions<T extends SuggestionItem>(items: T[], query: string, limit: number) {
  const matches = items
    .map(item => ({ item, score: scoreSuggestionMatch(`${item.label} ${item.searchTerms || ''}`, query) }))
    .filter(match => Number.isFinite(match.score))
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
  return { items: matches.slice(0, limit).map(match => match.item), total: matches.length };
}

// getGroups(query, { comparing }) returns `[label, { items, total }]` pairs, or
// null when the page has no data to offer yet.
export function createSuggestionBox({ input, listbox, getGroups, onSelect, emptyText = 'No matching result' }: {
  input: HTMLInputElement;
  listbox: HTMLElement;
  getGroups: (query: string, options: { comparing: boolean }) => SuggestionGroups | null;
  onSelect: (item: SuggestionItem, prefix: string) => void;
  emptyText?: string;
}) {
  let suggestions: SuggestionItem[] = [];
  let activeIndex = -1;
  let comparePrefix = '';

  const close = () => {
    suggestions = [];
    activeIndex = -1;
    listbox.hidden = true;
    listbox.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const render = (queryValue: string) => {
    // While typing "A vs B", complete the trailing side only.
    const { prefix, term } = splitComparisonQuery(queryValue);
    comparePrefix = prefix;
    const query = term.trim().toLowerCase();
    if (!query) return close();

    const groups = (getGroups(query, { comparing: Boolean(prefix) }) || [])
      .filter(([, group]) => group.items.length);
    suggestions = groups.flatMap(([, group]) => group.items);
    activeIndex = -1;

    if (!suggestions.length) {
      listbox.innerHTML = `<div class="universal-suggestion-empty">${escapeHtml(emptyText)}</div>`;
    } else {
      let index = 0;
      listbox.innerHTML = groups.map(([label, group]) => `
        <div class="universal-suggestion-group">
          <span>${label}</span>
          ${group.total > group.items.length ? `<span class="universal-suggestion-count">${group.items.length} of ${group.total}</span>` : ''}
        </div>
        ${group.items.map(item => {
          const itemIndex = index++;
          return `<button type="button" id="universal-suggestion-${itemIndex}" class="universal-suggestion" role="option" data-index="${itemIndex}" aria-selected="false"><span>${item.flag || ''}${escapeHtml(item.label)}</span><small>${escapeHtml(item.detail)}</small></button>`;
        }).join('')}
      `).join('');
    }
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const moveActive = (delta: number) => {
    if (!suggestions.length) return;
    activeIndex = (activeIndex + delta + suggestions.length) % suggestions.length;
    listbox.querySelectorAll('.universal-suggestion').forEach((element, index) => {
      const active = index === activeIndex;
      element.classList.toggle('active', active);
      element.setAttribute('aria-selected', String(active));
    });
    const activeElement = document.getElementById(`universal-suggestion-${activeIndex}`);
    if (activeElement) {
      input.setAttribute('aria-activedescendant', activeElement.id);
      activeElement.scrollIntoView({ block: 'nearest' });
    }
  };

  const choose = (item?: SuggestionItem) => {
    if (!item) return;
    const prefix = comparePrefix;
    close();
    onSelect(item, prefix);
  };

  listbox.addEventListener('pointerdown', event => event.preventDefault());
  listbox.addEventListener('click', event => {
    const option = event.target instanceof Element ? event.target.closest<HTMLElement>('.universal-suggestion') : null;
    if (option) choose(suggestions[Number(option.dataset.index)]);
  });

  input.addEventListener('focus', () => render(input.value));
  input.addEventListener('blur', () => window.setTimeout(close, 120));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (listbox.hidden) render(input.value);
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      close();
    }
  });

  return { render, close };
}
