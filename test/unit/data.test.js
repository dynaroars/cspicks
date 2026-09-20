import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Papa from 'papaparse';

import { coreAMap, coreAStarMap, fetchCsv, filterByYears, getConferenceAreaMap, getPublicationSchools, nextTier, parentMap, publicationMatchesConferenceSet } from '../../src/data.js';
import { areaLabels, detectRegionFromLocales, encodeInlineValue, escapeHtml, formatRelativeTime, getInstitutionShortName, safeExternalUrl, scoreSuggestionMatch } from '../../src/shared.js';
import { calculateRankImpact, fuzzyMatch, parseCandidateNames } from '../../src/simulation.js';
import { hasEligiblePageRange, normalizeDblpVenue, parseDblpProfileUrl, topCoauthorsInWindow } from '../../src/dblp.js';
import { parseCsrankingsRules } from '../../src/csrankings-rules.js';
import { renderSchoolCard } from '../../src/search-cards.js';
import { calculateAreaMomentum, calculateDiscoveryInsights, calculateFragility, calculatePerCapita, calculateParityReport, calculatePublishingEffort, calculateResearcherPatterns, calculateSchoolMetrics, calculateSubfieldDiscoveries, collectVariantRanks, compareAreas, describeVerdict, explainRankGap, rankStabilityVariants, summarizeRankStability } from '../../src/metrics.js';
import { awardYear, buildFundingIndex, calculateFundingDiscoveries, findFundingFaculty, formatAwardPeriod, fundingFacultyNameMatches, fundingMatches, fundingSchoolNameMatches, normalizeFundingName, renderFundingFacultyCard } from '../../src/nsf.js';
import { aoeDeadline, conferenceStart, deadlineStatus, filterSchedule, formatCalendarDate, groupConferences, scheduleSuggestions } from '../../csconfs/schedule-data.js';
import { renderScheduleCard } from '../../csconfs/schedule-render.js';
import { buildConferenceEmailUrl, buildConferenceGithubIssueUrl, buildConferenceSubmissionContent } from '../../csconfs/submission.js';
import { decodeAffiliationHistory, encodeAffiliationHistory } from '../../src/affiliation-history-format.js';
function professor(name, affiliation, count, adjustedcount) {
  return {
    name,
    affiliation,
    pubs: [{ area: 'icml', year: 2025, count, adjustedcount }]
  };
}

