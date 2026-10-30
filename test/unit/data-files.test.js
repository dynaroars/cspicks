import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import {
  conferenceProblems, dataWarnings, grantProblems, manualAffiliationProblems, sourceProblems
} from '../../scripts/data-checks.mjs';
import { homepageKey } from '../../scripts/jobs-maintain.mjs';

const readJson = async path => JSON.parse(await fs.readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));

// The live files the routines edit. A failure names the record and field; fix the data, not the test.
test('csconfs/data/conferences.json passes the data checks', async () => {
  assert.deepEqual(conferenceProblems(await readJson('csconfs/data/conferences.json')), []);
});

test('public/grants.json passes the data checks', async () => {
  assert.deepEqual(grantProblems(await readJson('public/grants.json')), []);
});

test('scripts/data/jobs-sources.json passes the data checks', async () => {
  assert.deepEqual(sourceProblems(await readJson('scripts/data/jobs-sources.json')), []);
});

test('public/manual_affiliations.csv passes the data checks', async () => {
  assert.deepEqual(manualAffiliationProblems(await fs.readFile(new URL('../../public/manual_affiliations.csv', import.meta.url), 'utf8')), []);
});

const conf = overrides => ({
  name: 'PLDI', venueKeys: ['pldi'], year: 2027, description: 'PL', link: 'https://pldi27.sigplan.org/', seriesLink: null,
  date: 'June 2027', place: 'Atlanta', abstractDeadline: null, deadline: '2026-11-12', rebuttalDate: '2027-02-16–2027-02-19',
  notificationDate: '2027-03-04', note: null, programChair: null, acceptanceRate: 22.5, submissions: 500, estimated: false,
  verified: true, generalChair: null, ...overrides,
});

test('conference checks reject impossible dates, bad ranges, stray whitespace, typos, and duplicates', () => {
  assert.deepEqual(conferenceProblems([conf()]), []);
  assert.deepEqual(conferenceProblems([conf({ notificationDate: '2024-06-31' })]), ['PLDI 2027: notificationDate (YYYY-MM-DD)']);
  assert.match(conferenceProblems([conf({ rebuttalDate: '2027-02-16 to 2027-02-19' })])[0], /rebuttalDate/);
  assert.deepEqual(conferenceProblems([conf({ generalChair: 'A,  B' })]), ['PLDI 2027: generalChair has stray whitespace']);
  assert.deepEqual(conferenceProblems([conf({ deadlne: '2026-11-12' })]), ['PLDI 2027: unknown field deadlne']);
  assert.deepEqual(conferenceProblems([conf(), conf()]), ['PLDI 2027: duplicate name + year + note']);
  assert.match(conferenceProblems([conf({ acceptanceRate: 0.22 * 1000 })])[0], /acceptanceRate/);
});

const grant = overrides => ({
  id: 'g', name: 'Grant', shortName: 'G', sponsor: 'NSF', sponsorCategory: 'Government', targetAudience: ['Faculty'],
  whoFor: 'Faculty', deadline: 'Annual (July)', deadlineMonth: 7, amount: '$1', summary: 'S', eligibility: ['US'],
  topics: ['AI'], url: 'https://example.org/g', featured: false, ...overrides,
});

test('grant checks enforce enums, https, deadline month, status, and lastVerifiedAt', () => {
  assert.deepEqual(grantProblems([grant(), grant({ id: 'h', lastVerifiedAt: '2026-10-30', status: 'historical' })]), []);
  assert.match(grantProblems([grant({ sponsorCategory: 'Govt' })])[0], /sponsorCategory/);
  assert.match(grantProblems([grant({ targetAudience: ['Faculty', 'PhD'] })])[0], /targetAudience/);
  assert.match(grantProblems([grant({ url: 'http://example.org' })])[0], /url/);
  assert.match(grantProblems([grant({ deadlineMonth: 13 })])[0], /deadlineMonth/);
  assert.match(grantProblems([grant({ status: 'closed' })])[0], /status/);
  assert.match(grantProblems([grant({ lastVerifiedAt: '10/30/2026' })])[0], /lastVerifiedAt/);
  assert.deepEqual(grantProblems([grant(), grant()]), ['g: duplicate id']);
});

