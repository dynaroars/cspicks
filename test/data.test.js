import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchCsv, filterByYears, getPublicationSchools } from '../src/data.js';
import { encodeInlineValue, escapeHtml, safeExternalUrl } from '../src/shared.js';
import { calculateRankImpact, fuzzyMatch, parseCandidateNames } from '../src/simulation.js';
import { hasEligiblePageRange, normalizeDblpVenue } from '../src/dblp.js';
import { parseCsrankingsRules } from '../src/csrankings-rules.js';

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

test('rankings always use fractional credit', () => {
  const data = {
    schools: { A: { country: 'us' }, B: { country: 'us' } },
    professors: {
      A: professor('A', 'A', 10, 1),
      B: professor('B', 'B', 2, 2)
    }
  };

  const result = filterByYears(data, 2025, 2025, 'us', null, null, 'csrankings');
  const legacyRawArgument = filterByYears(data, 2025, 2025, 'us', null, null, 'csrankings', true);

  assert.equal(result.schools.B.areaRanks.mlmining, 1);
  assert.equal(result.schools.A.areaRanks.mlmining, 2);
  assert.equal(legacyRawArgument.schools.B.areaRanks.mlmining, 1);
  assert.equal(legacyRawArgument.schools.A.areaRanks.mlmining, 2);
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

test('simulator name matching handles exact names, initials, and small typos', () => {
  assert.equal(fuzzyMatch('Samuel Madden', 'S. Madden'), true);
  assert.equal(fuzzyMatch('Barbara Liskov', 'Barbara Liskov'), true);
  assert.equal(fuzzyMatch('Barbara Liskov', 'Robert Tarjan'), false);
});

test('simulator parses each selected faculty member as a separate candidate', () => {
  assert.deepEqual(
    parseCandidateNames('Barbara Liskov\nSamuel Madden\r\nBarbara Liskov\n  '),
    ['Barbara Liskov', 'Samuel Madden']
  );
});

test('DBLP venue aliases and page rules preserve eligible FSE and NeurIPS papers', () => {
  assert.equal(normalizeDblpVenue('pacmse', { number: 'FSE' }), 'fse');
  assert.equal(normalizeDblpVenue('pacmse', { number: 'ISSTA' }), 'issta');
  assert.equal(normalizeDblpVenue('sigsoft', { booktitle: 'ESEC/SIGSOFT FSE' }), 'fse');
  assert.equal(normalizeDblpVenue('sigsoft', { booktitle: 'FSE Companion' }), null);
  assert.equal(normalizeDblpVenue('nips'), 'nips');
  assert.equal(hasEligiblePageRange(undefined, 'nips', 'NeurIPS'), true);
  assert.equal(hasEligiblePageRange('100-110', 'nips', 'NIPS'), true);
  assert.equal(hasEligiblePageRange(undefined, 'nips', 'NeurIPS Workshop'), false);
  assert.equal(hasEligiblePageRange('100-110', 'nips', 'NeurIPS Workshop'), false);
  assert.equal(hasEligiblePageRange(undefined, 'cav'), false);
  assert.equal(hasEligiblePageRange('859-881', 'pacmse'), true);
  assert.equal(hasEligiblePageRange('19:1-19:9', 'pacmse'), true);
  assert.equal(hasEligiblePageRange('1-4', 'cav'), false);
});

test('DBLP venue normalization covers renamed and journal-published proceedings', () => {
  assert.equal(normalizeDblpVenue('sp'), 'oakland');
  assert.equal(normalizeDblpVenue('uss'), 'usenixsec');
  assert.equal(normalizeDblpVenue('chi'), 'chiconf');
  assert.equal(normalizeDblpVenue('pomacs'), 'sigmetrics');
  assert.equal(normalizeDblpVenue('pvldb'), 'vldb');
  assert.equal(normalizeDblpVenue('imwut'), 'ubicomp');
  assert.equal(normalizeDblpVenue('popets'), 'pets');
  assert.equal(normalizeDblpVenue('pacmpl', { number: 'POPL' }), 'popl');
  assert.equal(normalizeDblpVenue('pacmpl', { number: 'OOPSLA' }), 'oopsla');
  assert.equal(normalizeDblpVenue('pacmmod', { number: '2', year: 2024 }), 'pods');
  assert.equal(normalizeDblpVenue('pacmmod', { number: '3', year: 2024 }), 'sigmod');
  assert.equal(normalizeDblpVenue('tog', { year: 2024, volume: '43', number: '4' }), 'siggraph');
  assert.equal(normalizeDblpVenue('tog', { year: 2024, volume: '43', number: '6' }), 'siggraph-asia');
  assert.equal(normalizeDblpVenue('tog', { year: 2024, volume: '43', number: '5' }), null);
  assert.equal(normalizeDblpVenue('cgf', { year: 2024, volume: '43', number: '2' }), 'eurographics');
  assert.equal(normalizeDblpVenue('tvcg', { year: 2025, volume: '31', number: '1' }), 'vis');
  assert.equal(normalizeDblpVenue('tvcg', { year: 2025, volume: '31', number: '5' }), 'vr');
  assert.equal(normalizeDblpVenue('bioinformatics', { year: 2024, volume: '40', number: 'Supplement_1' }), 'ismb');
  assert.equal(hasEligiblePageRange('i100-i108', 'bioinformatics'), true);
});

test('CSRankings rule sync parses upstream issue tables', () => {
  const source = `
TOG_SIGGRAPH_Volume = {2025: (44, 4)}
TOG_SIGGRAPH_Asia_Volume = {2025: (44, 6)}
CGF_EUROGRAPHICS_Volume = {2025: (44, 2)}
TVCG_Vis_Volume = {2025: (31, 1)}
TVCG_VR_Volume = {2025: (31, 5)}
ISMB_Bioinformatics = {2025: (41, "Supplement_1")}
`;
  const rules = parseCsrankingsRules(source);
  assert.deepEqual(rules.issues.tog[2025], [44, 4, 6]);
  assert.deepEqual(rules.issues.cgf[2025], [44, 2]);
  assert.deepEqual(rules.issues.tvcg[2025], [31, 1, 5]);
  assert.deepEqual(rules.issues.ismb[2025], [41, 'Supplement_1']);
});

test('simulator calculates target-school overall and area rank changes', () => {
  const schools = {
    A: {
      name: 'A',
      rank: 1,
      areas: { mlmining: { adjusted: 10 } },
      areaRanks: { mlmining: 1 }
    },
    B: {
      name: 'B',
      rank: 2,
      areas: { mlmining: { adjusted: 5 } },
      areaRanks: { mlmining: 2 }
    }
  };
  const stats = { areas: { mlmining: { adjusted: 1000 } } };

  const impact = calculateRankImpact(schools, [{ school: schools.B, stats, isRemoval: false }]).get('B');

  assert.equal(impact.overall, 1);
  assert.equal(impact.areas.mlmining.delta, 1);
  assert.equal(impact.areas.mlmining.nowRank, 1);
});
