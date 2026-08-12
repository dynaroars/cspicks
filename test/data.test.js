import assert from 'node:assert/strict';
import test from 'node:test';

import { coreAMap, fetchCsv, filterByYears, getConferenceAreaMap, getPublicationSchools, publicationMatchesConferenceSet } from '../src/data.js';
import { areaLabels, detectRegionFromLocales, encodeInlineValue, escapeHtml, getInstitutionShortName, safeExternalUrl, scoreSuggestionMatch } from '../src/shared.js';
import { calculateRankImpact, fuzzyMatch, parseCandidateNames } from '../src/simulation.js';
import { hasEligiblePageRange, normalizeDblpVenue, parseDblpProfileUrl } from '../src/dblp.js';
import { parseCsrankingsRules } from '../src/csrankings-rules.js';
import { renderSchoolCard } from '../src/search-cards.js';
import { calculateAreaMomentum, calculateDiscoveryInsights, calculateParityReport, calculatePublishingEffort, calculateResearcherPatterns, calculateSchoolMetrics, explainRankGap } from '../src/metrics.js';
import { awardYear, buildFundingIndex, calculateFundingDiscoveries, findFundingFaculty, formatAwardPeriod, fundingFacultyNameMatches, fundingMatches, fundingSchoolNameMatches, normalizeFundingName, renderFundingFacultyCard } from '../src/nsf.js';

function professor(name, affiliation, count, adjustedcount) {
  return {
    name,
    affiliation,
    pubs: [{ area: 'icml', year: 2025, count, adjustedcount }]
  };
}

test('browser locales map to supported regions and unknown locales fall back to World', () => {
  assert.equal(detectRegionFromLocales(['en-US']), 'us');
  assert.equal(detectRegionFromLocales(['fr-CA']), 'canada');
  assert.equal(detectRegionFromLocales(['en-GB']), 'europe');
  assert.equal(detectRegionFromLocales(['ja-JP']), 'asia');
  assert.equal(detectRegionFromLocales(['en-AU']), 'australasia');
  assert.equal(detectRegionFromLocales(['es-MX']), 'world');
  assert.equal(detectRegionFromLocales(['en']), 'us');
  assert.equal(detectRegionFromLocales(['de']), 'europe');
  assert.equal(detectRegionFromLocales(['not_a_locale']), 'world');
});

test('NSF funding resolves faculty listed under a middle-initial variant', () => {
  // CSRankings lists some people twice (e.g. "ThanhVu H. Nguyen" in the roster
  // but "ThanhVu Nguyen" in the publication table); the NSF snapshot records
  // whichever variant the sync matched, so lookups must tolerate both.
  const dataset = {
    awards: [{
      id: '1', title: 'Verification', awardee: 'Example University', awardDate: '09/01/2024',
      estimatedAmount: 400000,
      investigators: [{ name: 'A', role: 'PI', facultyName: 'ThanhVu H. Nguyen', affiliation: 'Example University' }]
    }, {
      id: '2', title: 'Ambiguous', awardee: 'Other University', awardDate: '09/01/2024',
      estimatedAmount: 200000,
      investigators: [{ name: 'B', role: 'PI', facultyName: 'Michael T. Goodrich', affiliation: 'Other University' }]
    }]
  };
  const index = buildFundingIndex(dataset, 2020, 2025);

  assert.equal(normalizeFundingName('ThanhVu H. Nguyen'), 'thanhvu nguyen');
  assert.equal(normalizeFundingName('J. Smith'), 'j smith');
  // The CSRankings disambiguation number identifies the person and is kept.
  assert.equal(normalizeFundingName('Adam D. Smith 0001'), 'adam smith 0001');
  assert.notEqual(normalizeFundingName('Adam D. Smith 0001'), normalizeFundingName('Adam Smith 0006'));

  assert.equal(findFundingFaculty(index, 'ThanhVu H. Nguyen').attributedAmount, 400000);
  assert.equal(findFundingFaculty(index, 'ThanhVu Nguyen', 'Example University').attributedAmount, 400000);
  assert.equal(findFundingFaculty(index, 'Unrelated Person', 'Example University'), null);
  // Same-name-different-person: middle initials differ and so do institutions.
  assert.equal(findFundingFaculty(index, 'Michael A. Goodrich', 'Brigham Young University'), null);
  assert.equal(findFundingFaculty(index, 'Michael Goodrich', 'Other University').attributedAmount, 200000);
  // Without an institution to confirm it, a normalized match is not assumed.
  assert.equal(findFundingFaculty(index, 'ThanhVu Nguyen'), null);
});