const source = overrides => ({
  school: 'Example U', homepage: 'https://cs.example.edu/', facultyCount: 3, jobsUrl: null, state: 'VA',
  lastCheckedAt: '2026-10-30T12:00:00Z', outcome: 'complete', summary: null, checkedUrls: [], deferredUntil: null,
  relatedUnits: [], relatedCheckedAt: null, country: 'US', region: 'northamerica', ...overrides,
});

test('jobs-sources checks enforce the documented outcomes, dates, and unique schools', () => {
  assert.deepEqual(sourceProblems([source(), source({ school: 'Other U', outcome: null, lastCheckedAt: '2026-10-30' })]), []);
  assert.match(sourceProblems([source({ outcome: 'leads_found' })])[0], /outcome/);
  assert.match(sourceProblems([source({ lastCheckedAt: 'yesterday' })])[0], /lastCheckedAt/);
  assert.deepEqual(sourceProblems([source(), source()]), ['Example U: duplicate school']);
  assert.equal(homepageKey('https://www.binghamton.edu/computer-science/'), homepageKey('http://binghamton.edu/computer-science'));
});

test('manual affiliation checks require the header and allow a blank end for a current position', () => {
  const header = '# comment\nname,school,start,end\n';
  assert.deepEqual(manualAffiliationProblems(`${header}"A","B U",2020,\n"A","C U",2015,2019\n`), []);
  assert.match(manualAffiliationProblems(`${header}"A","B U",2020,2019\n`)[0], /end before start/);
  assert.match(manualAffiliationProblems('author_name,start_year,end_year,institution_name\n')[0], /header/);
});

test('warnings flag likely wrong-school links, duplicate postings, out-of-order dates, and stale grants', () => {
  const now = new Date('2026-10-30T00:00:00Z');
  const warnings = dataWarnings({
    now,
    conferences: [conf({ notificationDate: '2026-10-01' })],
    grants: [grant({ deadline: 'August 11, 2023' }), grant({ id: 'n', summary: 'The award is not currently being offered.' })],
    sources: [
      source({ school: 'HUST', homepage: 'http://english.cs.hust.edu.cn/', jobsUrl: 'https://hust.edu.vn/jobs', country: 'CN' }),
      source({ school: 'FAU', homepage: 'https://cs.fau.de', jobsUrl: 'https://www.fau.eu/jobs/', country: 'DE' }),
      source({ school: 'Copy U', homepage: 'https://cs.example.edu' }),
      source(),
    ],
    jobs: [
      { id: 'a', school: 'X', department: 'CS', title: 'Assistant Professor', track: 'tenure-track', level: 'assistant', deadline: null },
      { id: 'b', school: 'X', department: 'CS', title: 'Assistant Professor', track: 'tenure-track', level: 'assistant', deadline: null },
      { id: 'c', school: 'X', department: 'CS', title: 'Assistant Professor', track: 'tenure-track', level: 'associate', deadline: null },
    ],
  });
  const has = pattern => assert.ok(warnings.some(line => pattern.test(line)), `${pattern} in\n${warnings.join('\n')}`);
  has(/PLDI 2027: notificationDate 2026-10-01 is before rebuttalDate/);
  has(/grants.json g: newest date in deadline is 2023/);
  has(/grants.json n: text says the program is not offered/);
  has(/HUST: jobsUrl is on \.vn/);
  has(/Example U: same homepage as Copy U/);
  has(/jobs.json a \/ b:/);
  assert.ok(!warnings.some(line => /FAU/.test(line) || /\/ c:/.test(line)), warnings.join('\n'));
});
