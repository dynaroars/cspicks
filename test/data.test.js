import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { coreAMap, fetchCsv, filterByYears, getConferenceAreaMap, getPublicationSchools, publicationMatchesConferenceSet } from '../src/data.js';
import { areaLabels, detectRegionFromLocales, encodeInlineValue, escapeHtml, getInstitutionShortName, safeExternalUrl, scoreSuggestionMatch } from '../src/shared.js';
import { calculateRankImpact, fuzzyMatch, parseCandidateNames } from '../src/simulation.js';
import { hasEligiblePageRange, normalizeDblpVenue, parseDblpProfileUrl, topCoauthorsInWindow } from '../src/dblp.js';
import { parseCsrankingsRules } from '../src/csrankings-rules.js';
import { renderSchoolCard } from '../src/search-cards.js';
import { calculateAreaMomentum, calculateDiscoveryInsights, calculateFragility, calculatePerCapita, calculateParityReport, calculatePublishingEffort, calculateResearcherPatterns, calculateSchoolMetrics, calculateSubfieldDiscoveries, collectVariantRanks, compareAreas, describeVerdict, explainRankGap, rankStabilityVariants, summarizeRankStability } from '../src/metrics.js';
import { awardYear, buildFundingIndex, calculateFundingDiscoveries, findFundingFaculty, formatAwardPeriod, fundingFacultyNameMatches, fundingMatches, fundingSchoolNameMatches, normalizeFundingName, renderFundingFacultyCard } from '../src/nsf.js';
import { aoeDeadline, conferenceStart, deadlineStatus, filterSchedule, formatCalendarDate, groupConferences, scheduleSuggestions } from '../csconfs/schedule-data.js';
import { renderScheduleCard } from '../csconfs/schedule-render.js';
import { buildConferenceEmailUrl, buildConferenceGithubIssueUrl, buildConferenceSubmissionContent } from '../csconfs/submission.js';

test('conference schedules group cycles and filter by conference year, venue set, and area', () => {
  const conferences = [
    { name: 'VLDB', year: 2027, venueKeys: ['vldb'], deadline: '2026-09-01', date: 'August 2027', description: 'Databases', note: 'Cycle 1' },
    { name: 'VLDB', year: 2027, venueKeys: ['vldb'], deadline: '2026-10-01', date: 'August 2027', description: 'Databases', note: 'Cycle 2' },
    { name: 'PLDI', year: 2027, venueKeys: ['pldi'], deadline: '2026-11-10', date: 'June 2027', description: 'Programming language design' },
    { name: 'Old', year: 2026, venueKeys: ['pldi'], deadline: '2025-01-01', date: 'January 2026' }
  ];
  const now = Date.UTC(2026, 7, 19);
  assert.equal(groupConferences(conferences).length, 3);
  assert.deepEqual(filterSchedule(conferences, {
    startYear: 2026, endYear: 2027, confSet: 'csrankings-default', query: 'databases', upcomingOnly: true, now
  }).map(group => [group[0].name, group.length]), [['VLDB', 2]]);
  assert.deepEqual(filterSchedule(conferences, {
    startYear: 2027, endYear: 2027, confSet: 'csrankings-default', query: 'Programming Languages', upcomingOnly: true, now
  }).map(group => group[0].name), ['PLDI']);
  assert.equal(filterSchedule(conferences, {
    startYear: 2026, endYear: 2026, confSet: 'csrankings-default', query: '', upcomingOnly: true, now
  }).length, 0);
});

test('conference schedule date handling preserves calendar dates and uses AoE', () => {
  assert.equal(aoeDeadline('2026-09-01'), Date.UTC(2026, 8, 2, 11, 59, 59, 999));
  assert.equal(conferenceStart('July 7–9, 2027', 2027), Date.UTC(2027, 6, 7));
  assert.equal(conferenceStart('10–14 May, 2028', 2028), Date.UTC(2028, 4, 10));
  assert.equal(formatCalendarDate('January 10-16, 2027'), 'January 10-16, 2027');
  assert.equal(deadlineStatus('TBD', Date.UTC(2026, 0, 1)).text, 'TBD');
  assert.equal(deadlineStatus('2026-01-01', Date.UTC(2026, 0, 3)).text, 'Passed');
});

