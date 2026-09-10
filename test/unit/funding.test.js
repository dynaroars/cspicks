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
import { awardYear, buildFundingIndex, calculateFundingDiscoveries, findFundingFaculty, formatAwardPeriod, fundingFacultyNameMatches, fundingMatches, fundingSchoolNameMatches, normalizeFundingName, parseNsfDataset, renderFundingFacultyCard } from '../../src/nsf.js';
import { aoeDeadline, conferenceStart, deadlineStatus, filterSchedule, formatCalendarDate, groupConferences, scheduleSuggestions } from '../../csconfs/schedule-data.js';
import { renderScheduleCard } from '../../csconfs/schedule-render.js';
import { buildConferenceEmailUrl, buildConferenceGithubIssueUrl, buildConferenceSubmissionContent } from '../../csconfs/submission.js';

test('NSF parser rejects malformed external data', () => {
  assert.throws(() => parseNsfDataset(null), /Invalid NSF dataset/);
  assert.throws(() => parseNsfDataset({ awards: [{ id: 'incomplete' }] }), /Invalid NSF awards dataset/);
});
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
