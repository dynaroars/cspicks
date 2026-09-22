// Shared "keyword: value" search-prefix parsing, usable inside any page's
// free-text search box (e.g. "loc: usa pldi" narrows to US conferences named
// PLDI). Each page defines its own KeywordSpec[] of what it supports and
// wires the returned `filters` into its own matching logic; `rest` is what's
// left over to run through the page's existing free-text search.
import { escapeHtml } from './shared.js';

export interface KeywordSpec {
  key: string;
  aliases?: string[];
  example: string;
  description: string;
}

export interface ParsedKeywordQuery {
  filters: Record<string, string[]>;
  rest: string;
}

const TOKEN_RE = /(^|\s)([a-z][a-z0-9_-]{0,20}):("[^"]*"|'[^']*'|\S+)/gi;

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
      let value = rawValue;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      value = value.trim().toLowerCase();
      if (value) (filters[canonical] ||= []).push(value);
      return lead;
    })
    .replace(/\s+/g, ' ')
    .trim();

  return { filters, rest };
}

export function matchesKeyword(values: string[] | undefined, haystack: string) {
  if (!values || !values.length) return true;
  const normalized = haystack.toLowerCase();
  return values.every(value => normalized.includes(value));
}

export function keywordHelpIcon(specs: KeywordSpec[], tooltipId: string) {
  const items = specs.map(spec =>
    `<li><code>${escapeHtml(spec.key)}:</code> ${escapeHtml(spec.description)}<br><span class="search-help-example">e.g. <code>${escapeHtml(spec.example)}</code></span></li>`
  ).join('');
  return `<span class="tooltip-trigger search-help-info" tabindex="0" aria-label="Supported search keywords" aria-describedby="${escapeHtml(tooltipId)}">ⓘ
    <span class="tooltip-content search-help-content" id="${escapeHtml(tooltipId)}" role="tooltip">
      <strong>Search keywords</strong>
      <ul class="search-help-list">${items}</ul>
      Any other text still does a plain name/keyword search.
    </span>
  </span>`;
}
