/**
 * VietProfs-style keyword chips for a search box. Typing a known keyword and a colon at the start of the box
 * ("area:") turns it into a scope chip and leaves only the value in the box; Enter (or picking a suggestion)
 * finishes the value into an `Area: security ×` chip, so the next keyword or free text starts fresh.
 *
 * Pages keep treating `input.value` as the whole query ("area: security loc: texas pldi"): the property is
 * overridden on this one element to read the chips plus the typed text, and writing it re-splits a query
 * into chips. Filtering, URLs, and suggestions therefore work unchanged. Escape clears everything, as in VietProfs;
 * the full query is mirrored to `data-query` for tools that read the element's native value.
 */
import { keywordValue } from './search-keywords.js';
import type { KeywordSpec } from './search-keywords.js';
import { escapeHtml } from './shared.js';

interface Chip { key: string; value: string }

const NATIVE_VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
// Same token shape as search-keywords' parser: `key:` then a quoted or space-free value.
const TOKEN_RE = /(^|\s)([a-z][a-z0-9_-]{0,20}):[ \t]*("[^"]*(?:"|$)|'[^']*(?:'|$)|\S+)/gi;

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
const unquote = (value: string) => value.trim().replace(/^(["'])([^]*?)\1?$/, '$2').trim();

export function mountKeywordChips(input: HTMLInputElement, specs: KeywordSpec[], onCommit: () => void = () => {}) {
  const keyByAlias = new Map<string, string>();
  specs.forEach(spec => [spec.key, ...(spec.aliases || [])].forEach(alias => keyByAlias.set(alias.toLowerCase(), spec.key)));
  const keyPattern = [...keyByAlias.keys()].sort((a, b) => b.length - a.length).map(key => key.replace(/[-_]/g, '\\$&')).join('|');
  const leadingKeyword = new RegExp(`^\\s*(${keyPattern}):[ \\t]*(.*)$`, 'is');
  // A further keyword typed after a value ("texas area:") finishes the current chip.
  const followingKeyword = new RegExp(`^(.*?\\S)\\s+(${keyPattern}):[ \\t]*(.*)$`, 'is');

  const chips: Chip[] = [];
  let pending: string | null = null;
  const placeholder = input.placeholder;
  const nativeGet = () => NATIVE_VALUE.get!.call(input) as string;
  const nativeSet = (value: string) => NATIVE_VALUE.set!.call(input, value);

  const shell = input.closest<HTMLElement>('.search-input-shell') || input.parentElement!;
  const holder = document.createElement('span');
  holder.className = 'search-keyword-chips';
  shell.insertBefore(holder, input);

  function fullQuery() {
    const tail = nativeGet().trim();
    const parts = chips.map(chip => `${chip.key}: ${keywordValue(chip.value)}`);
    if (pending) parts.push(`${pending}: ${/\s/.test(tail) ? `"${tail.replaceAll('"', '')}` : tail}`);
    else if (tail) parts.push(tail);
    return parts.join(' ');
  }

  function render() {
    holder.innerHTML = [
      ...chips.map((chip, index) => `<button type="button" class="search-scope-chip" data-chip="${index}" aria-label="Remove ${escapeHtml(chip.key)}: ${escapeHtml(chip.value)}" title="Remove this filter">
        <span>${escapeHtml(label(chip.key))}: ${escapeHtml(chip.value)}</span><span class="search-scope-chip-remove" aria-hidden="true">×</span></button>`),
      pending ? `<button type="button" class="search-scope-chip is-pending" data-chip="pending" aria-label="Remove ${escapeHtml(pending)} search scope" title="Remove this keyword">
        <span>${escapeHtml(label(pending))}</span><span class="search-scope-chip-remove" aria-hidden="true">×</span></button>` : ''
    ].join('');
    holder.hidden = !chips.length && !pending;
    input.placeholder = chips.length || pending ? '' : placeholder;
    mirror();
  }

  /** Splits a whole query into finished chips, a trailing `key:` still waiting for its value, and free text. */
  function setQuery(raw: string) {
    chips.length = 0;
    pending = null;
    let text = String(raw ?? '');
    const trailing = new RegExp(`(^|\\s)(${keyPattern}):\\s*$`, 'i').exec(text);
    if (trailing) {
      pending = keyByAlias.get(trailing[2]!.toLowerCase())!;
      text = text.slice(0, trailing.index);
    }
    const rest = text.replace(TOKEN_RE, (match, lead: string, typedKey: string, value: string) => {
      const key = keyByAlias.get(typedKey.toLowerCase());
      if (!key || !unquote(value)) return match;
      chips.push({ key, value: unquote(value) });
      return lead;
    }).replace(/\s+/g, ' ').trim();
    // Free text and a pending keyword can't share the box; keep the text in the query by leaving the keyword typed out.
    if (pending && rest) {
      nativeSet(`${rest} ${pending}: `);
      pending = null;
    } else nativeSet(rest);
    render();
  }

  Object.defineProperty(input, 'value', { configurable: true, get: fullQuery, set: setQuery });

  function commitPending() {
    const value = unquote(nativeGet());
    if (!pending || !value) return false;
    chips.push({ key: pending, value });
    pending = null;
    nativeSet('');
    render();
    return true;
  }

  // The whole query, for tools that can't see the overridden property (Playwright reads the native value).
  const mirror = () => input.setAttribute('data-query', fullQuery());
  let dispatching = false;
  const changed = () => {
    dispatching = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    dispatching = false;
  };

  // Registered in capture phase so the conversion happens before the page reads the query.
  input.addEventListener('input', event => {
    if (dispatching) return;
    const typed = nativeGet();
    // Not character-by-character typing: a whole query pasted, autofilled, or set by a test (Playwright's fill
    // inserts the full text at once) replaces the chips; so does clearing the box with Delete or Cut.
    const data = event instanceof InputEvent ? event.data : null;
    const replaced = !(event instanceof InputEvent)
      || (['insertText', 'insertFromPaste', 'insertReplacementText'].includes(event.inputType) && !!data && data.length > 1 && typed === data)
      || (['deleteContentForward', 'deleteByCut', 'deleteContent'].includes(event.inputType) && !typed);
    if (replaced) return setQuery(typed);
    if (!pending) {
      const match = leadingKeyword.exec(typed);
      if (match) {
        pending = keyByAlias.get(match[1]!.toLowerCase())!;
        nativeSet(match[2]!);
        render();
      }
      return;
    }
    const next = followingKeyword.exec(typed);
    if (next) {
      chips.push({ key: pending, value: unquote(next[1]!) });
      pending = keyByAlias.get(next[2]!.toLowerCase())!;
      nativeSet(next[3]!);
      render();
    }
  }, true);

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !input.getAttribute('aria-activedescendant') && commitPending()) {
      event.preventDefault();
      changed();
      onCommit();
    } else if (event.key === 'Escape' && (fullQuery() || chips.length || pending)) {
      // Like VietProfs: Escape clears the whole search, chips included.
      event.preventDefault();
      setQuery('');
      changed();
    } else if (event.key === 'Backspace' && !nativeGet() && input.selectionStart === 0 && (pending || chips.length)) {
      event.preventDefault();
      if (pending) pending = null; else chips.pop();
      render();
      changed();
    }
  });

  holder.addEventListener('click', event => {
    const chip = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-chip]') : null;
    if (!chip) return;
    if (chip.dataset.chip === 'pending') pending = null;
    else chips.splice(Number(chip.dataset.chip), 1);
    render();
    input.focus();
    changed();
  });

  input.addEventListener('input', mirror);
  setQuery(nativeGet());
}