test('affiliation histories round-trip through the compact dictionary format', () => {
  const history = {
    Alice: [{ start: 2020, end: 2022, school: 'Old Name' }],
    Bob: [{ start: 2023, end: 2026, school: 'Canonical School' }]
  };
  const compact = encodeAffiliationHistory(history, { 'Old Name': 'Canonical School' });
  assert.equal(compact.schools.length, 1);
  assert.deepEqual(decodeAffiliationHistory(compact), {
    Alice: [{ start: 2020, end: 2022, school: 'Canonical School' }],
    Bob: [{ start: 2023, end: 2026, school: 'Canonical School' }]
  });
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

test('an implausibly sprawling history that never mentions the current school is not trusted', () => {
  // build-openalex-history.js resolves a professor by a bare name search with
  // no affiliation check, so a name that collides with a more prominent,
  // unrelated researcher elsewhere in OpenAlex silently attaches that other
  // person's entire career. The signature: many more institutions than one
  // career plausibly has, none of them the professor's actual current school.
  const prof = { name: 'Wing Lam', affiliation: 'George Mason University' };
  const wrongCareer = Array.from({ length: 10 }, (_, i) => ({
    school: `Unrelated Institution ${i}`, start: 2000 + i, end: 2000 + i
  }));
  const history = { 'Wing Lam': wrongCareer };

  // Every year - even ones a segment happens to cover - falls back to the
  // professor's real current affiliation instead of the merged-in noise.
  assert.deepEqual(getPublicationSchools(prof, { year: 2023 }, history), ['George Mason University']);
  assert.deepEqual(getPublicationSchools(prof, { year: 1990 }, history), ['George Mason University']);

  // A history with the same size that DOES include the current school is
  // still trusted (a genuinely mobile academic, not a merge failure) - only
  // years outside its coverage return no attribution, same as any other
  // ordinary history.
  const legitCareer = [...wrongCareer, { school: 'George Mason University', start: 2021, end: 2026 }];
  assert.deepEqual(getPublicationSchools(prof, { year: 2023 }, { 'Wing Lam': legitCareer }), ['George Mason University']);
  assert.deepEqual(getPublicationSchools(prof, { year: 2000 }, { 'Wing Lam': legitCareer }), ['Unrelated Institution 0']);
  assert.deepEqual(getPublicationSchools(prof, { year: 2015 }, { 'Wing Lam': legitCareer }), []);

  // A small, sparse history missing the current school (plausibly just stale,
  // not merged) still gets the benefit of the doubt.
  const sparseAndStale = [{ school: 'Old University', start: 2010, end: 2015 }];
  assert.deepEqual(getPublicationSchools(prof, { year: 2012 }, { 'Wing Lam': sparseAndStale }), ['Old University']);
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

test('CORE-extra publications only surface for a professor under core/core-a, not other conference sets', () => {
  // A professor with zero CSRankings-tracked publications (would previously
  // have been deleted from `professors` at load time) but a real CORE-only
  // publication (aistats: CORE A only, absent from parentMap).
  const data = {
    schools: { A: { country: 'us' } },
    professors: { P: { name: 'P', affiliation: 'A', pubs: [] } }
  };
  const corePubsMap = new Map([['P', [{ area: 'aistats', year: 2025, count: 1, adjustedcount: 1 }]]]);

  const coreResult = filterByYears(data, 2025, 2025, 'us', null, null, 'core-a', corePubsMap);
  assert.ok(coreResult.professors.P, 'CORE-extra publication should surface the professor under core-a');
  assert.equal(coreResult.professors.P.totalAdjusted, 1);

  const coreAOnlyResult = filterByYears(data, 2025, 2025, 'us', null, null, 'core-a-only', corePubsMap);
  assert.ok(coreAOnlyResult.professors.P, 'CORE-extra publication should also surface under core-a-only');
  assert.equal(coreAOnlyResult.professors.P.totalAdjusted, 1);

  const defaultResult = filterByYears(data, 2025, 2025, 'us', null, null, 'csrankings-default', corePubsMap);
  assert.equal(defaultResult.professors.P, undefined, 'CORE-extra data must not leak into csrankings-default');

  const unionResult = filterByYears(data, 2025, 2025, 'us', null, null, 'all-union', corePubsMap);
  assert.equal(unionResult.professors.P, undefined, 'CORE-extra data must not leak into all-union either');

  const noMapResult = filterByYears(data, 2025, 2025, 'us', null, null, 'core-a');
  assert.equal(noMapResult.professors.P, undefined, 'a professor with no base pubs stays absent without corePubsMap');
});

test('conference-set rules consistently distinguish default, extended, and CORE venues', () => {
  assert.equal(publicationMatchesConferenceSet({ area: 'icse' }, 'csrankings-default'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'ase' }, 'csrankings-default'), false);
  assert.equal(publicationMatchesConferenceSet({ area: 'ase' }, 'csrankings'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'ase' }, 'core'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'issta' }, 'core'), false);
  assert.equal(publicationMatchesConferenceSet({ area: 'issta' }, 'core-a'), true);
  // core-a-only is CORE A tier venues alone, excluding A*.
  assert.equal(publicationMatchesConferenceSet({ area: 'aistats' }, 'core-a-only'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'aamas' }, 'core-a-only'), false);
  assert.equal(getConferenceAreaMap('core-a-only').aistats, 'mlmining');
  assert.equal(getConferenceAreaMap('core-a-only').aamas, undefined);
  assert.equal(publicationMatchesConferenceSet({ area: 'fast' }, 'csrankings-default'), false);
  assert.equal(publicationMatchesConferenceSet({ area: 'fast' }, 'csrankings'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'usenixatc' }, 'csrankings-default'), false);
  assert.equal(publicationMatchesConferenceSet({ area: 'usenixatc' }, 'csrankings'), true);
  // An invalid set normalizes to the app default, all-union, which includes ase.
  assert.equal(publicationMatchesConferenceSet({ area: 'ase' }, 'invalid-set'), true);
  assert.equal(getConferenceAreaMap('core').vr, 'graph');
  assert.equal(getConferenceAreaMap('csrankings-default').vr, 'visualization');
});

test('all-union unions CSRankings and CORE venues', () => {
  // ase: CSRankings extended only. aistats: CORE A only, absent from parentMap.
  assert.equal(publicationMatchesConferenceSet({ area: 'ase' }, 'all-union'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'aistats' }, 'all-union'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'icse' }, 'all-union'), true);
  assert.equal(publicationMatchesConferenceSet({ area: 'nonexistent-venue' }, 'all-union'), false);
  assert.equal(getConferenceAreaMap('all-union').aistats, 'mlmining');
});

