// Generic search-box / command-line UI kit shared across vietprofs consumers
// (vietprofs itself, and the GMU CS "people" directory at github.com/RealGMUCS/people).
// Kept free of any vietprofs- or people-specific data/DOM assumptions so it can be
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

export interface SearchControllerOptions {
  input: HTMLInputElement;
  scopeChip: HTMLElement;
  scopeChipLabel: HTMLElement;
  suggestionPanel: HTMLElement;
  // Recognized keyword keys and their display metadata (label/icon shown in the scope chip).
  keywordMeta: Record<string, KeywordMeta>;
  // Returns candidate suggestion values for the given key ('name' when no scope is active).
  getSuggestions: (key: string) => string[];
  onChange: () => void;
  onCommand?: (raw: string) => boolean;
  // Debounce the onChange fired while typing (ms). 0 = synchronous (people's directories,
  // which are small enough not to need it). vietprofs uses ~150ms over its larger roster.
  debounceMs?: number;
}

export interface SearchController {
  effectiveSearch: () => EffectiveSearch;
  setSearchValue: (raw: string) => void;
  searchQueryValue: () => string;
  resetScope: () => void;
  activeScope: () => string | null;
}

function resolveKeyFrom(keywordMeta: Record<string, KeywordMeta>) {
  return (key: string) => (keywordMeta[key] ? key : null);
}

function debounce(fn: () => void, delayMs: number): () => void {
  if (!delayMs) return fn;
  let timer: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delayMs);
  };
}