test('NSF funding keys on the resolved publication-table name', () => {
  // The sync records both spellings; the site matches on the one the
  // publication table uses, with no runtime guessing needed.
  const dataset = {
    awards: [{
      id: '1', title: 'Verification', awardee: 'Example University', awardDate: '09/01/2024',
      estimatedAmount: 300000,
      investigators: [{
        name: 'A', role: 'PI',
        facultyName: 'ThanhVu H. Nguyen',
        rosterName: 'ThanhVu Nguyen',
        affiliation: 'Example University'
      }]
    }]
  };
  const index = buildFundingIndex(dataset, 2020, 2025);
  assert.equal(index.faculty[0].name, 'ThanhVu Nguyen');
  assert.equal(findFundingFaculty(index, 'ThanhVu Nguyen').attributedAmount, 300000);
  assert.deepEqual(index.schools[0].faculty, ['ThanhVu Nguyen']);
});

test('NSF funding uses award year and fractional investigator attribution', () => {
  const dataset = {
    awards: [{
      id: '1', title: 'Secure systems', awardee: 'Example University', awardDate: '09/01/2024',
      startDate: '10/01/2024', endDate: '09/30/2027',
      obligatedAmount: 300000, estimatedAmount: 900000, program: 'Secure Computing', programManager: 'Dana Smith',
      investigators: [
        { name: 'Alice', role: 'PI', facultyName: 'Alice', affiliation: 'Example University' },
        { name: 'Bob', role: 'Co-PI', facultyName: 'Bob', affiliation: 'Example University' },
        { name: 'Outside', role: 'Co-PI', facultyName: null, affiliation: null }
      ]
    }]
  };
  const funding = buildFundingIndex(dataset, 2020, 2025);
  assert.equal(awardYear(dataset.awards[0]), 2024);
  assert.equal(funding.faculty.length, 2);
  assert.equal(funding.faculty[0].attributedAmount, 300000);
  assert.equal(funding.faculty[0].totalAwardAmount, 900000);
  assert.equal(funding.schools[0].attributedAmount, 600000);
  assert.equal(funding.schools[0].awards.length, 1);
  assert.equal(fundingMatches(funding.faculty[0], 'secure computing'), true);
  assert.equal(fundingMatches(funding.faculty[0], 'Dana Smith'), true);
  assert.equal(fundingFacultyNameMatches({ name: 'Hoang-Dung Tran' }, 'Dung Tran'), true);
  assert.equal(fundingFacultyNameMatches({ name: 'Hoang-Dung Tran' }, 'Hoang Tran'), true);
  assert.equal(fundingFacultyNameMatches({ name: 'Hoang-Dung Tran' }, 'transformative'), false);
  assert.equal(fundingSchoolNameMatches(funding.schools[0], 'Example'), true);
  assert.equal(fundingSchoolNameMatches(funding.schools[0], 'secure'), false);
  assert.equal(formatAwardPeriod(dataset.awards[0]), 'Oct 1, 2024 – Sep 30, 2027 · 3 years');
  assert.match(renderFundingFacultyCard(funding.faculty[0]), /Project: Oct 1, 2024 – Sep 30, 2027 · 3 years/);
  assert.match(renderFundingFacultyCard(funding.faculty[0]), /Program manager: Dana Smith/);
  assert.match(renderFundingFacultyCard(funding.faculty[0]), /intended share/);
});