test('conference schedule suggestions include compound venue aliases', () => {
  const suggestions = scheduleSuggestions([
    { name: 'UbiComp / ISWC', year: 2027, venueKeys: ['ubicomp', 'iswc'] },
    { name: 'SIGCSE TS', year: 2027, venueKeys: ['sigcse'] }
  ], 2027, 2027, 'all-union');
  assert.deepEqual(suggestions.conferences.map(item => item.label), ['SIGCSE TS', 'UbiComp / ISWC']);
  assert.ok(suggestions.areas.some(item => item.label === 'HCI'));
});

test('conference schedule cards preserve chair metadata safely', () => {
  const html = renderScheduleCard([{
    name: 'Example', year: 2027, venueKeys: ['pldi'], link: 'https://example.test',
    generalChair: 'Alice & Bob', programChair: '<script>alert(1)</script>', deadline: 'TBD'
  }], Date.UTC(2026, 0, 1));
  assert.match(html, /General chairs: Alice &amp; Bob/);
  assert.match(html, /Program chair: &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('local conference data preserves retired metadata and calendar dates', () => {
  const conferences = JSON.parse(fs.readFileSync(new URL('../csconfs/data/conferences.json', import.meta.url), 'utf8'));
  assert.equal(conferences.length, 1029);
  assert.ok(conferences.filter(conf => conf.generalChair).length >= 688);
  const icde = conferences.find(conf => conf.name === 'ICDE' && conf.year === 2025 && conf.note === 'Cycle 1/2');
  assert.equal(icde.deadline, '2024-08-02');
  assert.equal(icde.generalChair, 'Xiaofang Zhou, Qing Li');
});

test('conference submissions produce reviewable email and GitHub issue links', () => {
  const submission = {
    type: 'correction',
    target: { name: 'PLDI', year: 2027, note: null },
    sourceUrl: 'https://example.test/pldi-2027',
    entry: { name: 'PLDI', year: 2027, venueKeys: ['pldi'], deadline: '2026-11-08' }
  };
  const content = buildConferenceSubmissionContent(submission);
  assert.deepEqual(JSON.parse(content), submission);

  const email = new URL(buildConferenceEmailUrl('PLDI 2027', content));
  assert.equal(email.protocol, 'mailto:');
  assert.equal(email.pathname, 'root@roars.dev');
  assert.match(email.searchParams.get('subject'), /PLDI 2027/);
  assert.match(email.searchParams.get('body'), /example\.test\/pldi-2027/);

  const issue = new URL(buildConferenceGithubIssueUrl('PLDI 2027', content));
  assert.equal(issue.origin + issue.pathname, 'https://github.com/dynaroars/cspicks/issues/new');
  assert.match(issue.searchParams.get('title'), /PLDI 2027/);
  assert.match(issue.searchParams.get('body'), /```json/);
});

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
      investigators: [{ name: 'A', role: 'PI', facultyName: 'ThanhVu H. Nguyen', rosterName: 'ThanhVu H. Nguyen', affiliation: 'Example University' }]
    }, {
      id: '2', title: 'Ambiguous', awardee: 'Other University', awardDate: '09/01/2024',
      estimatedAmount: 200000,
      investigators: [{ name: 'B', role: 'PI', facultyName: 'Michael T. Goodrich', rosterName: 'Michael T. Goodrich', affiliation: 'Other University' }]
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
        { name: 'Alice', role: 'PI', facultyName: 'Alice', rosterName: 'Alice', affiliation: 'Example University' },
        { name: 'Bob', role: 'Co-PI', facultyName: 'Bob', rosterName: 'Bob', affiliation: 'Example University' },
        { name: 'Outside', role: 'Co-PI', facultyName: null, rosterName: null, affiliation: null }
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
      investigators: [{ name: 'Alice', facultyName: 'Alice', rosterName: 'Alice', affiliation: 'Example University' }]
    },
    {
      id: 'unmatched', title: 'Unmatched university project', awardDate: '01/01/2024', obligatedAmount: 999999,
      investigators: [{ name: 'Outside', facultyName: null, rosterName: null, affiliation: null }]
    },
    {
      // A CSRankings roster row NSF's PI name matched (facultyName) but with no
      // corresponding publication-table entry (rosterName null): the roster
      // sync could not verify them, so they should not appear anywhere the
      // rest of the app can — matching facultyName alone would wrongly credit
      // this award to a person and school no professor search can ever find.
      id: 'ghost', title: 'Unverifiable match', awardDate: '01/01/2024', obligatedAmount: 555555,
      investigators: [{ name: 'Ghost', facultyName: 'Ghost Person', rosterName: null, affiliation: 'Example University' }]
    }
  ] };
  const funding = buildFundingIndex(dataset, 2020, 2025);
  assert.deepEqual(funding.awards.map(award => award.id), ['matched']);
  assert.equal(funding.schools[0].attributedAmount, 100);
  assert.equal(funding.faculty.length, 1);
});

test('NSF funding uses collaborative project totals without changing local attribution', () => {
  const title = 'Collaborative Research: SHF: Medium: Shared project';
  const dataset = { awards: [
    {
      id: '1', title, awardee: 'Example University', awardDate: '07/01/2024', obligatedAmount: 400000,
      estimatedAmount: 400000, collaborativeTotalAmount: 1200000,
      investigators: [{ name: 'Alice', role: 'PI', facultyName: 'Alice', rosterName: 'Alice', affiliation: 'Example University' }]
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

test('subfield discoveries rank region-wide area movement, spread, and leadership changes', () => {
  const current = {
    schools: {
      A: { name: 'A', areas: { ai: { adjusted: 7 }, soft: { adjusted: 2 }, chi: { adjusted: 2 }, robotics: { adjusted: 4 }, vision: { adjusted: 5 } } },
      B: { name: 'B', areas: { ai: { adjusted: 10 }, robotics: { adjusted: 3 } } },
      C: { name: 'C', areas: { ai: { adjusted: 5 }, robotics: { adjusted: 2 } } },
      D: { name: 'D', areas: { robotics: { adjusted: 2 } } },
      E: { name: 'E', areas: { robotics: { adjusted: 1 } } }
    }
  };
  const prior = {
    schools: {
      A: { name: 'A', areas: { ai: { adjusted: 3 }, soft: { adjusted: 5 }, robotics: { adjusted: 3 }, vision: { adjusted: 2 } } },
      B: { name: 'B', areas: { ai: { adjusted: 9 }, chi: { adjusted: 2 }, robotics: { adjusted: 2 }, vision: { adjusted: 2 } } },
      C: { name: 'C', areas: { ai: { adjusted: 8 }, robotics: { adjusted: 1 }, vision: { adjusted: 2 } } }
    }
  };

  const subfields = calculateSubfieldDiscoveries(current, prior);

  // robotics roughly doubles (6 -> 12 adjusted) and outranks ai's modest gain.
  assert.equal(subfields.growth[0].area, 'robotics');
  assert.equal(subfields.growth[0].growth, 100);
  assert.ok(subfields.growth.some(s => s.area === 'ai' && s.growth === 10));

  // soft drops the most (5 -> 2); vision also declines but less sharply.
  assert.equal(subfields.decline[0].area, 'soft');
  assert.equal(subfields.decline[0].growth, -60);

  // robotics spreads from 3 to 5 active universities.
  assert.equal(subfields.expandingReach[0].area, 'robotics');
  assert.equal(subfields.expandingReach[0].schoolGain, 2);

  // vision consolidates from 3 active universities down to 1.
  assert.equal(subfields.narrowingReach[0].area, 'vision');
  assert.equal(subfields.narrowingReach[0].schoolGain, -2);

  // chi's only active school flips from B to A; every other subfield here
  // keeps (or ties on) the same leader across both periods.
  assert.equal(subfields.leadershipChanges.length, 1);
  assert.equal(subfields.leadershipChanges[0].area, 'chi');
  assert.equal(subfields.leadershipChanges[0].formerLeader, 'B');
  assert.equal(subfields.leadershipChanges[0].newLeader, 'A');
});

test('area vs area comparison reports growth, new entrants, and who bridges both fields', () => {
  const current = {
    schools: {
      A: { name: 'A', areas: { ai: { adjusted: 6, faculty: ['Alice', 'Bob'] }, vision: { adjusted: 3, faculty: ['Alice'] } } },
      B: { name: 'B', areas: { ai: { adjusted: 4, faculty: ['Carol'] }, vision: { adjusted: 5, faculty: ['Dan', 'Erin'] } } },
      C: { name: 'C', areas: { vision: { adjusted: 2, faculty: ['Erin'] } } }
    }
  };
  const prior = {
    schools: {
      A: { name: 'A', areas: { ai: { adjusted: 5, faculty: ['Alice'] }, vision: { adjusted: 2, faculty: ['Alice'] } } },
      B: { name: 'B', areas: { ai: { adjusted: 4, faculty: ['Carol'] }, vision: { adjusted: 6, faculty: ['Dan'] } } }
    }
  };

  const cmp = compareAreas(current, prior, 'ai', 'vision');

  assert.equal(cmp.a.currentTotal, 10);
  assert.equal(cmp.a.priorTotal, 9);
  assert.ok(Math.abs(cmp.a.growth - (100 / 9)) < 1e-9);
  assert.deepEqual(cmp.a.newFaculty, ['Bob']);
  assert.deepEqual(cmp.a.schools.map(s => s.name), ['A', 'B']);

  assert.equal(cmp.b.currentTotal, 10);
  assert.equal(cmp.b.priorTotal, 8);
  assert.equal(cmp.b.growth, 25);
  assert.deepEqual(cmp.b.newFaculty, ['Erin']);
  assert.deepEqual(cmp.b.schools.map(s => s.name), ['B', 'A', 'C']);

  // Alice is the only researcher active in both AI and Vision this period.
  assert.deepEqual(cmp.bothFaculty, ['Alice']);

  // A and B both publish in both fields; C only publishes in vision.
  assert.deepEqual(cmp.bothSchools.map(s => s.name), ['A', 'B']);
  assert.deepEqual(cmp.bothSchools.find(s => s.name === 'A'), { name: 'A', creditA: 6, creditB: 3 });
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
  // Defaults (official venue set, no per-capita, no History) reproduce CSRankings.
  assert.equal(report.matchesCsrankings, true);
  assert.deepEqual(report.divergences, []);

  // Each mode that reorders or reattributes output is reported as a divergence.
  const perCapita = calculateParityReport(raw, filtered, 'csrankings-default', { perCapita: true });
  assert.equal(perCapita.matchesCsrankings, false);
  assert.deepEqual(perCapita.divergences, ['per-capita ranking']);

  const everything = calculateParityReport(raw, filtered, 'core', { perCapita: true, historical: true });
  assert.equal(everything.matchesCsrankings, false);
  assert.equal(everything.divergences.length, 3);

  const inconsistent = calculateParityReport(raw, {
    ...filtered,
    schools: { A: { ...filtered.schools.A, totalAdjusted: 99 } }
  });
  assert.equal(inconsistent.matchesCsrankings, false);
  assert.equal(inconsistent.totalMismatches, 1);
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

test('rank stability sweeps every window and conference set, holding region fixed', () => {
  const variants = rankStabilityVariants(2026);
  assert.equal(variants.length, 20);
  assert.deepEqual([...new Set(variants.map(v => v.confSet))], ['csrankings-default', 'csrankings', 'core', 'core-a', 'all-union']);
  // Windows are inclusive of both endpoints, so a 5-year window is 2022–2026.
  assert.deepEqual(variants[0], { key: '5|csrankings-default', span: 5, confSet: 'csrankings-default', startYear: 2022, endYear: 2026 });

  const data = {
    schools: { Steady: { country: 'us' }, Swingy: { country: 'us' } },
    professors: {
      // Steady publishes an always-counted venue; Swingy publishes one the
      // default set excludes, so Swingy's standing depends on the setting.
      // The margin is wide because school scores round to one decimal, which
      // collapses small differences into ties.
      Steady: { name: 'Steady', affiliation: 'Steady', pubs: [{ area: 'icse', year: 2025, count: 4, adjustedcount: 4 }] },
      Swingy: { name: 'Swingy', affiliation: 'Swingy', pubs: [{ area: 'ase', year: 2025, count: 60, adjustedcount: 60 }] }
    }
  };
  const samples = rankStabilityVariants(2026).map(variant =>
    collectVariantRanks(data, variant, { region: 'us', historyMap: null, aliasMap: null }));

  const steady = summarizeRankStability(samples, 'Steady');
  const swingy = summarizeRankStability(samples, 'Swingy');
  assert.equal(steady.settings, 20);
  // Steady leads wherever ASE is excluded and trails wherever it counts, so the
  // same department holds two different ranks depending on the setting alone.
  assert.equal(steady.best, 1);
  assert.equal(steady.worst, 2);
  assert.equal(steady.spread, 1);
  assert.equal(steady.stable, true);
  // Swingy simply does not exist under the four default-venue settings.
  assert.equal(swingy.best, 1);
  assert.equal(swingy.unranked, 4, 'settings where a school never ranks are reported, not dropped');
  assert.equal(swingy.rows.filter(row => row.rank === null).length, 4);
  assert.equal(summarizeRankStability(samples, 'Nonexistent University'), null);
});

test('a comparison verdict separates who is bigger from who is broader', () => {
  const school = (rank) => ({ rank });
  const person = (totalAdjusted) => ({ totalAdjusted });

  // Rank and breadth agree: one plain statement.
  assert.deepEqual(describeVerdict('school', school(1), school(32), 19, 8), {
    leader: 'a', phrase: '#1 vs #32', verb: 'ranks higher', areaLeader: 'a', kind: 'agree'
  });
  // The higher-ranked school is the narrower one — the case worth surfacing.
  assert.equal(describeVerdict('school', school(12), school(18), 6, 15).kind, 'split');
  assert.equal(describeVerdict('school', school(12), school(18), 6, 15).leader, 'a');
  assert.equal(describeVerdict('school', school(12), school(18), 6, 15).areaLeader, 'b');
  // Tied rank, unequal breadth.
  assert.equal(describeVerdict('school', school(4), school(4), 3, 9).kind, 'breadth-only');
  // Nothing separates them at all.
  assert.equal(describeVerdict('school', school(4), school(4), 5, 5).kind, 'even');
  // Researchers are judged on adjusted output, not rank.
  const researcher = describeVerdict('researcher', person(12.4), person(8.1), 5, 3);
  assert.equal(researcher.verb, 'has more output');
  assert.equal(researcher.phrase, '12.4 vs 8.1 adjusted');
  assert.equal(researcher.leader, 'a');
});

test('per-faculty ranking reorders the field and ignores tiny departments', () => {
  const prof = (name, affiliation, adjusted) => ({
    name, affiliation, pubs: [{ area: 'icse', year: 2025, count: adjusted, adjustedcount: adjusted }]
  });
  const professors = {};
  // Big wins on total output (120 vs 30) but loses on rate (3.0 vs 6.0 each).
  // The margin is wide because school scores round to one decimal place, which
  // collapses smaller differences into ties.
  for (let i = 0; i < 40; i++) professors[`Big${i}`] = prof(`Big${i}`, 'Big University', 3);
  for (let i = 0; i < 5; i++) professors[`Small${i}`] = prof(`Small${i}`, 'Small College', 6);
  professors.Solo = prof('Solo', 'Tiny Institute', 50);

  const data = filterByYears({
    schools: { 'Big University': { country: 'us' }, 'Small College': { country: 'us' }, 'Tiny Institute': { country: 'us' } },
    professors
  }, 2025, 2025, 'us');

  // The geometric mean rewards Big's volume; per-faculty rewards Small's rate.
  assert.ok(data.schools['Big University'].rank < data.schools['Small College'].rank);
  const perCapita = calculatePerCapita(data);
  assert.equal(perCapita[0].name, 'Small College');
  assert.equal(perCapita[0].perCapita, 6);
  assert.equal(perCapita[0].overallRank, data.schools['Small College'].rank);
  assert.equal(perCapita[1].name, 'Big University');
  assert.equal(perCapita[1].perCapita, 3);
  // One prolific person is not a department: below the floor it is omitted.
  assert.equal(perCapita.some(row => row.name === 'Tiny Institute'), false);
  assert.equal(calculatePerCapita(data, { minFaculty: 1 })[0].name, 'Tiny Institute');
});

test('fragility counts the departures that move a university out of a rank band', () => {
  const prof = (name, affiliation, adjusted) => ({
    name, affiliation, pubs: [{ area: 'icse', year: 2025, count: adjusted, adjustedcount: adjusted }]
  });
  const professors = {
    // Concentrated: one person carries almost everything.
    Star: prof('Star', 'Concentrated University', 40),
    Minor: prof('Minor', 'Concentrated University', 1),
    // Broad: the same total spread over four people.
    B1: prof('B1', 'Broad University', 10), B2: prof('B2', 'Broad University', 10),
    B3: prof('B3', 'Broad University', 10), B4: prof('B4', 'Broad University', 10),
    Rival: prof('Rival', 'Rival University', 20)
  };
  const data = filterByYears({
    schools: {
      'Concentrated University': { country: 'us' }, 'Broad University': { country: 'us' }, 'Rival University': { country: 'us' }
    },
    professors
  }, 2025, 2025, 'us');

  const concentrated = calculateFragility(data, 'Concentrated University', { thresholds: [2] });
  const broad = calculateFragility(data, 'Broad University', { thresholds: [2] });
  assert.equal(concentrated.facultyCount, 2);
  // Losing the one carrier drops the concentrated department immediately; the
  // broad one absorbs the same loss.
  assert.equal(concentrated.exits[2], 1);
  assert.ok(broad.exits[2] === undefined || broad.exits[2] > 1);
  // Each step re-ranks against the other universities, which do not change.
  assert.ok(concentrated.steps[0].rank > concentrated.rank);
  assert.equal(calculateFragility(data, 'Nonexistent University'), null);
});

test('coauthor windows are derived from cached per-year counts', () => {
  // One cached profile answers every year window, so changing the year filter
  // costs no further DBLP requests.
  const records = [
    { name: 'Steady Collaborator', years: { 2015: 2, 2020: 3, 2024: 1 } },
    { name: 'Recent Collaborator', years: { 2023: 4, 2024: 4 } },
    { name: 'Old Collaborator', years: { 2001: 9 } }
  ];

  assert.deepEqual(topCoauthorsInWindow(records, { startYear: 2020, endYear: 2026 }), [
    { name: 'Recent Collaborator', papers: 8 },
    { name: 'Steady Collaborator', papers: 4 }
  ]);
  assert.deepEqual(topCoauthorsInWindow(records, { startYear: 2000, endYear: 2010 }), [
    { name: 'Old Collaborator', papers: 9 }
  ]);
  assert.deepEqual(topCoauthorsInWindow(records, { startYear: 2020, endYear: 2026, limit: 1 }), [
    { name: 'Recent Collaborator', papers: 8 }
  ]);
  // A window with no joint papers yields nothing rather than zero-count rows.
  assert.deepEqual(topCoauthorsInWindow(records, { startYear: 2005, endYear: 2010 }), []);
  assert.deepEqual(topCoauthorsInWindow([], { startYear: 2020, endYear: 2026 }), []);
  assert.deepEqual(topCoauthorsInWindow(undefined, {}), []);
});
