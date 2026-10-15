/** Shared search behavior; pages provide keyword schemas, values, and result rendering. */
import { createSuggestionBox } from './suggestion-box.js';
import type { SuggestionItem } from './suggestion-box.js';
import { keywordSuggestions, mountKeywordHelp } from './search-keywords.js';
import type { KeywordSpec } from './search-keywords.js';
import { initResultActions } from './result-actions.js';
import { mountKeywordChips } from './keyword-chips.js';
import { sample as sampleItems, setupKeyboardShortcuts } from './vietprofs/search-kit.js';
import { setupBackToTop } from './vietprofs/back-to-top.js';
import { escapeHtml } from './shared.js';

type SuggestionOptions = Parameters<typeof createSuggestionBox>[0];
export interface SearchExample { label: string; query?: string; href?: string; title?: string }

export function searchChoices(values: string[] | Record<string, string>, detail = 'Search filter'): SuggestionItem[] {
  return Array.isArray(values) ? values.map(label => ({ label, detail }))
    : Object.entries(values).map(([value, label]) => ({ value, label, detail }));
}

/** A random `count` of `items`, so every page's "Try" chips stay fresh on each load (VietProfs' search-kit). */
export const sample = sampleItems;

/** Result cards that j/k move through on every search page. */
const RESULT_ITEMS = '.opportunity-card, .results-grid > .card, .schedule-card, .funding-card';

/**
 * VietProfs' keyboard shortcuts (search-kit's setupKeyboardShortcuts): `/` search, `?` help, j/k move through
 * results, Enter opens the selected result's link, f stars it, r picks a random result.
 */
function wireResultShortcuts(input: HTMLInputElement) {
  let selected = -1;
  const items = () => [...document.querySelectorAll<HTMLElement>(RESULT_ITEMS)].filter(item => item.getClientRects().length);
  const select = (index: number) => {
    items().forEach(item => item.classList.remove('card-keyboard-selected'));
    selected = index;
    const item = items()[index];
    item?.classList.add('card-keyboard-selected');
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  setupKeyboardShortcuts({
    searchInputId: input.id,
    selectedClass: 'card-keyboard-selected',
    getItemElements: items,
    getSelectedIndex: () => selected,
    setSelectedIndex: index => { selected = index; },
    onEnter: item => item.querySelector<HTMLAnchorElement>('h2 a[href], h3 a[href], .opportunity-title a[href], a[href]')?.click(),
    onSecondary: item => item.querySelector<HTMLElement>('.favorite-toggle')?.click(),
    onRandom: () => {
      const count = items().length;
      if (count) select(Math.floor(Math.random() * count));
    }
  });
}

/**
 * Every search page loads with its box disabled until data arrives, which defeats `autofocus`; call this
 * once it is enabled. It leaves focus alone if the reader already moved it, and never scrolls the page.
 */
export function focusSearchOnLoad(input: HTMLInputElement) {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  input.dataset.quietFocus = 'true';
  input.focus({ preventScroll: true });
  delete input.dataset.quietFocus;
}

export function renderSearchExamples(container: HTMLElement, examples: Array<string | SearchExample>) {
  container.innerHTML = examples.slice(0, 4).map(example => {
    const item = typeof example === 'string' ? { label: example, query: example } : example;
    return item.href ? `<a class="example-chip" href="${escapeHtml(item.href)}" title="${escapeHtml(item.title || item.label)}">${escapeHtml(item.label)}</a>`
      : `<button type="button" class="example-chip" data-search-example="${escapeHtml(item.query || item.label)}">${escapeHtml(item.label)}</button>`;
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

/** VietProfs' floating back-to-top button (roars-ui .back-to-top + back-to-top.ts) on every long results page. */
function mountBackToTop() {
  if (document.getElementById('back-to-top')) return;
  document.body.insertAdjacentHTML('beforeend', `<button type="button" id="back-to-top" class="back-to-top" aria-label="Back to top" title="Back to top" hidden>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg></button>`);
  setupBackToTop(document.getElementById('back-to-top'));
}

export function createSearchControls(options: Omit<SuggestionOptions, 'onSelect'> & {
  specs: KeywordSpec[];
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
  mountKeywordHelp(input, specs, options.example, options.usage);
  const suggestions = createSuggestionBox({
    ...options,
    onChange: () => (onInput || onQuery)(input.value),
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
        if (/\:\s*$/.test(input.value)) suggestions.render();
      } else if (options.onSelect) options.onSelect(item, prefix);
      else { input.value = `${prefix}${item.value || item.label}`; onQuery(input.value); }
    }
  });
  mountKeywordChips(input, specs, () => suggestions.close());
  const setQuery = (query: string) => {
    input.value = query;
    onQuery(query);
    input.focus();
    suggestions.close();
  };
  wireResultShortcuts(input);
  mountBackToTop();
  examples?.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-search-example]') : null;
    if (button?.dataset.searchExample) setQuery(button.dataset.searchExample);
  });
  return { ...suggestions, setQuery };
}
