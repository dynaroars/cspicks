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
  const conferences = JSON.parse(fs.readFileSync(new URL('../../csconfs/data/conferences.json', import.meta.url), 'utf8'));
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