test('NSF funding and discoveries exclude awards without matched CSRankings faculty', () => {
  const dataset = { awards: [
    {
      id: 'matched', title: 'Matched project', awardDate: '01/01/2024', obligatedAmount: 100,
      investigators: [{ name: 'Alice', facultyName: 'Alice', affiliation: 'Example University' }]
    },
    {
      id: 'unmatched', title: 'Unmatched university project', awardDate: '01/01/2024', obligatedAmount: 999999,
      investigators: [{ name: 'Outside', facultyName: null, affiliation: null }]
    }
  ] };
  const funding = buildFundingIndex(dataset, 2020, 2025);
  assert.deepEqual(funding.awards.map(award => award.id), ['matched']);
  assert.equal(funding.schools[0].attributedAmount, 100);
});

test('NSF funding uses collaborative project totals without changing local attribution', () => {
  const title = 'Collaborative Research: SHF: Medium: Shared project';
  const dataset = { awards: [
    {
      id: '1', title, awardee: 'Example University', awardDate: '07/01/2024', obligatedAmount: 400000,
      estimatedAmount: 400000, collaborativeTotalAmount: 1200000,
      investigators: [{ name: 'Alice', role: 'PI', facultyName: 'Alice', affiliation: 'Example University' }]
    }
  ] };
  const funding = buildFundingIndex(dataset, 2020, 2025);
  assert.equal(funding.faculty[0].attributedAmount, 400000);
  assert.equal(funding.faculty[0].totalAwardAmount, 1200000);
  assert.equal(funding.schools[0].attributedAmount, 400000);
});

test('NSF discoveries compare funding periods and publication ranks', () => {
  const current = {
    awards: [],
    schools: [
      { name: 'A', attributedAmount: 500000, faculty: ['One', 'Two'], awards: [{}] },
      { name: 'B', attributedAmount: 200000, faculty: ['Three'], awards: [{}] }
    ]
  };
  const prior = { schools: [
    { name: 'A', attributedAmount: 200000, faculty: [], awards: [] },
    { name: 'B', attributedAmount: 400000, faculty: [], awards: [] }
  ] };
  const insights = calculateFundingDiscoveries(current, prior, {
    A: { rank: 10, totalAdjusted: 3 }, B: { rank: 1, totalAdjusted: 3 }
  });
  assert.equal(insights.fastestGrowth[0].school.name, 'A');
  assert.equal(insights.fastestDecline[0].school.name, 'B');
  assert.equal(insights.broadParticipation[0].name, 'A');
  assert.equal(insights.fundingAhead[0].school.name, 'A');
  assert.equal(insights.publicationsAhead[0].school.name, 'B');
});

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

test('historical attribution does not replace excluded schools with the current school', () => {
  const prof = { name: 'Alice', affiliation: 'US' };
  const pub = { year: 2025 };
  const history = { Alice: [{ school: 'Unknown School', start: 2025, end: 2025 }] };

  assert.deepEqual(getPublicationSchools(prof, pub, history, { 'Unknown School': null }), []);
});

test('historical gaps do not assign old publications to the current school', () => {
  const prof = { name: 'Alice', affiliation: 'Current University' };
  const history = {
    Alice: [{ school: 'Current University', start: 2021, end: 2026 }]
  };

  assert.deepEqual(getPublicationSchools(prof, { year: 2020 }, history), []);
  assert.deepEqual(getPublicationSchools(prof, { year: 2021 }, history), ['Current University']);
});

