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
