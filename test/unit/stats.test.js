import assert from 'node:assert/strict';
import test from 'node:test';
import { countFromLink, renderCommits, renderStatGrid, renderTraffic, summarizeConferences, summarizeGrants, summarizeJobs, summarizeRoster } from '../../src/stats.ts';

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

test('visitor traffic folds today into the average card and escapes Worker-supplied labels', () => {
  const html = renderTraffic({
    schemaVersion: 3, source: 'cloudflare-rum', generatedAt: '2026-10-13T12:00:00.000Z', timezone: 'UTC', status: 'ok', stale: false,
    measurementStartedAt: '2026-10-12',
    coverage: { firstDate: '2026-10-12', lastCompleteDate: '2026-10-12', completeDays7: 1, availableDays30: 1 },
    today: { date: '2026-10-13', pageViews: 5, visits: 2, complete: false, collected: true },
    last7Complete: { pageViews: 40, visits: 10, days: 1, avgPageViews: 40, avgVisits: 10 },
    last30Available: { pageViews: 40, visits: 10, days: 1 },
    daily: [{ date: '2026-10-12', pageViews: 40, visits: 10, status: 'complete' }, { date: '2026-10-13', pageViews: 5, visits: 2, status: 'partial' }],
    countries: [], categories: [{ key: 'other', label: '<b>Other</b>', pageViews: 40, pct: 100 }], categoryTotal: 40,
    categoryPeriod: { startDate: '2026-10-12', endDate: '2026-10-12', days: 1 },
    historicalTransition: { newSeriesStartedAt: '2026-10-12', oldSeriesRetainedInternally: true }
  });
  assert.match(html, /Average daily page views[\s\S]*1 complete day · 5 today so far/);
  assert.doesNotMatch(html, /Browser page views today/);
  assert.match(html, /Tue, Oct 13, 2026<\/strong> \(In progress\)/);
  assert.match(html, /&lt;b&gt;Other&lt;\/b&gt;/);
});
