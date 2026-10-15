// Shared "keyword: value" search-prefix parsing, usable inside any page's
// free-text search box (e.g. "loc: usa pldi" narrows to US conferences named
// PLDI). Each page defines its own KeywordSpec[] of what it supports and
// wires the returned `filters` into its own matching logic; `rest` is what's
// left over to run through the page's existing free-text search.
import { escapeHtml, scoreSuggestionMatch } from './shared.js';
import type { SuggestionItem } from './suggestion-box.js';

export interface KeywordSpec {
  key: string;
  aliases?: string[];
  example: string;
  description: string;
}

interface ParsedKeywordQuery {
  filters: Record<string, string[]>;
  rest: string;
}

// Whitespace after the colon is allowed ("loc: usa"), matching the help text's own examples. A quote still
// open at the end of the query (a value being typed, e.g. `loc: "new yo`) counts as the value so far.
const TOKEN_RE = /(^|\s)([a-z][a-z0-9_-]{0,20}):[ \t]*("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/gi;

export function parseKeywordQuery(raw: string, specs: KeywordSpec[]): ParsedKeywordQuery {
  const keyByAlias = new Map<string, string>();
  specs.forEach(spec => {
    keyByAlias.set(spec.key.toLowerCase(), spec.key);
    (spec.aliases || []).forEach(alias => keyByAlias.set(alias.toLowerCase(), spec.key));
  });

  const filters: Record<string, string[]> = {};
  const rest = raw
    .replace(TOKEN_RE, (match, lead: string, typedKey: string, rawValue: string) => {
      const canonical = keyByAlias.get(typedKey.toLowerCase());
      if (!canonical) return match;
      const value = rawValue.replace(/^(["'])([^]*?)\1?$/, '$2').trim().toLowerCase();
      if (value) (filters[canonical] ||= []).push(value);
      return lead;
    })
    // A keyword still waiting for its value ("area:") is not search text.
    .replace(/(^|\s)([a-z][a-z0-9_-]{0,20}):\s*$/i, (match, lead: string, typedKey: string) => keyByAlias.has(typedKey.toLowerCase()) ? lead : match)
    .replace(/\s+/g, ' ')
    .trim();

  return { filters, rest };
}

export function matchesKeyword(values: string[] | undefined, haystack: string) {
  if (!values || !values.length) return true;
  const normalized = haystack.toLowerCase();
  return matchesKeywordOptions(values, value => normalized.includes(value));
}

/** Commas offer alternatives within a keyword; repeated keywords must all match. */
export function matchesKeywordOptions(values: string[] | undefined, matches: (value: string) => boolean) {
  return !values?.length || values.every(value => value.split(',').map(part => part.trim()).filter(Boolean).some(matches));
}

export function keywordValue(value: string) {
  if (!/\s|["']/.test(value)) return value;
  const quote = value.includes('"') && !value.includes("'") ? "'" : '"';
  return `${quote}${value.replaceAll(quote, '')}${quote}`;
}

export function setQueryKeyword(query: string, key: string, values: string[], specs: KeywordSpec[]) {
  const spec = specs.find(spec => spec.key === key)!;
  const aliases = [key, ...(spec.aliases || [])];
  const rest = query.replace(TOKEN_RE, (match, lead: string, typedKey: string) =>
    aliases.includes(typedKey.toLowerCase()) ? lead : match).trim();
  return [rest, values.length ? `${key}: ${keywordValue(values.join(','))}` : ''].filter(Boolean).join(' ');
}

/** Older shared links become visible, editable keywords instead of hidden filters. */
export function restoreKeywordQuery(params: URLSearchParams, mapping: Record<string, string>) {
  const parts = [params.get('q') || ''];
  for (const [param, key] of Object.entries(mapping)) {
    const value = params.get(param);
    if (value && (value !== 'all' || key === 'status' || key === 'deadline')) parts.push(`${key}: ${keywordValue(value)}`);
  }
  return parts.filter(Boolean).join(' ');
}

/** Complete the last keyword value while preserving the rest of the query. */
export function keywordSuggestions(query: string, specs: KeywordSpec[], sources: Record<string, SuggestionItem[]>) {
  const match = /(^|\s)([a-z][a-z0-9_-]*):[ \t]*("[^"\n]*|'[^'\n]*'|[^\s]*)$/i.exec(query);
  if (!match) return null;
  const spec = specs.find(spec => [spec.key, ...(spec.aliases || [])].includes(match[2]!.toLowerCase()));
  if (!spec) return null;
  const prefix = query.slice(0, match.index) + match[1];
  const typedValue = match[3]!.replace(/^["']|["']$/g, '');
  const comma = typedValue.lastIndexOf(',');
  const alternatives = comma === -1 ? '' : typedValue.slice(0, comma + 1);
  const term = typedValue.slice(comma + 1).trim().toLowerCase();
  const matches = (sources[spec.key] || [])
    .map(item => ({ item, score: scoreSuggestionMatch(`${item.label} ${item.searchTerms || ''}`, term) }))
    .filter(match => Number.isFinite(match.score))
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
  const group = { items: matches.slice(0, 8).map(match => match.item), total: matches.length };
  return [[spec.key, { ...group, items: group.items.map(item => {
    const completed = `${prefix}${spec.key}: ${keywordValue(alternatives + (item.value || item.label))}`;
    return { ...item, value: completed, query: completed };
  }) }]] as Array<[string, typeof group]>;
}

/**
 * Clickable, keyboard-accessible search help, following the VietProfs popup pattern and its element ids
 * (`search-help-btn` / `search-help-panel`, which search-kit's `?` and Escape shortcuts look up).
 */
export function mountKeywordHelp(input: HTMLInputElement, specs: KeywordSpec[], example: string, usage = 'Combine keywords to narrow your search. Quote values with spaces; commas mean either value.') {
  const id = 'search-help-panel';
  const shell = input.closest<HTMLElement>('.search-input-shell')!;
  shell.insertAdjacentHTML('beforeend', `<button type="button" id="search-help-btn" class="search-help-btn" aria-label="Search keywords and examples" title="Search keywords and examples" aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}"><span class="search-help-icon" aria-hidden="true">?</span></button>`);
  shell.insertAdjacentHTML('afterend', `<div class="search-help-panel" id="${id}" role="dialog" aria-label="Search keywords and examples" hidden>
      <strong>Search keywords</strong>
      <p>${escapeHtml(usage)}</p>
      <p><code>${escapeHtml(example)}</code></p>
      <ul class="search-help-list">${specs.map(spec => `<li><code>${escapeHtml(spec.key)}:</code> ${escapeHtml(spec.description)}<br><span>e.g. <code>${escapeHtml(spec.example)}</code></span></li>`).join('')}</ul>
      <p>Search without keywords for a general text search.</p>
      <strong>Keyboard</strong>
      <ul class="search-help-list">
        <li><kbd>/</kbd> search · <kbd>?</kbd> this help · <kbd>Esc</kbd> close or clear the search</li>
        <li>Type <code>keyword:</code> to start a filter chip; <kbd>Enter</kbd> finishes it; <kbd>Backspace</kbd> in an empty box removes the last chip</li>
        <li><kbd>j</kbd>/<kbd>k</kbd> move through results · <kbd>Enter</kbd> open · <kbd>f</kbd> star · <kbd>r</kbd> random result</li>
      </ul>
      <button type="button" class="search-help-close">Close help</button>
    </div>`);
  const button = shell.querySelector<HTMLButtonElement>('.search-help-btn')!;
  const panel = document.getElementById(id)!;
  const close = (restoreFocus = false) => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  };
  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
  });
  panel.querySelector('.search-help-close')!.addEventListener('click', () => close(true));
  document.addEventListener('click', event => {
    if (!panel.hidden && !panel.contains(event.target as Node) && !button.contains(event.target as Node)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) close(true);
  });
}