test('current affiliation remains the fallback when a professor has no history', () => {
  const prof = { name: 'Alice', affiliation: 'Current University' };

  assert.deepEqual(getPublicationSchools(prof, { year: 2020 }, {}, {}), ['Current University']);
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

test('conference-set rules consistently distinguish default, extended, and CORE venues', () => {
  assert.equal(publicationMatchesConferenceSet({ area: 'icse' }, 'csrankings-default'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'ase' }, 'csrankings-default'), false);
  assert.equal(publicationMatchesConferenceSet({ area: 'ase' }, 'csrankings'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'ase' }, 'core'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'issta' }, 'core'), false);
  assert.equal(publicationMatchesConferenceSet({ area: 'issta' }, 'core-a'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'fast' }, 'csrankings-default'), false);
  assert.equal(publicationMatchesConferenceSet({ area: 'fast' }, 'csrankings'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'usenixatc' }, 'csrankings-default'), false);
  assert.equal(publicationMatchesConferenceSet({ area: 'usenixatc' }, 'csrankings'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'ase' }, 'invalid-set'), false);
  assert.equal(getConferenceAreaMap('core').vr, 'graph');
  assert.equal(getConferenceAreaMap('csrankings-default').vr, 'visualization');
});

test('every CORE A venue maps to a real research area', () => {
  const conferenceMap = getConferenceAreaMap('core-a');
  Object.keys(coreAMap).forEach(venue => {
    assert.ok(areaLabels[conferenceMap[venue]], `${venue} has no research-area mapping`);
  });
  assert.equal(conferenceMap.pets, 'sec');
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

test('a school card ranks its faculty roster and scopes subfield counts to the subfield', () => {
  const data = {
    schools: { 'Example University': { country: 'us' } },
    professors: {
      Alice: {
        name: 'Alice',
        affiliation: 'Example University',
        pubs: [
          { area: 'icml', year: 2025, count: 4, adjustedcount: 2 },
          { area: 'pldi', year: 2025, count: 2, adjustedcount: 0.5 }
        ]
      },
      Bob: { name: 'Bob', affiliation: 'Example University', pubs: [{ area: 'icml', year: 2025, count: 3, adjustedcount: 3 }] },
      Carol: { name: 'Carol', affiliation: 'Example University', pubs: [{ area: 'icml', year: 2025, count: 3, adjustedcount: 3 }] }
    }
  };

  const result = filterByYears(data, 2025, 2025, 'us');
  const school = result.schools['Example University'];
  assert.deepEqual(school.areas.mlmining.facultyStats.Alice, { count: 4, adjusted: 2 });
  assert.equal(school.facultyCounts.Alice, 6);

  const html = renderSchoolCard(school, null, { appData: result, currentQuery: '', showRankings: true });
  // Equal adjusted counts share a rank, and the next distinct value follows it.
  assert.match(html, /faculty-tag-rank">1\.<\/span> <span>Bob<\/span> <small class="faculty-tag-stats">3 papers \(3\.0 adjusted\)/);
  assert.match(html, /faculty-tag-rank">1\.<\/span> <span>Carol<\/span>/);
  assert.match(html, /faculty-tag-rank">2\.<\/span> <span>Alice<\/span> <small class="faculty-tag-stats">6 papers \(2\.5 adjusted\)/);
  // Inside a subfield each name reports only the work it published there.
  assert.match(html, /<span>Alice<\/span> <small class="faculty-tag-stats">4 papers \(2\.0 adjusted\)/);
  assert.match(html, /<span>Alice<\/span> <small class="faculty-tag-stats">2 papers \(0\.5 adjusted\)/);
});

test('suggestion ranking tolerates middle initials without losing precedence', () => {
  // Prefix of the whole string beats a word prefix beats a substring beats a
  // per-token match, so exact typing still wins.
  assert.equal(scoreSuggestionMatch('Michael T. Goodrich', 'michael'), 0);
  assert.equal(scoreSuggestionMatch('Michael T. Goodrich', 'goodrich'), 1);
  assert.equal(scoreSuggestionMatch('Michael T. Goodrich', 'l t. go'), 2);
  assert.equal(scoreSuggestionMatch('ThanhVu H. Nguyen', 'thanhvu nguyen'), 3);
  assert.equal(scoreSuggestionMatch('ThanhVu H. Nguyen', 'alice example'), Infinity);
});

test('rendering helpers neutralize markup and unsafe URLs', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(decodeURIComponent(encodeInlineValue("O'Brien </script>")), "O'Brien </script>");
  assert.equal(safeExternalUrl('javascript:alert(1)'), '#');
  assert.equal(safeExternalUrl('https://example.com/profile'), 'https://example.com/profile');
  assert.equal(getInstitutionShortName('Carnegie Mellon University'), 'CMU');
  assert.equal(getInstitutionShortName('George Mason University'), 'GMU');
  assert.equal(getInstitutionShortName('Unmapped University'), 'Unmapped University');
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

test('DBLP profile links resolve to exact author identifiers', () => {
  assert.deepEqual(parseDblpProfileUrl('https://dblp.org/pid/12/3456.html'), {
    pid: '12/3456',
    url: 'https://dblp.org/pid/12/3456.html'
  });
  assert.deepEqual(parseDblpProfileUrl('https://dblp.uni-trier.de/pid/12/3456.xml?view=bibtex'), {
    pid: '12/3456',
    url: 'https://dblp.org/pid/12/3456.html'
  });
  assert.equal(parseDblpProfileUrl('https://example.com/pid/12/3456.html'), null);
  assert.equal(parseDblpProfileUrl('https://dblp.org/db/conf/pldi/index.html'), null);
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

test('school metrics report movement, momentum, concentration, breadth, and collaboration proxy', () => {
  const current = {
    professors: {
      Alice: { name: 'Alice', homepage: 'https://a.example', scholarid: 'a', totalAdjusted: 6 },
      Bob: { name: 'Bob', homepage: '', scholarid: '', totalAdjusted: 4 }
    },
    schools: {
      A: {
        name: 'A', rank: 2, totalCount: 20, totalAdjusted: 10,
        areas: { mlmining: { adjusted: 7, faculty: ['Alice', 'Bob'] }, ai: { adjusted: 3, faculty: ['Alice'] } },
        areaRanks: { mlmining: 3, ai: 12 }
      }
    }
  };
  const prior = { schools: { A: { rank: 5, totalAdjusted: 5, areas: { mlmining: { adjusted: 5 } } } } };
  const metrics = calculateSchoolMetrics(current, prior, 'A');

  assert.equal(metrics.rankDelta, 3);
  assert.equal(metrics.growth, 100);
  assert.equal(metrics.medianPerFaculty, 5);
  assert.equal(metrics.top3Share, 100);
  assert.equal(metrics.activeAreas, 2);
  assert.equal(metrics.sustainedAreas, 1);
  assert.equal(metrics.impliedTeamSize, 2);
  assert.equal(metrics.confidence, 'Medium');
});

test('historical school metrics use only output attributed to that school', () => {
  const current = {
    schools: {
      A: {
        name: 'A', rank: 1, totalAdjusted: 2, totalCount: 2,
        areas: { ai: { adjusted: 2, faculty: ['Mover'] } },
        areaRanks: { ai: 1 }, facultyAdjustedCounts: { Mover: 2 }
      },
      B: {
        name: 'B', rank: 2, totalAdjusted: 8, totalCount: 8,
        areas: { ai: { adjusted: 8, faculty: ['Mover'] } },
        areaRanks: { ai: 2 }, facultyAdjustedCounts: { Mover: 8 }
      }
    },
    professors: { Mover: { name: 'Mover', totalAdjusted: 10, homepage: 'x', scholarid: 'y' } }
  };
  const metricsA = calculateSchoolMetrics(current, { schools: {} }, 'A');
  const metricsB = calculateSchoolMetrics(current, { schools: {} }, 'B');
  assert.equal(metricsA.medianPerFaculty, 2);
  assert.equal(metricsB.medianPerFaculty, 8);
  assert.equal(metricsA.top1Share, 100);
});

test('researcher patterns summarize activity, area shifts, venues, and peers', () => {
  const target = {
    name: 'Target', affiliation: 'A', totalAdjusted: 4.5,
    pubs: [
      { area: 'icse', year: 2020, count: 2, adjustedcount: 1 },
      { area: 'icse', year: 2021, count: 1, adjustedcount: 0.5 },
      { area: 'ccs', year: 2024, count: 2, adjustedcount: 1 },
      { area: 'ccs', year: 2025, count: 4, adjustedcount: 2 }
    ]
  };
  const peers = {
    Target: target,
    Similar: { name: 'Similar', affiliation: 'B', totalAdjusted: 3, areas: { sec: { adjusted: 2 }, soft: { adjusted: 1 } } },
    Different: { name: 'Different', affiliation: 'C', totalAdjusted: 6, areas: { ai: { adjusted: 6 } } }
  };
  const patterns = calculateResearcherPatterns(target, peers, {
    startYear: 2020,
    endYear: 2025,
    confSet: 'csrankings-default'
  });

  assert.deepEqual(patterns.activeYears, [2020, 2021, 2024, 2025]);
  assert.deepEqual(patterns.yearly[2025], { count: 4, adjusted: 2 });
  assert.equal(patterns.peak.year, 2025);
  assert.equal(patterns.activeStreak, 2);
  assert.equal(patterns.primaryArea[0], 'sec');
  assert.deepEqual(patterns.pivot, { from: 'soft', to: 'sec', midpoint: 2022 });
  assert.equal(patterns.venueBreadth, 2);
  assert.deepEqual(patterns.venueShift, { from: 'icse', to: 'ccs' });
  assert.equal(patterns.similarPeers[0].name, 'Similar');
});

test('discovery insights rank substantive movement and ignore tiny momentum baselines', () => {
  const current = {
    professors: {
      A1: { name: 'A1', totalAdjusted: 5 },
      A2: { name: 'A2', totalAdjusted: 4 },
      A3: { name: 'A3', totalAdjusted: 3 },
      B1: { name: 'B1', totalAdjusted: 5 },
      B2: { name: 'B2', totalAdjusted: 3 },
      B3: { name: 'B3', totalAdjusted: 2 },
      C1: { name: 'C1', totalAdjusted: 2 },
      C2: { name: 'C2', totalAdjusted: 2 },
      C3: { name: 'C3', totalAdjusted: 1 }
    },
    schools: {
      A: {
        name: 'A', rank: 2, totalCount: 15, totalAdjusted: 12,
        areas: {
          ai: { adjusted: 7, faculty: ['A1', 'A2'] },
          soft: { adjusted: 5, faculty: ['A3'] }
        },
        areaRanks: { ai: 2, soft: 1 }
      },
      B: {
        name: 'B', rank: 1, totalCount: 12, totalAdjusted: 10,
        areas: { ai: { adjusted: 10, faculty: ['B1', 'B2', 'B3'] } },
        areaRanks: { ai: 1 }
      },
      C: {
        name: 'C', rank: 8, totalCount: 7, totalAdjusted: 5,
        areas: { ai: { adjusted: 5, faculty: ['C1', 'C2', 'C3'] } },
        areaRanks: { ai: 3 }
      }
    }
  };
  const prior = {
    schools: {
      A: { name: 'A', rank: 8, totalAdjusted: 3, areas: { ai: { adjusted: 3 } } },
      B: { name: 'B', rank: 1, totalAdjusted: 9, areas: { ai: { adjusted: 9 } } },
      C: { name: 'C', rank: 2, totalAdjusted: 10, areas: { ai: { adjusted: 8 }, soft: { adjusted: 2 } } }
    }
  };

  const insights = calculateDiscoveryInsights(current, prior);
  assert.equal(insights.rankClimbers[0].name, 'A');
  assert.equal(insights.rankClimbers[0].metrics.rankDelta, 6);
  assert.equal(insights.momentum[0].name, 'A');
  assert.equal(insights.breadthBuilders[0].breadthGain, 1);
  assert.equal(insights.focusedPowerhouses[0].name, 'A');
  assert.equal(insights.focusedPowerhouses[0].focusArea.area, 'soft');
  assert.equal(insights.focusedPowerhouses[0].focusArea.regionalShare, 100);
  assert.ok(insights.focusedPowerhouses[0].focusArea.specialization > 1);
  assert.equal(insights.areaBreakouts[0].name, 'A');
  assert.equal(insights.rankDroppers[0].name, 'C');
  assert.equal(insights.slowdowns[0].name, 'C');
  assert.equal(insights.outputLosses[0].name, 'C');
  assert.equal(insights.breadthContractions[0].name, 'C');
  assert.equal(insights.areaDeclines[0].name, 'C');
});

test('publishing effort includes only the selected school and uses all active faculty', () => {
  const professors = {
    Alice: {
      affiliation: 'George Mason University',
      pubs: [{ area: 'icse', year: 2025, adjustedcount: 4 }]
    },
    Bob: {
      affiliation: 'George Mason University',
      pubs: [{ area: 'ccs', year: 2025, adjustedcount: 2 }]
    },
    Outsider: {
      affiliation: 'Other University',
      pubs: [{ area: 'focs', year: 2025, adjustedcount: 100 }]
    }
  };

  const result = calculatePublishingEffort(professors, {
    startYear: 2025,
    endYear: 2025,
    parentAreas: { icse: 'soft', ccs: 'sec', focs: 'act' },
    includesPublication: professor => professor.affiliation === 'George Mason University'
  });

  assert.equal(result.activeFaculty, 2);
  assert.deepEqual(result.subfields.map(area => area.subfield), ['soft', 'sec']);
  assert.equal(result.subfields[0].effort, 2);
  assert.equal(result.subfields[1].effort, 1);
});

test('rank gap explanation uses geometric-mean log contributions', () => {
  const gaps = explainRankGap(
    { areaAdjustedCounts: { ai: 9, mlmining: 1 } },
    { areaAdjustedCounts: { ai: 1, mlmining: 3 } }
  );
  assert.equal(gaps[0].area, 'ai');
  assert.equal(gaps[0].leader, 'a');
  assert.ok(gaps[0].logGap > 0);
});

test('parity audit validates ranked data', () => {
  const raw = { professors: { Alice: {} } };
  const filtered = {
    professors: { Alice: { homepage: 'https://a.example' } },
    schools: {
      A: { name: 'A', rank: 1, score: 2, country: 'us', totalCount: 2, totalAdjusted: 1, areas: { ai: { adjusted: 1 } } }
    }
  };
  const report = calculateParityReport(raw, filtered);
  assert.equal(report.totalMismatches, 0);
  assert.equal(report.rankOrderIssues, 0);
  assert.equal(report.officialVenueMode, true);
});

test('area momentum compares a school against the field, not against itself', () => {
  const school = (name, areas) => ({ name, areaAdjustedCounts: areas, areas: {}, totalAdjusted: 0 });
  const current = { schools: {
    Target: school('Target', { robotics: 14, act: 10, bio: 1 }),
    Other: school('Other', { robotics: 86, act: 190, bio: 9 })
  } };
  const prior = { schools: {
    Target: school('Target', { robotics: 10, act: 10, bio: 1 }),
    Other: school('Other', { robotics: 90, act: 90, bio: 9 })
  } };

  const momentum = calculateAreaMomentum(current, prior, 'Target');
  const byArea = Object.fromEntries(momentum.map(entry => [entry.area, entry]));

  // Robotics grew 40% here while the field grew exactly 0%.
  assert.equal(byArea.robotics.growth, 40);
  assert.equal(byArea.robotics.fieldGrowth, 0);
  assert.equal(byArea.robotics.delta, 40);
  // Flat output is a real decline when the field doubled.
  assert.equal(byArea.act.growth, 0);
  assert.equal(byArea.act.fieldGrowth, 100);
  assert.equal(byArea.act.delta, -100);
  // Areas too small to be meaningful are dropped.
  assert.equal('bio' in byArea, false);
  // Ordered by the size of the gap, whichever direction it points.
  assert.equal(momentum[0].area, 'act');
  assert.equal(calculateAreaMomentum(current, prior, 'Missing School').length, 0);
});
