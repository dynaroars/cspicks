import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { coreAMap, fetchCsv, filterByYears, getConferenceAreaMap, getPublicationSchools, publicationMatchesConferenceSet } from '../../src/data.js';
import { areaLabels, detectRegionFromLocales, encodeInlineValue, escapeHtml, getInstitutionShortName, safeExternalUrl, scoreSuggestionMatch } from '../../src/shared.js';
import { calculateRankImpact, fuzzyMatch, parseCandidateNames } from '../../src/simulation.js';
import { hasEligiblePageRange, normalizeDblpVenue, parseDblpProfileUrl, topCoauthorsInWindow } from '../../src/dblp.js';
import { parseCsrankingsRules } from '../../src/csrankings-rules.js';
import { renderSchoolCard } from '../../src/search-cards.js';
import { calculateAreaMomentum, calculateDiscoveryInsights, calculateFragility, calculatePerCapita, calculateParityReport, calculatePublishingEffort, calculateResearcherPatterns, calculateSchoolMetrics, calculateSubfieldDiscoveries, collectVariantRanks, compareAreas, describeVerdict, explainRankGap, rankStabilityVariants, summarizeRankStability } from '../../src/metrics.js';
import { awardYear, buildFundingIndex, calculateFundingDiscoveries, findFundingFaculty, formatAwardPeriod, fundingFacultyNameMatches, fundingMatches, fundingSchoolNameMatches, normalizeFundingName, renderFundingFacultyCard } from '../../src/nsf.js';
import { aoeDeadline, conferenceStart, deadlineStatus, filterSchedule, formatCalendarDate, groupConferences, scheduleSuggestions } from '../../csconfs/schedule-data.js';
import { renderScheduleCard } from '../../csconfs/schedule-render.js';
import { buildConferenceEmailUrl, buildConferenceGithubIssueUrl, buildConferenceSubmissionContent } from '../../csconfs/submission.js';
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

function facultyCounts(names) {
  return Object.fromEntries(names.map(name => [name, 1]));
}

test('simulator per-capita mode ranks by output per faculty and drops departments below the minimum', () => {
  const schools = {
    A: {
      name: 'A', rank: 1, areas: { mlmining: { adjusted: 100 } }, areaRanks: { mlmining: 1 },
      facultyAdjustedCounts: facultyCounts(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'])
    },
    B: {
      name: 'B', rank: 2, areas: { mlmining: { adjusted: 45 } }, areaRanks: { mlmining: 2 },
      facultyAdjustedCounts: facultyCounts(['b1', 'b2', 'b3', 'b4', 'b5'])
    },
    C: {
      // Below the 5-faculty minimum: excluded from per-capita ranking outright,
      // even though it is untouched by any op.
      name: 'C', rank: 3, areas: { mlmining: { adjusted: 30 } }, areaRanks: { mlmining: 3 },
      facultyAdjustedCounts: facultyCounts(['c1', 'c2', 'c3'])
    }
  };
  const addStats = { areas: { mlmining: { adjusted: 15 } } };

  // Per-capita mode: B trails A per capita before the add (9 vs 10), but the
  // new hire's output outweighs its own one-person cost to the denominator
  // (45+15)/(5+1) = 10, tying A - a move the total-score numbers never show.
  const perCapitaImpact = calculateRankImpact(schools, [
    { school: schools.B, stats: addStats, isRemoval: false, facultyKey: 'candidate' }
  ], { perCapita: true }).get('B');
  assert.equal(perCapitaImpact.rankBefore, 2);
  assert.equal(perCapitaImpact.rankAfter, 1);
  assert.equal(perCapitaImpact.overall, 1);

  // C never has a per-capita rank: too few faculty, before or after.
  const cImpact = calculateRankImpact(schools, [
    { school: schools.C, stats: addStats, isRemoval: false, facultyKey: 'candidate' }
  ], { perCapita: true }).get('C');
  assert.equal(cImpact.rankBefore, null);
  assert.equal(cImpact.rankAfter, null);
  assert.equal(cImpact.overall, null);

  // Removing one of B's five faculty drops it below the minimum: it had a
  // per-capita rank before, and has none after.
  const removalImpact = calculateRankImpact(schools, [
    { school: schools.B, stats: { areas: { mlmining: { adjusted: 5 } } }, isRemoval: true, facultyKey: 'b1' }
  ], { perCapita: true }).get('B');
  assert.equal(removalImpact.rankBefore, 2);
  assert.equal(removalImpact.rankAfter, null);
  assert.equal(removalImpact.overall, null);
});
