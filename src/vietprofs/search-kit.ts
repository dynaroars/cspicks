// Generic search-box / command-line UI kit shared across vietprofs consumers
// (vietprofs itself, the GMU CS "people" directory at github.com/RealGMUCS/people, and
// CS Picks, which vendors this file verbatim via its `npm run sync:vietprofs-ui`).
// Kept free of any site-specific data/DOM assumptions (ids, elements, and site behavior are
// passed in as options; matching styles live in roars-ui.css) so it can be
// built standalone and fetched at runtime from https://vietprofs.roars.dev/search-kit.js
// the same way profile.css is shared today (see scripts/sync-profile-css.ts).

export type KeywordMeta = { label: string; icon?: string };

// Case/diacritic-insensitive compare, e.g. so "Nguyen" also matches "Nguyễn".
export function normalizeText(value: string): string {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// "Keyword: value" prefix parsing shared by every consumer's search box, e.g.
// "advisor: Nguyen" or "research: Software Engineering". `resolveKey` maps the
// typed prefix (lowercased, stripped of punctuation) to a canonical key, or
// returns a falsy value if the prefix isn't a recognized keyword.
export function parseKeywordQuery(
  raw: string,
  resolveKey: (key: string) => string | null | undefined,
): { key: string; query: string } | null {
  const match = raw.match(/^\s*([^:]{1,24}?)\s*:\s*(.*)$/s);
  if (!match) return null;
  const typed = (match[1] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = resolveKey(typed);
  if (!key) return null;
  let query = (match[2] ?? '').trim();
  if ((query.startsWith('"') && query.endsWith('"')) || (query.startsWith("'") && query.endsWith("'"))) {
    query = query.slice(1, -1).trim();
  }
  return { key, query };
}

export function showCommandOutput(el: HTMLElement | null, message: string) {
  if (!el) return;
  el.textContent = message;
  (el as any).hidden = false;
}

export function hideCommandOutput(el: HTMLElement | null) {
  if (!el) return;
  (el as any).hidden = true;
  el.textContent = '';
}

// Fisher-Yates sample, used to pick fresh "Try:" examples / random-entry commands.
export function sample<T>(items: readonly T[], count: number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr.slice(0, count);
}

export function shuffle<T>(items: readonly T[]): T[] {
  return sample(items, items.length);
}

type EffectiveSearch = { key: string; query: string } | null;

// One row in the suggestion list. `value` (defaults to `label`) is what a plain
// selection writes into the input; `detail` renders right-aligned in the row.
export interface SuggestionItem {
  label: string;
  detail?: string;
  value?: string;
}

// A titled block of suggestion rows. `total` > items.length adds an "N of M" count to the header.
export interface SuggestionGroup {
  label?: string;
  total?: number;
  items: SuggestionItem[];
}

export interface SuggestionContext {
  // Active (chip or typed-prefix) keyword scope, or null for a free-text search.
  scope: string | null;
  // The text being completed, with any typed "Keyword:" prefix removed.
  query: string;
  // The input's full raw value.
  raw: string;
}

export interface SearchControllerOptions {
  input: HTMLInputElement;
  suggestionPanel: HTMLElement;
  // Removable scope chip inside the search shell. Omit both (or set useScopeChip: false) for
  // consumers that manage their own keyword chips; "Keyword: value" text is then left as typed.
  scopeChip?: HTMLElement | null;
  scopeChipLabel?: HTMLElement | null;
  useScopeChip?: boolean;
  // Recognized keyword keys and their display metadata (label/icon shown in the scope chip).
  keywordMeta?: Record<string, KeywordMeta>;
  // Maps a typed prefix (lowercased, punctuation stripped) to a canonical key, e.g. aliases
  // like "dept" -> "department". Defaults to accepting exactly the keys of keywordMeta.
  resolveKey?: (typed: string) => string | null | undefined;
  // Flat suggestion source: candidate values for the active scope, or for `unscopedKey`
  // ('name' by default) when no scope is active. Matched case/diacritic-insensitively,
  // prefix matches first, capped at maxSuggestions (8).
  getSuggestions?: (key: string) => string[];
  unscopedKey?: string;
  maxSuggestions?: number;
  // When a scope is active and the input is empty, list that scope's values anyway if it has
  // at most this many (0 = never; vietprofs uses 20).
  showAllWhenEmpty?: number;
  // Grouped suggestion source; takes precedence over getSuggestions. Called on every input/focus
  // (also with empty input) and owns its own matching, ordering, and capping.
  getSuggestionGroups?: (raw: string, scope: string | null) => SuggestionGroup[];
  // Row shown (non-selectable) when getSuggestionGroups returns no items for a non-empty input.
  emptyText?: string;
  // Replaces the default selection behavior (write the value into the input, then onChange()).
  onSelect?: (item: SuggestionItem, context: SuggestionContext) => void;
  // Serializes an active scope plus its query for searchQueryValue() (URLs, commands).
  // Default: `${label.toLowerCase()}: ${query}`.
  formatQuery?: (key: string, label: string, query: string) => string;
  onChange: () => void;
  onCommand?: (raw: string) => boolean;
  // Called when Escape clears the input/scope, just before onChange().
  onClear?: () => void;
  // Debounce the onChange fired while typing (ms). 0 = synchronous (people's directories,
  // which are small enough not to need it). vietprofs uses ~150ms over its larger roster.
  debounceMs?: number;
  // Delay before hiding the list on blur, so a click on a row can land first (ms, default 150).
  blurDelayMs?: number;
}

export interface SearchController {
  effectiveSearch: () => EffectiveSearch;
  setSearchValue: (raw: string) => void;
  searchQueryValue: () => string;
  resetScope: () => void;
  activeScope: () => string | null;
  // Hide the suggestion list.
  close: () => void;
  // Recompute and show the suggestion list for the current input (hides it when empty).
  render: () => void;
}

function resolveKeyFrom(keywordMeta: Record<string, KeywordMeta>) {
  return (key: string) => (Object.hasOwn(keywordMeta, key) ? key : null);
}

function debounce(fn: () => void, delayMs: number): () => void {
  if (!delayMs) return fn;
  let timer: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delayMs);
  };
}

