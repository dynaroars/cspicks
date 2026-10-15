import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { filterLabs, labsDatasetProblems, renderLabs } from '../../src/jobs/labs.js';

const lab = (overrides = {}) => ({
  id: 'galois', name: 'Galois', org: 'Galois, Inc.', kind: 'company', areas: ['plan', 'sec'],
  locations: ['Portland, OR', 'Arlington, VA'], summary: 'Formal methods R&D.', careersUrl: 'https://www.galois.com/careers',
  checkedAt: '2026-10-15', ...overrides
});
const labs = [
  lab(),
  lab({ id: 'deepmind', name: 'Google DeepMind', aka: ['Google Brain'], org: 'Google', kind: 'industry', areas: ['ai'], locations: ['London, UK', 'Mountain View, CA'] }),
  lab({ id: 'msr', name: 'Microsoft Research', org: 'Microsoft', kind: 'industry', areas: ['ai'], broad: true, locations: ['Redmond, WA', 'Montréal, QC'] })
];
const ids = list => list.map(entry => entry.id);

test('shipped labs.json is valid', async () => {
  const data = JSON.parse(await fs.readFile(new URL('../../public/labs.json', import.meta.url), 'utf8'));
  assert.deepEqual(labsDatasetProblems(data), []);
  assert.ok(data.length >= 30);
});

test('validator names bad fields and duplicates', () => {
  assert.deepEqual(labsDatasetProblems([lab({ areas: ['nope'], careersUrl: 'http://x' }), lab()]),
    ['galois: areas', 'galois: careersUrl', 'galois: duplicate id']);
});

test('filterLabs follows area, location, aka, and free text; posting-only keywords hide labs', () => {
  assert.deepEqual(ids(filterLabs(labs, '')), ['galois', 'deepmind', 'msr']);
  assert.deepEqual(ids(filterLabs(labs, 'area: security')), ['galois', 'msr'], 'broad labs match any area');
  assert.deepEqual(ids(filterLabs(labs, 'brain')), ['deepmind']);
  assert.deepEqual(ids(filterLabs(labs, 'loc: virginia')), ['galois']);
  assert.deepEqual(ids(filterLabs(labs, 'loc: CA,WA')), ['deepmind', 'msr']);
  assert.deepEqual(ids(filterLabs(labs, 'country: uk')), ['deepmind']);
  assert.deepEqual(ids(filterLabs(labs, 'country: us')), ['galois', 'deepmind', 'msr']);
  assert.deepEqual(filterLabs(labs, 'track: teaching'), []);
  assert.deepEqual(filterLabs(labs, 'level: assistant'), []);
  assert.deepEqual(ids(filterLabs(labs, 'track: internship')), ['galois', 'deepmind', 'msr']);
  assert.deepEqual(ids(filterLabs(labs, 'dept: lab school: "microsoft research"')), ['msr']);
});

test('renderLabs groups by kind and escapes text', () => {
  const html = renderLabs([lab({ name: 'A <b>' }), labs[1]]);
  assert.ok(html.indexOf('Industry research labs') < html.indexOf('Research companies'));
  assert.ok(html.includes('A &lt;b&gt;'));
  assert.ok(html.includes('(Google Brain)'));
});
