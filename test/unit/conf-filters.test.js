import assert from 'node:assert/strict';
import test from 'node:test';

import { filterSchedule } from '../../csconfs/schedule-data.js';
import { locationMatches } from '../../csconfs/place.js';
import { parseKeywordQuery } from '../../src/search-keywords.js';

const now = Date.UTC(2026, 9, 1);
const base = { startYear: 2026, endYear: 2027, confSet: 'csrankings-default', now };
const conferences = [
  { name: 'OPEN', year: 2027, venueKeys: ['pldi'], deadline: '2026-11-10', date: 'June 14–18, 2027', place: 'Seattle, WA, USA' },
  { name: 'LATE', year: 2027, venueKeys: ['pldi'], deadline: '2026-06-01', date: 'March 3–7, 2027', place: 'Sydney, Australia' },
  { name: 'GONE', year: 2026, venueKeys: ['pldi'], deadline: '2026-01-01', date: 'February 2026', place: 'Vienna, Austria' },
  { name: 'EURO', year: 2027, venueKeys: ['pldi'], deadline: '2026-05-01', date: 'July 2027', place: 'Montréal, Canada' },
  { name: 'ROME', year: 2027, venueKeys: ['pldi'], deadline: '2026-05-01', date: 'July 2027', place: 'Rome, Italy' }
];
const names = options => filterSchedule(conferences, { ...base, ...options }).map(group => group[0].name).sort();

test('deadline modes separate open, passed-but-ahead, and all conferences', () => {
  assert.deepEqual(names({ deadline: 'open' }), ['OPEN']);
  assert.deepEqual(names({ deadline: 'passed' }), ['EURO', 'LATE', 'ROME']);
  assert.deepEqual(names({ deadline: 'upcoming' }), ['EURO', 'LATE', 'OPEN', 'ROME']);
  assert.deepEqual(names({ deadline: 'all' }), ['EURO', 'GONE', 'LATE', 'OPEN', 'ROME']);
  assert.deepEqual(names({ query: 'deadline: passed' }), ['EURO', 'LATE', 'ROME']);
});

test('location filters match countries, states, regions and whole terms, not substrings of other countries', () => {
  assert.deepEqual(names({ deadline: 'all', location: 'united states' }), ['OPEN']);
  assert.deepEqual(names({ deadline: 'all', query: 'loc: usa' }), ['OPEN']);
  assert.deepEqual(names({ deadline: 'all', query: 'loc:us' }), ['OPEN']);
  assert.deepEqual(names({ deadline: 'all', location: 'europe' }), ['GONE', 'ROME']);
  assert.deepEqual(names({ deadline: 'all', location: 'north america' }), ['EURO', 'OPEN']);
  assert.deepEqual(names({ deadline: 'all', location: 'australasia' }), ['LATE']);
  assert.deepEqual(names({ deadline: 'all', query: 'loc: washington' }), ['OPEN']);
  assert.deepEqual(names({ deadline: 'all', query: 'loc: montreal' }), ['EURO']);
  assert.deepEqual(names({ deadline: 'all', location: 'sydney' }), ['LATE']);
});

test('location matching never confuses 2-letter codes or substrings', () => {
  assert.equal(locationMatches('Toronto, Canada', 'ca'), false);
  assert.equal(locationMatches('Vienna, Austria', 'us'), false);
  assert.equal(locationMatches('Sydney, Australia', 'oceania'), true);
  assert.equal(locationMatches('Tel Aviv, Israel', 'asia'), true);
});

test('keyword parser accepts whitespace after the colon', () => {
  const specs = [{ key: 'loc', example: '', description: '' }];
  assert.deepEqual(parseKeywordQuery('loc: usa pldi', specs), { filters: { loc: ['usa'] }, rest: 'pldi' });
  assert.deepEqual(parseKeywordQuery('loc:"new york" pldi', specs), { filters: { loc: ['new york'] }, rest: 'pldi' });
});

test('other venues appear only under All (Union) and use their manual area', () => {
  const withOther = [...conferences, { name: 'NFM', year: 2027, venueKeys: [], other: true, area: 'soft', deadline: '2026-11-10', date: 'May 2027', place: 'Houston, TX, US' }];
  const run = options => filterSchedule(withOther, { ...base, deadline: 'all', ...options }).map(group => group[0].name);
  assert.ok(run({ confSet: 'all-union' }).includes('NFM'));
  for (const confSet of ['csrankings-default', 'csrankings', 'core', 'core-a-only', 'core-a']) assert.ok(!run({ confSet }).includes('NFM'), confSet);
  assert.deepEqual(run({ confSet: 'all-union', query: 'area: software' }), ['NFM']);
});
