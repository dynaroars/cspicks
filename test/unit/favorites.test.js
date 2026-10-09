import test from 'node:test';
import assert from 'node:assert/strict';
import { createFavoritesStore, onlyFavorites, prioritizeFavorites, wantsFavoritesOnly } from '../../src/favorites.js';

function memoryStore(ids) {
  return { isFavorite: id => ids.includes(id), toggle: () => true, all: () => ids };
}

test('favorites-only searches use the shared keyword and aliases', () => {
  assert.equal(wantsFavoritesOnly('favorites: only'), true);
  assert.equal(wantsFavoritesOnly('starred: yes security'), true);
  assert.equal(wantsFavoritesOnly('favorites: no'), false);
  assert.equal(wantsFavoritesOnly('security'), false);
});

test('starred items sort first, keeping their order, and only() filters', () => {
  const items = ['a', 'b', 'c', 'd'].map(id => ({ id }));
  const store = memoryStore(['c', 'a']);
  assert.deepEqual(prioritizeFavorites(items, item => item.id, store).map(item => item.id), ['a', 'c', 'b', 'd']);
  assert.deepEqual(onlyFavorites(items, item => item.id, store).map(item => item.id), ['a', 'c']);
  assert.equal(prioritizeFavorites(items, item => item.id, memoryStore([])), items, 'no favorites leaves the list untouched');
});

test('store degrades to empty without localStorage', () => {
  const store = createFavoritesStore('test:none');
  assert.deepEqual(store.all(), []);
  assert.equal(store.isFavorite('x'), false);
});
