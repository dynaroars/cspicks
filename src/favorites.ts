// Per-page, browser-local favorite star (localStorage-backed, no account/sync).
// Mirrors the vietprofs favorites-store.ts pattern for consistency across
// the two sibling static sites.
import { escapeHtml } from './shared.js';
import { parseKeywordQuery } from './search-keywords.js';
import type { KeywordSpec } from './search-keywords.js';

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export interface FavoritesStore {
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => boolean;
  all: () => string[];
}

export function createFavoritesStore(storageKey: string): FavoritesStore {
  function load(): Set<string> {
    try {
      const parsed = JSON.parse(storage()?.getItem(storageKey) ?? '[]');
      return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function save(ids: Set<string>) {
    storage()?.setItem(storageKey, JSON.stringify([...ids]));
  }

  function isFavorite(id: string) {
    return load().has(id);
  }

  function toggle(id: string) {
    const ids = load();
    const next = ids.has(id);
    if (next) ids.delete(id); else ids.add(id);
    save(ids);
    return !next;
  }

  return { isFavorite, toggle, all: () => [...load()] };
}

const STAR_ICON = '<path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>';

export function favoriteToggleButton(id: string, favorited: boolean) {
  const label = favorited ? 'Remove from favorites' : 'Add to favorites';
  return `<button type="button" class="favorite-toggle${favorited ? ' is-favorite' : ''}" data-favorite-id="${escapeHtml(id)}" aria-pressed="${favorited ? 'true' : 'false'}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true">${STAR_ICON}</svg></button>`;
}

export function applyFavoriteToggle(button: HTMLElement, favorited: boolean) {
  button.classList.toggle('is-favorite', favorited);
  button.setAttribute('aria-pressed', favorited ? 'true' : 'false');
  const label = favorited ? 'Remove from favorites' : 'Add to favorites';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

// Delegated click handling for any `[data-favorite-id]` button inside `container`,
// so favorite state survives full innerHTML re-renders without extra wiring per card.
export function wireFavoriteToggles(container: HTMLElement, store: FavoritesStore) {
  container.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-favorite-id]') : null;
    if (!button) return;
    const id = button.dataset.favoriteId;
    if (!id) return;
    applyFavoriteToggle(button, store.toggle(id));
  });
}

/** Added to a page's keyword specs so `favorites: only` is documented in the search help. */
export const FAVORITES_KEYWORD_SPEC: KeywordSpec = {
  key: 'favorites',
  aliases: ['favorite', 'starred'],
  example: 'favorites: only',
  description: 'Show only the items you starred on this page ("only" or "yes")'
};

/** True when the select says "favorites only" or the query contains `favorites: only|yes`. */
export function wantsFavoritesOnly(query: string, selectValue: string) {
  if (selectValue === 'only') return true;
  const value = parseKeywordQuery(String(query || ''), [FAVORITES_KEYWORD_SPEC]).filters.favorites?.[0];
  return value === 'only' || value === 'yes' || value === 'true';
}

/** Keep order but put starred items first (stable), as vietprofs does. */
export function prioritizeFavorites<T>(items: T[], idOf: (item: T) => string, store: FavoritesStore) {
  const ids = new Set(store.all());
  if (!ids.size) return items;
  return [...items.filter(item => ids.has(idOf(item))), ...items.filter(item => !ids.has(idOf(item)))];
}

export function onlyFavorites<T>(items: T[], idOf: (item: T) => string, store: FavoritesStore) {
  const ids = new Set(store.all());
  return items.filter(item => ids.has(idOf(item)));
}

/** Markup for the "show" select every page adds next to its other filters. */
export function favoritesSelect(selectedValue: string, count: number) {
  return `<select id="favorites-select" aria-label="Favorites">
    <option value="all"${selectedValue === 'only' ? '' : ' selected'}>All items</option>
    <option value="only"${selectedValue === 'only' ? ' selected' : ''}>★ Favorites only (${count})</option>
  </select>`;
}

export function updateFavoritesCount(store: FavoritesStore) {
  const option = document.querySelector<HTMLOptionElement>('#favorites-select option[value="only"]');
  if (option) option.textContent = `★ Favorites only (${store.all().length})`;
}

/**
 * After a star toggles: refresh the count, and re-render when only favorites are shown so an
 * un-starred card leaves the list. Register after `wireFavoriteToggles` so the store is updated first.
 */
export function onFavoriteChange(container: HTMLElement, store: FavoritesStore, render: () => void) {
  container.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-favorite-id]')) return;
    updateFavoritesCount(store);
    if (document.querySelector<HTMLSelectElement>('#favorites-select')?.value === 'only') render();
  });
}
