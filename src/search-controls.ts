/** Shared search behavior; pages provide keyword schemas, values, and result rendering. */
import { createSuggestionBox } from './suggestion-box.js';
import type { SuggestionItem } from './suggestion-box.js';
import { keywordSuggestions, mountKeywordHelp } from './search-keywords.js';
import type { KeywordSpec } from './search-keywords.js';
import { initResultActions } from './result-actions.js';
import { escapeHtml } from './shared.js';

type SuggestionOptions = Parameters<typeof createSuggestionBox>[0];
export interface SearchExample { label: string; query?: string; href?: string; title?: string }

export function searchChoices(values: string[] | Record<string, string>, detail = 'Search filter'): SuggestionItem[] {
  return Array.isArray(values) ? values.map(label => ({ label, detail }))
    : Object.entries(values).map(([value, label]) => ({ value, label, detail }));
}

export function renderSearchExamples(container: HTMLElement, examples: Array<string | SearchExample>) {
  container.innerHTML = examples.slice(0, 4).map(example => {
    const item = typeof example === 'string' ? { label: example, query: example } : example;
    return item.href ? `<a href="${escapeHtml(item.href)}" title="${escapeHtml(item.title || item.label)}">${escapeHtml(item.label)}</a>`
      : `<button type="button" data-search-example="${escapeHtml(item.query || item.label)}">${escapeHtml(item.label)}</button>`;
  }).join('');
}

export function updateSearchUrl(params: URLSearchParams, query: string) {
  if (query.trim()) params.set('q', query.trim()); else params.delete('q');
  const suffix = params.toString();
  history.replaceState({}, '', `${location.pathname}${suffix ? `?${suffix}` : ''}${location.hash}`);
}

/** Specialized search workflows can reuse input and shortcut behavior without an autocomplete menu. */
export function wireSearchInput(input: HTMLInputElement, onInput: (query: string) => void) {
  input.addEventListener('input', () => onInput(input.value));
  document.addEventListener('keydown', event => {
    const active = document.activeElement;
    if (event.key === '/' && input.getClientRects().length && !['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName || '') && !(active instanceof HTMLElement && active.isContentEditable)) {
      event.preventDefault(); input.focus(); input.select();
    }
  });
}

export function createSearchControls(options: Omit<SuggestionOptions, 'onSelect'> & {
  specs: KeywordSpec[];
  helpId: string;
  example: string;
  usage?: string;
  getKeywordSources: () => Record<string, SuggestionItem[]>;
  onQuery: (query: string) => void;
  onInput?: (query: string) => void;
  onSelect?: SuggestionOptions['onSelect'];
  examples?: HTMLElement | null;
}) {
  initResultActions();
  const { input, specs, getKeywordSources, onQuery, onInput, examples } = options;
  mountKeywordHelp(input, specs, options.helpId, options.example, options.usage);
  const suggestions = createSuggestionBox({
    ...options,
    getGroups: (query, context) => {
      const scoped = context.comparing ? null : keywordSuggestions(input.value, specs, getKeywordSources());
      if (scoped) return scoped;
      const groups = options.getGroups(query, context) || [];
      const match = /(^|\s)([a-z][a-z_-]*)$/i.exec(input.value);
      if (match && !context.comparing) {
        const term = match[2]!.toLowerCase();
        const prefix = input.value.slice(0, match.index) + match[1];
        const items = specs.filter(spec => spec.key.startsWith(term) || spec.aliases?.some(alias => alias.startsWith(term)))
          .map(spec => ({ label: `${spec.key}:`, detail: spec.description, query: `${prefix}${spec.key}: ` }));
        if (items.length) groups.unshift(['Keywords', { items, total: items.length }]);
      }
      return groups;
    },
    onSelect: (item, prefix) => {
      if (item.query !== undefined) {
        input.value = item.query;
        onQuery(input.value);
        if (/\:\s*$/.test(input.value)) suggestions.render(input.value);
      } else if (options.onSelect) options.onSelect(item, prefix);
      else { input.value = `${prefix}${item.value || item.label}`; onQuery(input.value); }
    }
  });
  const setQuery = (query: string) => {
    input.value = query;
    onQuery(query);
    input.focus();
    suggestions.close();
  };
  wireSearchInput(input, () => {
    suggestions.render(input.value);
    (onInput || onQuery)(input.value);
  });
  examples?.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-search-example]') : null;
    if (button?.dataset.searchExample) setQuery(button.dataset.searchExample);
  });
  return { ...suggestions, setQuery };
}