function rankMatches(values: readonly string[], rawQuery: string, limit: number): string[] {
  const query = normalizeText(rawQuery);
  return values
    .filter(v => normalizeText(v).includes(query))
    .sort((a, b) => {
      const aStarts = normalizeText(a).startsWith(query);
      const bStarts = normalizeText(b).startsWith(query);
      return Number(bStarts) - Number(aStarts) || a.localeCompare(b);
    })
    .slice(0, limit);
}

// Focus the search box without opening its suggestion list (e.g. autofocus on page load).
export function focusQuietly(input: HTMLInputElement) {
  input.dataset.quietFocus = 'true';
  input.focus({ preventScroll: true });
  delete input.dataset.quietFocus;
}

let panelCounter = 0;

// Sticky scope chip + live suggestion dropdown for a single free-text search box.
// A typed/pasted "Keyword: value" prefix becomes a visible, removable scope chip;
// the chip (once set) is the source of truth over further typing.
export function createSearchController(opts: SearchControllerOptions): SearchController {
  const { input, suggestionPanel, onChange, onCommand } = opts;
  const keywordMeta = opts.keywordMeta ?? {};
  const scopeChip = opts.scopeChip ?? null;
  const scopeChipLabel = opts.scopeChipLabel ?? null;
  const useScopeChip = opts.useScopeChip ?? Boolean(scopeChip);
  const resolveKey = opts.resolveKey ?? resolveKeyFrom(keywordMeta);
  const maxSuggestions = opts.maxSuggestions ?? 8;
  if (!suggestionPanel.id) suggestionPanel.id = `search-suggestions-${++panelCounter}`;
  let activeScope: string | null = null;
  let activeSuggestion = -1;
  let optionEls: HTMLElement[] = [];

  const metaFor = (key: string): KeywordMeta =>
    (Object.hasOwn(keywordMeta, key) ? keywordMeta[key] : undefined) ?? { label: key, icon: '🔎' };

  function renderChip() {
    if (!scopeChip) return;
    (scopeChip as any).hidden = !activeScope;
    if (!activeScope) { if (scopeChipLabel) scopeChipLabel.textContent = ''; return; }
    const meta = metaFor(activeScope);
    if (scopeChipLabel) scopeChipLabel.textContent = `${meta.icon ?? '🔎'} ${meta.label}`;
    scopeChip.setAttribute('aria-label', `Remove ${meta.label} search scope`);
  }

  // Scope + query the suggestions should complete: the chip if set, else a typed prefix.
  function suggestionContext(): SuggestionContext {
    const raw = input.value;
    if (activeScope) return { scope: activeScope, query: raw.trim(), raw };
    const parsed = parseKeywordQuery(raw, resolveKey);
    return parsed ? { scope: parsed.key, query: parsed.query, raw } : { scope: null, query: raw.trim(), raw };
  }

  function setActive(index: number) {
    activeSuggestion = index;
    optionEls.forEach((el, i) => el.setAttribute('aria-selected', String(i === index)));
    const active = index >= 0 ? optionEls[index] : undefined;
    if (active) {
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView?.({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function hideSuggestions() {
    activeSuggestion = -1;
    optionEls = [];
    (suggestionPanel as any).hidden = true;
    suggestionPanel.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function select(item: SuggestionItem, context: SuggestionContext) {
    hideSuggestions();
    if (opts.onSelect) {
      opts.onSelect(item, context);
      return;
    }
    const value = item.value ?? item.label;
    if (useScopeChip && context.scope) {
      activeScope = context.scope;
      renderChip();
    }
    input.value = value;
    onChange();
    input.focus();
  }

  function optionButton(item: SuggestionItem, index: number, context: SuggestionContext): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-suggestion';
    btn.id = `${suggestionPanel.id}-option-${index}`;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', 'false');
    btn.dataset.index = String(index);
    if (item.detail) {
      const label = document.createElement('span');
      label.className = 'search-suggestion-label';
      label.textContent = item.label;
      const detail = document.createElement('span');
      detail.className = 'search-suggestion-detail';
      detail.textContent = item.detail;
      btn.append(label, detail);
    } else {
      btn.textContent = item.label;
    }
    // Keep focus on the input until the click lands — otherwise blur can hide
    // the list before the click event arrives.
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => select(item, context));
    return btn;
  }

  function flatGroups(context: SuggestionContext): SuggestionGroup[] {
    if (!opts.getSuggestions) return [];
    const scoped = context.scope;
    const values = opts.getSuggestions(scoped ?? opts.unscopedKey ?? 'name') || [];
    const showAll = Boolean(scoped) && !context.query && values.length <= (opts.showAllWhenEmpty ?? 0);
    if (!context.query && !showAll) return [];
    return [{ items: rankMatches(values, context.query, maxSuggestions).map(label => ({ label })) }];
  }

  function showSuggestions() {
    const context = suggestionContext();
    const groups = opts.getSuggestionGroups
      ? opts.getSuggestionGroups(context.raw, activeScope)
      : flatGroups(context);
    const children: HTMLElement[] = [];
    const nextOptions: HTMLElement[] = [];
    for (const group of groups) {
      if (!group.items.length) continue;
      if (group.label) {
        const header = document.createElement('div');
        header.className = 'search-suggestion-group';
        header.setAttribute('role', 'presentation');
        header.textContent = group.label;
        if (group.total !== undefined && group.total > group.items.length) {
          const count = document.createElement('span');
          count.className = 'search-suggestion-group-count';
          count.textContent = `${group.items.length} of ${group.total}`;
          header.append(' ', count);
        }
        children.push(header);
      }
      for (const item of group.items) {
        const btn = optionButton(item, nextOptions.length, context);
        nextOptions.push(btn);
        children.push(btn);
      }
    }
    if (!nextOptions.length) {
      if (opts.emptyText && context.raw.trim()) {
        const empty = document.createElement('div');
        empty.className = 'search-suggestion search-suggestion-empty';
        empty.setAttribute('role', 'presentation');
        empty.textContent = opts.emptyText;
        hideSuggestions();
        suggestionPanel.replaceChildren(empty);
        (suggestionPanel as any).hidden = false;
        return;
      }
      hideSuggestions();
      return;
    }
    optionEls = nextOptions;
    suggestionPanel.replaceChildren(...children);
    setActive(-1);
    (suggestionPanel as any).hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function effectiveSearch(): EffectiveSearch {
    const raw = input.value.trim();
    if (activeScope) {
      return { key: activeScope, query: raw.toLowerCase() };
    }
    const parsed = parseKeywordQuery(raw, resolveKey);
    return parsed ? { key: parsed.key, query: parsed.query.toLowerCase() } : null;
  }

  function setSearchValue(raw: string) {
    const parsed = useScopeChip ? parseKeywordQuery(raw, resolveKey) : null;
    activeScope = parsed ? parsed.key : null;
    input.value = parsed ? parsed.query : raw;
    renderChip();
  }

  function searchQueryValue(): string {
    const raw = input.value.trim();
    if (!activeScope) return raw;
    const label = metaFor(activeScope).label;
    if (opts.formatQuery) return opts.formatQuery(activeScope, label, raw);
    return `${label.toLowerCase()}:${raw ? ` ${raw}` : ''}`;
  }

  function resetScope() {
    activeScope = null;
    renderChip();
    hideSuggestions();
  }

  const debouncedChange = debounce(onChange, opts.debounceMs ?? 0);

  input.setAttribute('aria-controls', suggestionPanel.id);
  input.addEventListener('input', () => {
    if (useScopeChip && !activeScope) {
      const parsed = parseKeywordQuery(input.value, resolveKey);
      if (parsed) {
        activeScope = parsed.key;
        input.value = parsed.query;
        renderChip();
      }
    }
    showSuggestions();
    debouncedChange();
  });
  // A focus given via focusQuietly() (page-load autofocus) doesn't open the list.
  input.addEventListener('focus', () => { if (!input.dataset.quietFocus) showSuggestions(); });
  input.addEventListener('blur', () => window.setTimeout(hideSuggestions, opts.blurDelayMs ?? 150));
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      hideSuggestions();
      if (input.value || activeScope) {
        e.preventDefault();
        resetScope();
        input.value = '';
        if (opts.onClear) opts.onClear();
        onChange();
      }
      return;
    }
    if (e.key === 'Enter') {
      const active = activeSuggestion >= 0 ? optionEls[activeSuggestion] : undefined;
      if (active) {
        e.preventDefault();
        active.click();
        return;
      }
      if (onCommand && onCommand(searchQueryValue())) {
        e.preventDefault();
        hideSuggestions();
        return;
      }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (!optionEls.length) {
      // ArrowDown on a closed list opens it.
      if (e.key === 'ArrowDown') {
        showSuggestions();
        if (optionEls.length) e.preventDefault();
      }
      return;
    }
    const count = optionEls.length;
    setActive(e.key === 'ArrowDown' ? (activeSuggestion + 1) % count : (activeSuggestion - 1 + count) % count);
    e.preventDefault();
  });
  if (scopeChip) {
    scopeChip.addEventListener('click', () => {
      resetScope();
      input.focus();
      onChange();
    });
  }

  return {
    effectiveSearch,
    setSearchValue,
    searchQueryValue,
    resetScope,
    activeScope: () => activeScope,
    close: hideSuggestions,
    render: showSuggestions,
  };
}

export interface SearchHelpOptions {
  btn: HTMLElement;
  panel: HTMLElement;
  // Optional — only needed when the panel's keyword list is generated rather than static HTML.
  list?: HTMLElement;
  entries?: { code: string; example: string; scope?: string }[];
  // Runs before every open/close toggle (e.g. close the suggestion list so the two don't overlap).
  onBeforeToggle?: () => void;
}

export interface SearchHelp {
  hide: () => void;
  show: () => void;
  toggle: () => void;
  isOpen: () => boolean;
}

// Escape keydowns that already closed the help popover, so setupKeyboardShortcuts' Escape
// chain doesn't also run for them regardless of which listener was registered first.
const helpClosingEscapes = new WeakSet<Event>();

// Open/close behavior for the "(?)" search-syntax popover, plus optionally filling
// its keyword list from `entries`. Shared by every consumer; some (vietprofs) render
// the panel body directly in their own shell template and only need the open/close half.
export function setupSearchHelp({ btn, panel, list, entries, onBeforeToggle }: SearchHelpOptions): SearchHelp {
  if (list && entries) {
    list.innerHTML = entries.map(e =>
      `<li><code>${escapeHtml(e.code)}</code> ${escapeHtml(e.example)}${e.scope ? ` <span class="search-help-scope">(${escapeHtml(e.scope)})</span>` : ''}</li>`
    ).join('');
  }

  const isOpen = () => !(panel as any).hidden;
  function setOpen(open: boolean) {
    (panel as any).hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  const hide = () => setOpen(false);
  const show = () => setOpen(true);
  function toggle() {
    const willShow = !isOpen();
    if (onBeforeToggle) onBeforeToggle();
    setOpen(willShow);
  }
  btn.addEventListener('click', e => {
    e.stopPropagation();
    toggle();
  });
  document.addEventListener('click', e => {
    if (isOpen() && !panel.contains(e.target as Node) && e.target !== btn) hide();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) {
      hide();
      helpClosingEscapes.add(e);
    }
  });
  return { hide, show, toggle, isOpen };
}

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface CommandHandlerOptions {
  getSearch?: () => { resetScope: () => void } | null;
  resetDirectory?: () => void;
  onUpdate?: () => void;
  onRandom?: () => void;
  getQueryPlan?: () => string;
  getStats?: () => string;
  facts?: readonly string[];
  // Site name shown by `whoami`/`about` and `uname -a`; also keys the `theme crt` preference
  // in localStorage as `<site_name>:crt`.
  siteName: string;
  aboutText: string;
  // The search box cleared after a command; `input` wins over `searchInputId`.
  input?: HTMLInputElement | null;
  searchInputId?: string;
  commandOutputEl: HTMLElement | null;
  // The help popover `help` opens: a setupSearchHelp() controller, or the raw panel + button.
  help?: Pick<SearchHelp, 'show'> | null;
  searchHelpPanel?: HTMLElement | null;
  searchHelpBtn?: HTMLElement | null;
  buildCommit?: string;
  buildLabel?: string;
  // Full `uname -a` output, replacing the default `<site> static-web build <commit> browser/...`.
  unameText?: () => string;
  // Built-in command words this site doesn't want (they fall through to a normal search).
  disabledCommands?: string[];
  // Extra, site-specific commands layered on top of the shared base set
  // (e.g. vietprofs' "sudo vietprofs"). They take precedence over built-ins.
  extraCommands?: Record<string, () => void>;
}

// The base `help` / `fortune` / `whoami` / `uname -a` / `stats` / `theme crt` / `clear`
// command-line easter eggs, identical across every consumer's search box. Site-specific
// extras (vietprofs' "sudo vietprofs", people's none-yet) go in `extraCommands`.
export function createCommandHandler(opts: CommandHandlerOptions) {
  const { commandOutputEl, searchHelpPanel, searchHelpBtn, extraCommands } = opts;
  const disabled = new Set(opts.disabledCommands ?? []);

  function completeCommand(msg: string) {
    const input = opts.input ?? (opts.searchInputId ? document.getElementById(opts.searchInputId) as HTMLInputElement | null : null);
    if (input) input.value = '';
    const search = opts.getSearch ? opts.getSearch() : null;
    if (search) search.resetScope();
    showCommandOutput(commandOutputEl, msg);
    if (opts.onUpdate) opts.onUpdate();
  }

  return function runCommand(raw: string): boolean {
    const cmd = raw.trim().toLowerCase().replace(/^:/, '');
    if (!cmd) return false;

    const extra = extraCommands && Object.hasOwn(extraCommands, cmd) ? extraCommands[cmd] : undefined;
    if (extra) {
      extra();
      return true;
    }
    if (disabled.has(cmd)) return false;

    if (cmd === 'help') {
      if (opts.help) {
        opts.help.show();
      } else if (searchHelpPanel && searchHelpBtn) {
        (searchHelpPanel as any).hidden = false;
        searchHelpBtn.setAttribute('aria-expanded', 'true');
      }
      completeCommand('help: query prefixes, shortcuts, and commands are listed above');
      return true;
    }
    if (cmd === 'query plan') {
      completeCommand(`query plan: ${opts.getQueryPlan ? opts.getQueryPlan() : ''}`);
      return true;
    }
    if (cmd === 'whoami' || cmd === 'about') {
      completeCommand(opts.aboutText);
      return true;
    }
    if (cmd === 'uname -a' || cmd === 'build' || cmd === 'built' || cmd === 'build it' || cmd === 'version') {
      if (opts.unameText) {
        completeCommand(opts.unameText());
        return true;
      }
      const commit = opts.buildCommit ?? 'dev';
      const label = opts.buildLabel ?? '';
      completeCommand(`${opts.siteName} static-web build ${commit}${label ? ` (${label})` : ''} browser/${navigator.platform || 'unknown'}`);
      return true;
    }
    if (cmd === 'stats' || cmd === 'status') {
      completeCommand(`stats: ${opts.getStats ? opts.getStats() : ''}`);
      return true;
    }
    if (cmd === 'sudo find professor' || cmd === 'sudo find faculty' || cmd === 'sudo find student') {
      completeCommand('Permission granted. Academic credentials still require independent verification.');
      return true;
    }
    if (cmd === 'fortune') {
      const list = opts.facts && opts.facts.length ? opts.facts : [`${opts.siteName} is an open, community-maintained academic directory.`];
      completeCommand(`fortune: ${list[Math.floor(Math.random() * list.length)] ?? ''}`);
      return true;
    }
    if (cmd === '/dev/random' || cmd === 'random') {
      if (opts.onRandom) opts.onRandom();
      return true;
    }
    if (cmd === 'theme crt') {
      const enabled = document.documentElement.classList.toggle('crt-mode');
      localStorage.setItem(crtStorageKey(opts.siteName), enabled ? '1' : '0');
      completeCommand(`crt theme ${enabled ? 'enabled' : 'disabled'}; reduced-motion preferences are respected`);
      return true;
    }
    if (cmd === 'clear' || cmd === 'reset') {
      hideCommandOutput(commandOutputEl);
      if (opts.resetDirectory) opts.resetDirectory();
      return true;
    }
    return false;
  };
}

function crtStorageKey(siteName: string): string {
  return `${siteName.toLowerCase().replace(/\s+/g, '_')}:crt`;
}

// Re-apply a `theme crt` choice saved by createCommandHandler on an earlier visit.
export function restoreCrtTheme(siteName: string) {
  if (localStorage.getItem(crtStorageKey(siteName)) === '1') document.documentElement.classList.add('crt-mode');
}

export interface KeyboardShortcutOptions {
  getItemElements: () => HTMLElement[];
  getSelectedIndex: () => number;
  setSelectedIndex: (index: number) => void;
  onRandom?: () => void;
  // Called with the currently j/k-selected item on Enter (e.g. open its profile link).
  onEnter?: (selected: HTMLElement) => void;
  // Called with the currently j/k-selected item on 'f' (e.g. toggle favorite/edit).
  onSecondary?: (selected: HTMLElement) => void;
  // The search box '/' focuses; `input` wins over `searchInputId` (default 'main-search').
  input?: HTMLInputElement | null;
  searchInputId?: string;
  // The help popover '?' toggles and Escape closes; defaults to #search-help-panel/#search-help-btn.
  help?: SearchHelp | null;
  selectedClass?: string;
  // Keys that move the selection (default ['j'] / ['k']; vietprofs adds the arrow keys).
  nextKeys?: string[];
  prevKeys?: string[];
  // Whether movement keys are captured (default: there are items). When true with no items,
  // the keys are still swallowed and the selection resets to -1.
  isNavigable?: () => boolean;
  // Opt-in Escape chain, run after an open help popover is closed:
  // onEscape() (return true if it handled the key, e.g. leaving a special view) →
  // blur the focused search box + closeSuggestions() → clearSearch() when it has text.
  escape?: {
    onEscape?: () => boolean;
    closeSuggestions?: () => void;
    clearSearch?: () => void;
  };
}

// j/k list navigation, '/' to focus search, '?' for help, 'r' for random —
// shared across every consumer's roster/directory view.
export function setupKeyboardShortcuts(opts: KeyboardShortcutOptions) {
  const nextKeys = opts.nextKeys ?? ['j'];
  const prevKeys = opts.prevKeys ?? ['k'];
  const searchInput = () => opts.input ?? document.getElementById(opts.searchInputId ?? 'main-search') as HTMLInputElement | null;
  const fallbackHelp = (): SearchHelp | null => {
    const panel = document.getElementById('search-help-panel');
    const btn = document.getElementById('search-help-btn');
    if (!panel) return null;
    return {
      isOpen: () => !(panel as any).hidden,
      hide: () => { (panel as any).hidden = true; btn?.setAttribute('aria-expanded', 'false'); },
      show: () => { (panel as any).hidden = false; btn?.setAttribute('aria-expanded', 'true'); },
      toggle: () => { btn?.click(); },
    };
  };

  function handleEscape(e: KeyboardEvent) {
    const help = opts.help ?? fallbackHelp();
    if (helpClosingEscapes.has(e)) return;
    if (help && help.isOpen()) {
      help.hide();
      return;
    }
    const chain = opts.escape;
    if (!chain) return;
    if (chain.onEscape && chain.onEscape()) return;
    const input = searchInput();
    if (input && document.activeElement === input) {
      input.blur();
      if (chain.closeSuggestions) chain.closeSuggestions();
    } else if (input && input.value && chain.clearSearch) {
      chain.clearSearch();
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') handleEscape(e);

    const target = e.target as HTMLElement;
    const typing = target && target.matches('input, textarea, select, [contenteditable="true"]');

    if (e.key === '/' && !typing) {
      e.preventDefault();
      const input = searchInput();
      if (input) input.focus();
      return;
    }
    if (e.key === '?' && !typing) {
      e.preventDefault();
      const help = opts.help ?? fallbackHelp();
      if (help) help.toggle();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    const items = opts.getItemElements ? opts.getItemElements() : [];
    let currIdx = opts.getSelectedIndex ? opts.getSelectedIndex() : -1;
    const selectedClass = opts.selectedClass ?? (items[0]?.classList.contains('card') ? 'card-keyboard-selected' : 'entry-keyboard-selected');
    const isNext = nextKeys.includes(e.key);
    const isPrev = prevKeys.includes(e.key);

    if ((isNext || isPrev) && (opts.isNavigable ? opts.isNavigable() : items.length > 0)) {
      e.preventDefault();
      items[currIdx]?.classList.remove(selectedClass);
      if (!items.length) currIdx = -1;
      else currIdx = isNext ? (currIdx + 1) % items.length : (currIdx - 1 + items.length) % items.length;
      if (opts.setSelectedIndex) opts.setSelectedIndex(currIdx);
      const selected = items[currIdx];
      if (selected) {
        selected.classList.add(selectedClass);
        selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      return;
    }

    const selected = items[currIdx];
    if (e.key === 'Enter' && selected && opts.onEnter) {
      e.preventDefault();
      opts.onEnter(selected);
      return;
    }
    if (e.key === 'f' && selected && opts.onSecondary) {
      e.preventDefault();
      opts.onSecondary(selected);
      return;
    }
    if (e.key === 'r') {
      e.preventDefault();
      if (opts.onRandom) opts.onRandom();
    }
  });
}
