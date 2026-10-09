import test from 'node:test';
import assert from 'node:assert/strict';
import { keywordSuggestions, parseKeywordQuery, restoreKeywordQuery, setQueryKeyword } from '../../src/search-keywords.js';
import { JOBS_KEYWORD_SPECS } from '../../src/jobs/jobs-data.js';

test('changing a keyword replaces its aliases while preserving other terms and quoted values', () => {
  const query = setQueryKeyword('teaching state: TX school: "George Mason" location: VA', 'loc', ['IL', 'CA'], JOBS_KEYWORD_SPECS);
  assert.deepEqual(parseKeywordQuery(query, JOBS_KEYWORD_SPECS), {
    filters: { school: ['george mason'], loc: ['il,ca'] }, rest: 'teaching'
  });
  assert.equal(setQueryKeyword('track: teaching loc: VA', 'loc', [], JOBS_KEYWORD_SPECS), 'track: teaching');
});

test('legacy URL filters become visible keywords, including all-postings status', () => {
  const query = restoreKeywordQuery(new URLSearchParams('q=professor&state=VA,IL&status=all'), { state: 'loc', status: 'status' });
  assert.equal(query, 'professor loc: VA,IL status: all');
});

test('keyword autocomplete preserves other filters and comma-separated alternatives', () => {
  const sources = { loc: [{ label: 'Virginia', detail: 'State' }, { label: 'California', detail: 'State' }] };
  const groups = keywordSuggestions('track: teaching state: TX,Vir', JOBS_KEYWORD_SPECS, sources);
  assert.equal(groups[0][1].items[0].value, 'track: teaching loc: TX,Virginia');
  assert.equal(keywordSuggestions('Virginia', JOBS_KEYWORD_SPECS, sources), null);
});

test('keywords retain quoted values, aliases, and AND/OR semantics', async () => {
  const { matchesKeyword } = await import('../../src/search-keywords.js');
  const parsed = parseKeywordQuery('university: "School One" topic: software,security topic: systems', JOBS_KEYWORD_SPECS);
  assert.deepEqual(parsed.filters, { school: ['school one'], area: ['software,security', 'systems'] });
  assert.equal(matchesKeyword(parsed.filters.area, 'software systems'), true);
  assert.equal(matchesKeyword(parsed.filters.area, 'software'), false);
  const groups = keywordSuggestions("track: teaching location: 'Vir", JOBS_KEYWORD_SPECS, { loc: [{ label: 'Virginia', detail: 'State' }] });
  assert.equal(groups[0][1].items[0].query, 'track: teaching loc: Virginia');
});

test('main-search keywords combine school, researcher, and publication subjects without changing metrics', async () => {
  const { filterSearchRecords } = await import('../../src/search-query.js');
  const person = (name, affiliation, venue) => ({ name, affiliation, aliases: [], pubs: [{ area: venue, year: 2026, count: 1, adjustedcount: 1 }] });
  const data = {
    professors: { Alice: person('Alice', 'School One', 'icse'), Bob: person('Bob', 'School One', 'oakland'), Carol: person('Carol', 'School Two', 'icse') },
    schools: {
      'School One': { name: 'School One', totalAdjusted: 42, areas: { soft: { faculty: ['Alice'] }, sec: { faculty: ['Bob'] } } },
      'School Two': { name: 'School Two', totalAdjusted: 20, areas: { soft: { faculty: ['Carol'] } } }
    }
  };
  const result = filterSearchRecords(data, { school: ['school one'], area: ['software'], prof: ['alice,carol'] }, 'all-union');
  assert.deepEqual(Object.keys(result.professors), ['Alice']);
  assert.deepEqual(Object.keys(result.schools), ['School One']);
  assert.equal(result.schools['School One'], data.schools['School One']);
  assert.equal(result.schools['School One'].totalAdjusted, 42);
  assert.equal(filterSearchRecords(data, {}, 'all-union'), data);
});
