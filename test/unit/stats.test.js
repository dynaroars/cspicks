import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  conferenceCompleteness, countFromLink, crawlCompleteness, grantCompleteness, growthSeries, jobCompleteness, renderCommits, renderCompleteness, renderGrowth,
  renderInventory, renderRecentUpdates, renderStatGrid, rosterCompleteness, STANDALONE_PAGES, summarizeConferences, summarizeGrants, summarizeJobs, summarizeRoster
} from '../../src/stats.ts';
import { crawlFreshness, datasetMetrics } from '../../scripts/build-stats-history.mjs';

const NOW = Date.UTC(2026, 9, 11);

test('roster stats count active faculty, universities, US universities, and countries', () => {
  const professors = {
    a: { name: 'a', pubs: [{}] }, b: { name: 'b', pubs: [{}] }, idle: { name: 'idle', pubs: [] }
  };
  const schools = { x: { name: 'x', country: 'us' }, y: { name: 'y', country: 'us' }, z: { name: 'z', country: 'uk' } };
  const [faculty, universities, countries] = summarizeRoster({ professors, schools });
  assert.equal(faculty.value, '2');
  assert.equal(faculty.note, 'with papers in tracked venues');
  assert.equal(universities.value, '3');
  assert.equal(universities.note, '2 in the US');
  assert.equal(countries.value, '2');
});

test('conference stats count series, editions across cycles, and deadlines not yet passed', () => {
  const confs = [
    { name: 'PLDI', year: 2027, verified: true, deadline: '2026-11-08' },
    { name: 'PLDI', year: 2027, verified: true, deadline: '2027-01-08' },
    { name: 'ICSE', year: 2026, verified: false, deadline: '2025-08-01' },
    { name: 'ICSE', year: 2027, verified: false, deadline: 'TBD' }
  ];
  const [series, editions, upcoming] = summarizeConferences(confs, NOW);
  assert.equal(series.value, '2');
  assert.equal(editions.value, '3');
  assert.equal(editions.note, '33% verified on official sites');
  assert.equal(upcoming.value, '2');
});

test('grant and job stats split current/historical and active/closed', () => {
  const [awards, sponsors] = summarizeGrants([{ sponsor: 'NSF' }, { sponsor: 'NSF', status: 'historical' }, { sponsor: 'Google' }]);
  assert.equal(awards.note, '2 current, 1 historical');
  assert.equal(sponsors.value, '2');

  const job = extra => ({ school: 'A', state: 'VA', deadline: '2026-12-01', lastSeenAt: '2026-10-01', ...extra });
  const [active, schools] = summarizeJobs([job(), job({ school: 'B', state: 'TX' }), job({ school: 'C', closedAt: '2026-10-05' })], NOW);
  assert.equal(active.value, '2');
  assert.equal(active.note, '3 listed including closed');
  assert.equal(schools.note, 'in 2 states');
});

test('GitHub totals come from the Link header last page', () => {
  assert.equal(countFromLink('<https://api.github.com/x?per_page=1&page=2>; rel="next", <https://api.github.com/x?per_page=1&page=534>; rel="last"', 1), 534);
  assert.equal(countFromLink(null, 7), 7);
});

test('stat and commit rendering escapes text', () => {
  assert.doesNotMatch(renderStatGrid([{ label: '<b>', value: '<i>' }]), /<b>|<i>/);
  const html = renderCommits([{ sha: 'abcdef123', message: '<script>x</script>', author: 'A', date: new Date(NOW - 7200000).toISOString(), url: 'https://github.com/x' }], NOW);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /abcdef1/);
  assert.match(html, /2 hours ago/);
});

test('roster completeness counts only faculty with papers and skips Scholar placeholders', () => {
  const professors = {
    a: { pubs: [{}], homepage: 'https://a.test', scholarid: 'abc', orcid: '0000-0001-2345-6789' },
    b: { pubs: [{}], homepage: '', scholarid: 'NOSCHOLARPAGE', orcid: null },
    idle: { pubs: [], homepage: 'https://idle.test', scholarid: 'xyz', orcid: '0000-0001-2345-6780' }
  };
  const [homepages, scholar, orcid] = rosterCompleteness({ professors, schools: {} });
  assert.deepEqual([homepages.count, homepages.total, scholar.count, orcid.count], [1, 2, 1, 1]);
});

test('conference completeness splits upcoming and past editions by year', () => {
  const confs = [
    { name: 'A', year: 2026, verified: true, deadline: '2026-11-01', estimated: false },
    { name: 'B', year: 2027, verified: false, deadline: '2027-01-10', estimated: true },
    { name: 'C', year: 2025, acceptanceRate: 0.2 },
    { name: 'D', year: 2024, acceptanceRate: null }
  ];
  const [verified, deadlines, rates] = conferenceCompleteness(confs, NOW);
  assert.deepEqual([verified.count, verified.total, deadlines.count, rates.count, rates.total], [1, 2, 1, 1, 2]);
});