test('EXTRA_VENUES (CORE-only venues) never overlap CSRankings-tracked venues', () => {
  // Guards the no-double-counting invariant EXPANSION_PLAN.md Step 3.4 relies
  // on: scripts/build-core-extra-pubs.js only emits rows for venues in this
  // set, so a paper credited via generated-author-info.csv can never also be
  // credited via the CORE-extra dataset.
  const csrankingsVenues = new Set([...Object.keys(parentMap), ...Object.keys(nextTier)]);
  const coreVenues = new Set([...Object.keys(coreAMap), ...Object.keys(coreAStarMap)]);
  const extraVenues = [...coreVenues].filter(venue => !csrankingsVenues.has(venue));
  const overlap = extraVenues.filter(venue => csrankingsVenues.has(venue));
  assert.equal(overlap.length, 0);
  assert.ok(extraVenues.length > 0, 'sanity check: CORE declares at least one venue CSRankings does not track');
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
  // The table holds names no rule could derive, keyed on CSRankings' own
  // spelling — which is "Univ. of ...", not "University of ...".
  assert.equal(getInstitutionShortName('Univ. of California - Berkeley'), 'UC Berkeley');
  assert.equal(getInstitutionShortName('University of Pennsylvania'), 'Penn');
  // Everything else drops a "University" suffix when the rest stands alone.
  assert.equal(getInstitutionShortName('Harvard University'), 'Harvard');
  assert.equal(getInstitutionShortName('Stanford University'), 'Stanford');
  assert.equal(getInstitutionShortName('Columbia University'), 'Columbia');
  assert.equal(getInstitutionShortName('Ohio State University'), 'Ohio State');
  assert.equal(getInstitutionShortName('North Carolina State University'), 'North Carolina State');
  // A multi-word remainder does not read as an institution on its own.
  assert.equal(getInstitutionShortName('Istanbul Technical University'), 'Istanbul Technical University');
  assert.equal(getInstitutionShortName('De La Salle University'), 'De La Salle University');
  assert.equal(getInstitutionShortName('University of Virginia'), 'University of Virginia');
  assert.equal(getInstitutionShortName('George Mason University'), 'GMU');
  // No table entry and no suffix to drop: the name passes through untouched.
  assert.equal(getInstitutionShortName('Unmapped Institute of Technology'), 'Unmapped Institute of Technology');

  const now = 1700000000000;
  assert.equal(formatRelativeTime(now - 10000, now), 'just now');
  assert.equal(formatRelativeTime(now - 60000, now), '1 min ago');
  assert.equal(formatRelativeTime(now - 180000, now), '3 mins ago');
  assert.equal(formatRelativeTime(now - 7200000, now), '2 hours ago');
  assert.equal(formatRelativeTime(now - 86400000, now), 'yesterday');
  assert.equal(formatRelativeTime(now - 86400000 * 5, now), '5 days ago');
  assert.equal(formatRelativeTime('invalid-date', now), 'Unknown');
});

test('core-extra-author-info.csv matches the schema src/data.ts\'s loadCoreExtraPubs expects', () => {
  const csv = fs.readFileSync(new URL('../../public/core-extra-author-info.csv', import.meta.url), 'utf8');
  const { data: rows, meta } = Papa.parse(csv, { header: true, skipEmptyLines: true });

  assert.deepEqual(meta.fields, ['name', 'area', 'count', 'adjustedcount', 'year']);
  assert.ok(rows.length > 0, 'expected at least one row');

  // Mirrors generated-author-info.csv's own convention: the `area` column
  // actually holds a venue key (e.g. "aistats"), which src/data.ts resolves
  // to a research area at query time via coreAMap/coreAStarMap — it must not
  // be the already-resolved area name, or publicationMatchesConferenceSet's
  // acronym-keyed lookup silently never matches these rows.
  const extraVenues = new Set(Object.keys(coreAMap).concat(Object.keys(coreAStarMap))
    .filter(venue => !parentMap[venue] && !nextTier[venue]));

  for (const row of rows.slice(0, 2000)) {
    assert.ok(row.name && !/\s+\[[^\]]+\]$/.test(row.name), `row name "${row.name}" must be a plain roster name, no [unit] suffix`);
    assert.ok(extraVenues.has(row.area), `row area "${row.area}" must be one of EXTRA_VENUES' venue keys, not a resolved research area`);
    assert.ok(Number.isFinite(Number.parseInt(row.year, 10)));
    assert.ok(Number.isFinite(Number.parseFloat(row.count)));
    assert.ok(Number.isFinite(Number.parseFloat(row.adjustedcount)));
  }
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
