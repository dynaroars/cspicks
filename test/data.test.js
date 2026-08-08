import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchCsv, filterByYears, getPublicationSchools } from '../src/data.js';
import { encodeInlineValue, escapeHtml, safeExternalUrl } from '../src/shared.js';

function professor(name, affiliation, count, adjustedcount) {
  return {
    name,
    affiliation,
    pubs: [{ area: 'icml', year: 2025, count, adjustedcount }]
  };
}

test('an empty historical map does not bypass region filtering', () => {
  const data = {
    schools: {
      US: { country: 'us', region: 'northamerica' },
      EU: { country: 'de', region: 'europe' }
    },
    professors: {
      Alice: professor('Alice', 'US', 1, 1),
      Bob: professor('Bob', 'EU', 1, 1)
    }
  };

  const result = filterByYears(data, 2025, 2025, 'us', {});
  assert.deepEqual(Object.keys(result.professors), ['Alice']);
});

test('historical mode filters professors and their publications by region', () => {
  const data = {
    schools: {
      US: { country: 'us', region: 'northamerica' },
      EU: { country: 'de', region: 'europe' }
    },
    professors: {
      Alice: {
        name: 'Alice',
        affiliation: 'EU',
        pubs: [
          { area: 'icml', year: 2024, count: 1, adjustedcount: 1 },
          { area: 'icml', year: 2025, count: 1, adjustedcount: 1 }
        ]
      },
      Bob: professor('Bob', 'EU', 1, 1)
    }
  };
  const history = {
    Alice: [
      { school: 'US', start: 2024, end: 2024 },
      { school: 'EU', start: 2025, end: 2025 }
    ],
    Bob: [{ school: 'EU', start: 2020, end: 2030 }]
  };

  const result = filterByYears(data, 2024, 2025, 'us', history);

  assert.deepEqual(Object.keys(result.professors), ['Alice']);
  assert.deepEqual(result.professors.Alice.pubs.map(pub => pub.year), [2024]);
  assert.equal(result.professors.Alice.totalCount, 1);
  assert.deepEqual(Object.keys(result.schools), ['US']);
});

test('historical attribution falls back when all matching aliases are excluded', () => {
  const prof = { name: 'Alice', affiliation: 'US' };
  const pub = { year: 2025 };
  const history = { Alice: [{ school: 'Unknown School', start: 2025, end: 2025 }] };

  assert.deepEqual(getPublicationSchools(prof, pub, history, { 'Unknown School': null }), ['US']);
});

test('raw-count mode uses raw counts for per-area rankings', () => {
  const data = {
    schools: { A: { country: 'us' }, B: { country: 'us' } },
    professors: {
      A: professor('A', 'A', 10, 1),
      B: professor('B', 'B', 2, 2)
    }
  };

  const adjusted = filterByYears(data, 2025, 2025, 'us', null, null, 'csrankings', false);
  const raw = filterByYears(data, 2025, 2025, 'us', null, null, 'csrankings', true);

  assert.equal(adjusted.schools.B.areaRanks.mlmining, 1);
  assert.equal(adjusted.schools.A.areaRanks.mlmining, 2);
  assert.equal(raw.schools.A.areaRanks.mlmining, 1);
  assert.equal(raw.schools.B.areaRanks.mlmining, 2);
});

test('per-area rankings assign the same rank to equal scores', () => {
  const data = {
    schools: { A: { country: 'us' }, B: { country: 'us' }, C: { country: 'us' } },
    professors: {
      A: professor('A', 'A', 3, 3),
      B: professor('B', 'B', 3, 3),
      C: professor('C', 'C', 1, 1)
    }
  };

  const result = filterByYears(data, 2025, 2025, 'us');
  assert.equal(result.schools.A.areaRanks.mlmining, 1);
  assert.equal(result.schools.B.areaRanks.mlmining, 1);
  assert.equal(result.schools.C.areaRanks.mlmining, 3);
});

test('rendering helpers neutralize markup and unsafe URLs', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(decodeURIComponent(encodeInlineValue("O'Brien </script>")), "O'Brien </script>");
  assert.equal(safeExternalUrl('javascript:alert(1)'), '#');
  assert.equal(safeExternalUrl('https://example.com/profile'), 'https://example.com/profile');
});

test('fetchCsv rejects HTTP failures', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Not found', { status: 404 });

  try {
    await assert.rejects(fetchCsv('https://example.invalid/data.csv'), /Failed to fetch CSV \(404\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