test('job and grant completeness use active postings and current awards only', () => {
  const job = extra => ({ school: 'A', state: 'VA', areas: [], deadline: '2026-12-01', lastSeenAt: '2026-10-01', ...extra });
  const jobs = [job({ areas: ['pl'], visaSponsorship: 'yes' }), job({ deadline: null, rolling: true, anyArea: true, visaSponsorship: 'not-stated', lastSeenAt: '2026-08-01' }), job({ closedAt: '2026-10-05', areas: ['ai'] })];
  const [deadlines, areas, visa, confirmed] = jobCompleteness(jobs, NOW);
  assert.deepEqual([deadlines.count, deadlines.total, areas.count, visa.count, confirmed.count], [2, 2, 2, 1, 1]);
  const [amounts] = grantCompleteness([{ amount: '$5,000 prize' }, { amount: 'Not announced' }, { amount: '$1', status: 'historical' }]);
  assert.deepEqual([amounts.count, amounts.total], [1, 2]);
});

test('crawl completeness and freshness come from the jobs-sources record', () => {
  const sources = [
    { jobsUrl: 'https://a.test', lastCheckedAt: '2026-10-09T00:00:00Z' },
    { jobsUrl: 'https://b.test', lastCheckedAt: '2026-08-01T00:00:00Z' },
    { jobsUrl: null, lastCheckedAt: null }
  ];
  const crawl = crawlFreshness(sources, NOW);
  assert.deepEqual(crawl, { schools: 3, withHiringUrl: 2, checked7: 1, checked30: 1, checked90: 2 });
  assert.deepEqual(crawlCompleteness(crawl).map(m => m.count), [2, 2]);
  assert.deepEqual(datasetMetrics({ jobs: null, grants: [{}, { status: 'historical' }], conferences: [{ name: 'A', year: 1 }, { name: 'A', year: 1 }], sources }, NOW),
    { activeJobs: null, grants: 1, conferences: 1, crawledSchools: 2 });
});

test('completeness cards show a one-decimal percentage and escape labels', () => {
  const html = renderCompleteness([{ label: '<b>x</b>', count: 1, total: 3, description: 'd' }]);
  assert.match(html, /33\.3%/);
  assert.match(html, /1 of 3 records/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(renderCompleteness([{ label: 'empty', count: 0, total: 0, description: '' }]), />0%</);
});

test('recent updates badge counts confirmations and is omitted when nothing is recent', () => {
  const html = renderRecentUpdates([{ lastSeenAt: '2026-10-09' }, { lastSeenAt: '2026-09-20' }, { lastSeenAt: '2026-01-01' }], { checked7: 4 }, NOW);
  assert.match(html, /2 job postings<\/strong> confirmed on hiring pages in the past 30 days \(1 this week\)/);
  assert.match(html, /4 schools<\/strong> crawled this week/);
  assert.equal(renderRecentUpdates([{ lastSeenAt: '2026-01-01' }], { checked7: 0 }, NOW), '');
});

test('page inventory adds SEO pages when their counts are known', () => {
  assert.match(renderInventory({ schools: 300, areas: 27 }), new RegExp(`${STANDALONE_PAGES.length + 327} pages`));
  assert.match(renderInventory(null), new RegExp(`${STANDALONE_PAGES.length} pages`));
  assert.doesNotMatch(renderInventory(null), /University pages/);
});

test('growth history starts each metric at its first tracked day and needs two points', () => {
  const history = [
    { date: '2026-01-01', activeJobs: null, grants: 10, conferences: null, crawledSchools: null, codeLines: 100 },
    { date: '2026-02-01', activeJobs: 5, grants: 12, conferences: null, crawledSchools: null, codeLines: 90 },
    { date: '2026-03-01', activeJobs: 8, grants: 15, conferences: null, crawledSchools: null, codeLines: 120 }
  ];
  assert.deepEqual(growthSeries(history, 'activeJobs').map(p => p.value), [5, 8]);
  const html = renderGrowth(history, 'grants');
  assert.match(html, /data-metric="grants" aria-pressed="true"/);
  assert.match(html, /\+50%/);
  assert.match(html, /\+20%/);
  assert.doesNotMatch(html, /data-metric="conferences"/);
  assert.equal(renderGrowth(history.slice(0, 1), 'grants'), '');
});

test('the inventory lists every page vite builds', () => {
  const inputs = [...readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8').matchAll(/'([\w-]+\.html)'/g)].map(match => match[1]);
  assert.deepEqual(STANDALONE_PAGES.map(([href]) => href).sort(), inputs.sort());
});