// Sticky scope chip + live suggestion dropdown for a single free-text search box.
// A typed/pasted "Keyword: value" prefix becomes a visible, removable scope chip;
// the chip (once set) is the source of truth over further typing.
export function createSearchController(opts: SearchControllerOptions): SearchController {
  const { input, scopeChip, scopeChipLabel, suggestionPanel, keywordMeta, getSuggestions, onChange, onCommand } = opts;
  const resolveKey = resolveKeyFrom(keywordMeta);
  let activeScope: string | null = null;
  let activeSuggestion = -1;

  function renderChip() {
    (scopeChip as any).hidden = !activeScope;
    if (!activeScope) { scopeChipLabel.textContent = ''; return; }
    const meta = keywordMeta[activeScope] || { label: activeScope, icon: '🔎' };
    scopeChipLabel.textContent = `${meta.icon ?? '🔎'} ${meta.label}`;
    scopeChip.setAttribute('aria-label', `Remove ${meta.label} search scope`);
  }

  function hideSuggestions() {
    activeSuggestion = -1;
    (suggestionPanel as any).hidden = true;
    suggestionPanel.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
  }

  function showSuggestions() {
    const raw = input.value.trim();
    if (!raw) { hideSuggestions(); return; }
    const sourceKey = activeScope && keywordMeta[activeScope] ? activeScope : 'name';
    const values = getSuggestions(sourceKey) || [];
    const query = normalizeText(raw);
    const matches = values
      .filter(v => normalizeText(v).includes(query))
      .sort((a, b) => {
        const aStarts = normalizeText(a).startsWith(query);
        const bStarts = normalizeText(b).startsWith(query);
        return Number(bStarts) - Number(aStarts) || a.localeCompare(b);
      })
      .slice(0, 8);
    if (!matches.length) { hideSuggestions(); return; }
    suggestionPanel.replaceChildren(...matches.map((value, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-suggestion';
      btn.setAttribute('role', 'option');
      btn.dataset.index = String(index);
      btn.textContent = value;
      // Keep focus on the input until the click lands — otherwise blur can hide
      // the list before the click event arrives.
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => {
        input.value = value;
        hideSuggestions();
        onChange();
        input.focus();
      });
      return btn;
    }));
    activeSuggestion = -1;
    (suggestionPanel as any).hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function effectiveSearch(): EffectiveSearch {
    const raw = input.value.trim();
    if (activeScope && keywordMeta[activeScope]) {
      return { key: activeScope, query: raw.toLowerCase() };
    }
    const parsed = parseKeywordQuery(raw, resolveKey);
    return parsed ? { key: parsed.key, query: parsed.query.toLowerCase() } : null;
  }

  function setSearchValue(raw: string) {
    const parsed = parseKeywordQuery(raw, resolveKey);
    activeScope = parsed ? parsed.key : null;
    input.value = parsed ? parsed.query : raw;
    renderChip();
  }

  function searchQueryValue(): string {
    const raw = input.value.trim();
    if (!activeScope) return raw;
    const meta = keywordMeta[activeScope];
    const label = (meta ? meta.label : activeScope).toLowerCase();
    return `${label}:${raw ? ` ${raw}` : ''}`;
  }

  function resetScope() {
    activeScope = null;
    renderChip();
    hideSuggestions();
  }

  const debouncedChange = debounce(onChange, opts.debounceMs ?? 0);

  input.addEventListener('input', () => {
    if (!activeScope) {
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
  input.addEventListener('focus', showSuggestions);
  input.addEventListener('blur', () => window.setTimeout(hideSuggestions, 150));
  input.addEventListener('keydown', e => {
    const options = [...suggestionPanel.querySelectorAll<HTMLButtonElement>('.search-suggestion')];
    if (e.key === 'Escape') {
      hideSuggestions();
      if (input.value || activeScope) {
        e.preventDefault();
        resetScope();
        input.value = '';
        onChange();
      }
      return;
    }
    if (e.key === 'Enter') {
      const active = activeSuggestion >= 0 ? options[activeSuggestion] : undefined;
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
    }
    if (!options.length || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    if (e.key === 'ArrowDown') activeSuggestion = (activeSuggestion + 1) % options.length;
    if (e.key === 'ArrowUp') activeSuggestion = (activeSuggestion - 1 + options.length) % options.length;
    options.forEach((opt, i) => opt.setAttribute('aria-selected', String(i === activeSuggestion)));
    e.preventDefault();
  });
  scopeChip.addEventListener('click', () => {
    resetScope();
    input.focus();
    onChange();
  });

  return { effectiveSearch, setSearchValue, searchQueryValue, resetScope, activeScope: () => activeScope };
}

export interface SearchHelpOptions {
  btn: HTMLElement;
  panel: HTMLElement;
  // Optional — only needed when the panel's keyword list is generated rather than static HTML.
  list?: HTMLElement;
  entries?: { code: string; example: string; scope?: string }[];
}

// Open/close behavior for the "(?)" search-syntax popover, plus optionally filling
// its keyword list from `entries`. Shared by every consumer; some (vietprofs) render
// the panel body directly in their own shell template and only need the open/close half.
export function setupSearchHelp({ btn, panel, list, entries }: SearchHelpOptions) {
  if (list && entries) {
    list.innerHTML = entries.map(e =>
      `<li><code>${escapeHtml(e.code)}</code> ${escapeHtml(e.example)}${e.scope ? ` <span class="search-help-scope">(${escapeHtml(e.scope)})</span>` : ''}</li>`
    ).join('');
  }

  function hide() {
    (panel as any).hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const willShow = (panel as any).hidden;
    (panel as any).hidden = !willShow;
    btn.setAttribute('aria-expanded', String(willShow));
  });
  document.addEventListener('click', e => {
    if (!(panel as any).hidden && !panel.contains(e.target as Node) && e.target !== btn) hide();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !(panel as any).hidden) hide();
  });
  return { hide };
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
  facts?: string[];
  // Site name shown by `whoami`/`about` and `uname -a`.
  siteName: string;
  aboutText: string;
  searchInputId?: string;
  commandOutputEl: HTMLElement | null;
  searchHelpPanel?: HTMLElement | null;
  searchHelpBtn?: HTMLElement | null;
  buildCommit?: string;
  buildLabel?: string;
  // Extra, site-specific commands layered on top of the shared base set
  // (e.g. vietprofs' "visitor stats" / "sudo vietprofs"). Each handler returns
  // true if it consumed the command.
  extraCommands?: Record<string, () => void>;
}

// The base `help` / `fortune` / `whoami` / `uname -a` / `stats` / `theme crt` / `clear`
// command-line easter eggs, identical across every consumer's search box. Site-specific
// extras (vietprofs' "visitor stats", people's none-yet) go in `extraCommands`.
export function createCommandHandler(opts: CommandHandlerOptions) {
  const { commandOutputEl, searchHelpPanel, searchHelpBtn, extraCommands } = opts;

  function completeCommand(msg: string) {
    const input = opts.searchInputId ? document.getElementById(opts.searchInputId) as HTMLInputElement | null : null;
    if (input) input.value = '';
    const search = opts.getSearch ? opts.getSearch() : null;
    if (search) search.resetScope();
    showCommandOutput(commandOutputEl, msg);
    if (opts.onUpdate) opts.onUpdate();
  }

  return function runCommand(raw: string): boolean {
    const cmd = raw.trim().toLowerCase().replace(/^:/, '');
    if (!cmd) return false;

    if (extraCommands && extraCommands[cmd]) {
      extraCommands[cmd]();
      return true;
    }

    if (cmd === 'help') {
      if (searchHelpPanel && searchHelpBtn) {
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
      completeCommand(`fortune: ${list[Math.floor(Math.random() * list.length)]}`);
      return true;
    }
    if (cmd === '/dev/random' || cmd === 'random') {
      if (opts.onRandom) opts.onRandom();
      return true;
    }
    if (cmd === 'theme crt') {
      const enabled = document.documentElement.classList.toggle('crt-mode');
      localStorage.setItem(`${opts.siteName.toLowerCase().replace(/\s+/g, '_')}:crt`, enabled ? '1' : '0');
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

export interface KeyboardShortcutOptions {
  getItemElements: () => HTMLElement[];
  getSelectedIndex: () => number;
  setSelectedIndex: (index: number) => void;
  onRandom?: () => void;
  // Called with the currently j/k-selected item on Enter (e.g. open its profile link).
  onEnter?: (selected: HTMLElement) => void;
  // Called with the currently j/k-selected item on 'f' (e.g. toggle favorite/edit).
  onSecondary?: (selected: HTMLElement) => void;
  searchInputId?: string;
  selectedClass?: string;
}

// j/k list navigation, '/' to focus search, '?' for help, 'r' for random —
// shared across every consumer's roster/directory view.
export function setupKeyboardShortcuts(opts: KeyboardShortcutOptions) {
  document.addEventListener('keydown', e => {
    const helpPanel = document.getElementById('search-help-panel');
    const helpBtn = document.getElementById('search-help-btn');
    if (e.key === 'Escape' && helpPanel && !(helpPanel as any).hidden) {
      (helpPanel as any).hidden = true;
      if (helpBtn) helpBtn.setAttribute('aria-expanded', 'false');
    }

    const target = e.target as HTMLElement;
    const typing = target && target.matches('input, textarea, select, [contenteditable="true"]');
    const input = document.getElementById(opts.searchInputId ?? 'main-search');

    if (e.key === '/' && !typing) {
      e.preventDefault();
      if (input) input.focus();
      return;
    }
    if (e.key === '?' && !typing) {
      e.preventDefault();
      if (helpBtn) helpBtn.click();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    const items = opts.getItemElements ? opts.getItemElements() : [];
    let currIdx = opts.getSelectedIndex ? opts.getSelectedIndex() : -1;
    const selectedClass = opts.selectedClass ?? (items[0]?.classList.contains('card') ? 'card-keyboard-selected' : 'entry-keyboard-selected');

    if ((e.key === 'j' || e.key === 'k') && items.length) {
      e.preventDefault();
      items[currIdx]?.classList.remove(selectedClass);
      currIdx = e.key === 'j' ? (currIdx + 1) % items.length : (currIdx - 1 + items.length) % items.length;
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
