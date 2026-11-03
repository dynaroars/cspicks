import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar } from '../../src/calendar.js';
import { filterGrants, grantCalendarEvents, grantDeadlinePresentation, GRANTS_KEYWORD_SPECS, grantStages, nextGrantDeadline } from '../../src/grants/grants-data.js';
import { grantsExportFileName, grantsToMarkdown, renderGrantCard, renderSponsorGroup } from '../../src/grants/grants-render.js';
import { daysUntilDeadline, filterJobs, jobCalendarEvents } from '../../src/jobs/jobs-data.js';
import { jobsToMarkdown, renderJobCard } from '../../src/jobs/jobs-render.js';
import { createProgressStore, filterByProgress, progressMatches } from '../../src/progress.js';
import { isRecentlyAdded, opportunityFreshness, opportunityStages } from '../../src/opportunity-card.js';
import { grantProblems, dataWarnings } from '../../scripts/data-checks.mjs';
import { atomFeed, newestEntries } from '../../scripts/build-feeds.mjs';
import { classify, pageText, site } from '../../scripts/check-links.mjs';

const NOW = new Date('2026-11-02T12:00:00Z');

function grant(overrides = {}) {
  return {
    id: 'g', name: 'Grant', shortName: 'G', sponsor: 'NSF', sponsorCategory: 'Government', targetAudience: ['Faculty'],
    whoFor: 'Faculty', deadline: 'Rolling', deadlineMonth: 0, amount: '$1', summary: 'S', eligibility: ['x'], topics: ['AI/ML'],
    url: 'https://example.org/g', ...overrides
  };
}

function job(overrides = {}) {
  return {
    id: 'j', school: 'Example U', department: 'Computer Science', title: 'Assistant Professor', track: 'tenure-track',
    areas: ['ai'], state: 'VA', url: 'https://example.edu/j', lastSeenAt: '2026-10-30', source: 'crawl', ...overrides
  };
}

test('calendar export writes all-day events with escaped text and reminders', () => {
  const ics = buildCalendar([{ uid: 'a', date: '2026-12-04', title: 'AFOSR YIP: Full proposal, FY27; final', description: 'line1\nline2', url: 'https://x.org' }], { now: NOW.getTime() });
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261204\r\nDTEND;VALUE=DATE:20261205/);
  assert.match(ics, /SUMMARY:AFOSR YIP: Full proposal\\, FY27\\; final/);
  assert.match(ics, /DESCRIPTION:line1\\nline2/);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.ok(ics.split('\r\n').every(line => line.length <= 75), 'lines are folded');
  assert.doesNotMatch(buildCalendar([{ uid: 'b', date: 'not a date', title: 'x' }]), /VEVENT/);
});

test('grant stages highlight the next stage and project a passed annual cycle forward', () => {
  const afosr = grant({
    deadline: 'Required white paper: October 9, 2026; Full proposal: December 4, 2026 (Annual)', deadlineMonth: 10,
    deadlines: [{ stage: 'White paper', date: '2026-10-09', required: true }, { stage: 'Full proposal', date: '2026-12-04' }]
  });
  const view = grantStages(afosr, NOW);
  assert.deepEqual(view.stages.map(stage => stage.state), ['passed', 'next']);
  assert.equal(view.estimated, false);
  assert.deepEqual(nextGrantDeadline(afosr, NOW), { date: '2026-12-04', stage: 'Full proposal', estimated: false, approximate: false, passed: false });

  const doe = grant({
    deadline: 'Pre-application: March 24, 2026; Full Proposal: June 2, 2026 (Annual)', deadlineMonth: 4,
    deadlines: [{ stage: 'Pre-application', date: '2026-03-24' }, { stage: 'Full proposal', date: '2026-06-02' }]
  });
  const projected = grantStages(doe, NOW);
  assert.equal(projected.estimated, true);
  assert.deepEqual(projected.stages.map(stage => stage.date), ['2027-03-24', '2027-06-02']);
  assert.equal(projected.stages[0].state, 'next');
  assert.equal(grantCalendarEvents(doe, NOW)[0].title, '(Estimated) G: Pre-application');

  // The passed white paper must not push the whole text a year ahead while the full proposal is still open.
  assert.deepEqual(grantDeadlinePresentation(afosr, NOW), { text: afosr.deadline, estimated: false });

  const html = opportunityStages(view.stages);
  assert.match(html, /is-passed/);
  assert.match(html, /is-next/);
  assert.match(html, /required/);
});

test('soonest-deadline sort uses real dates, then month-only cycles, then rolling, then historical', () => {
  const grants = [
    grant({ id: 'rolling', name: 'A rolling' }),
    grant({ id: 'historical', name: 'B historical', status: 'historical', deadline: 'January 5, 2027', deadlineMonth: 1 }),
    grant({ id: 'month-only', name: 'C month', deadline: 'Annual (mid-December)', deadlineMonth: 12 }),
    grant({ id: 'exact-later', name: 'D later', deadline: 'November 20, 2026', deadlineMonth: 11 }),
    grant({ id: 'exact-soon', name: 'E soon', deadline: 'November 5, 2026', deadlineMonth: 11 }),
    grant({ id: 'staged', name: 'F staged', deadline: 'Executive summary: November 3, 2026; full proposal: January 13, 2027', deadlineMonth: 11,
      deadlines: [{ stage: 'Executive summary', date: '2026-11-03' }, { stage: 'Full proposal', date: '2027-01-13' }] })
  ];
  assert.deepEqual(filterGrants(grants, { sortBy: 'deadline', now: NOW }).map(item => item.id),
    ['staged', 'exact-soon', 'exact-later', 'month-only', 'rolling', 'historical']);
  assert.deepEqual(filterGrants(grants, { query: 'deadline: week', now: NOW }).map(item => item.id).sort(), ['exact-soon', 'staged']);
  assert.deepEqual(filterGrants(grants, { query: 'deadline: soon', sortBy: 'deadline', now: NOW }).map(item => item.id), ['staged', 'exact-soon', 'exact-later']);
});

test('citizenship and added keywords filter grants', () => {
  const grants = [
    grant({ id: 'us', citizenship: 'us-citizen', addedAt: '2026-08-26' }),
    grant({ id: 'pr', citizenship: 'us-citizen-or-pr', addedAt: '2026-10-30' }),
    grant({ id: 'open', citizenship: 'open', addedAt: '2026-10-01' }),
    grant({ id: 'unknown', addedAt: '2026-11-02' })
  ];
  const ids = query => filterGrants(grants, { query, sortBy: 'name', now: NOW }).map(item => item.id).sort();
  assert.deepEqual(ids('citizenship: international'), ['open', 'unknown']);
  assert.deepEqual(ids('citizenship: open'), ['open']);
  assert.deepEqual(ids('citizenship: pr'), ['open', 'pr', 'unknown']);
  assert.deepEqual(ids('added: week'), ['pr', 'unknown']);
  assert.deepEqual(ids('added: 40'), ['open', 'pr', 'unknown']);
  assert.deepEqual(filterGrants(grants, { sortBy: 'added', now: NOW }).map(item => item.id), ['unknown', 'pr', 'open', 'us']);
});

test('jobs: deadline and added keywords, added sort, and calendar events', () => {
  const now = NOW.getTime();
  const jobs = [
    job({ id: 'soon', deadline: '2026-11-06', reviewBegins: '2026-11-04', addedAt: '2026-11-01' }),
    job({ id: 'later', deadline: '2026-12-20', addedAt: '2026-10-08' }),
    job({ id: 'rolling', rolling: true, addedAt: '2026-10-20' }),
    job({ id: 'none', addedAt: '2026-10-13' })
  ];
  const ids = query => filterJobs(jobs, { query, now }).map(item => item.id).sort();
  assert.deepEqual(ids('deadline: week'), ['soon']);
  assert.deepEqual(ids('deadline: soon'), ['soon']);
  assert.deepEqual(ids('deadline: rolling'), ['rolling']);
  assert.deepEqual(ids('deadline: none'), ['none', 'rolling']);
  assert.deepEqual(ids('added: week'), ['soon']);
  assert.deepEqual(filterJobs(jobs, { sortBy: 'added', now }).map(item => item.id), ['soon', 'rolling', 'none', 'later']);
  assert.equal(daysUntilDeadline(jobs[0], now), 5);
  const events = jobCalendarEvents(jobs[0], now);
  assert.deepEqual(events.map(event => event.date), ['2026-11-04', '2026-11-06']);
  assert.match(events[1].title, /^Deadline: Assistant Professor \(Example U\)/);
  assert.deepEqual(jobCalendarEvents(job({ deadline: '2026-10-01' }), now), []);
});

test('job cards show New, freshness, faculty links, and the status picker only on starred postings', () => {
  const now = NOW.getTime();
  const fresh = renderJobCard(job({ addedAt: '2026-11-01', deadline: '2026-12-01' }), () => false, now);
  assert.match(fresh, /opportunity-new-badge/);
  assert.match(fresh, /Confirmed live on the official page Oct 30, 2026/);
  assert.doesNotMatch(fresh, /is-stale/);
  assert.match(fresh, /Faculty in Search/);
  assert.doesNotMatch(fresh, /data-progress-id/);
  assert.match(fresh, /data-calendar-job="j"/);

  const stale = renderJobCard(job({ lastSeenAt: '2026-09-15', deadline: '2026-12-01' }), () => true, now, true, () => 'applied');
  assert.match(stale, /is-stale/);
  assert.match(stale, /⚠ Confirmed live on the official page Sep 15, 2026 \(48 days ago\)/);
  assert.match(stale, /<option value="applied" selected>/);
  assert.match(jobsToMarkdown([job()], { now, getProgress: () => 'interviewing' }), /\*\*My application status:\*\* Interviewing/);
});

test('grant cards and sponsor groups share status picker and Markdown export with Jobs', () => {
  const unstarred = renderGrantCard(grant({ addedAt: '2026-11-01', lastVerifiedAt: '2026-10-30', deadline: 'December 1, 2026', deadlineMonth: 12 }), () => false, NOW);
  assert.match(unstarred, /opportunity-new-badge/);
  assert.match(unstarred, /Verified against the official page Oct 30, 2026/);
  assert.doesNotMatch(unstarred, /data-progress-id/);
  assert.match(unstarred, /data-calendar-grant="g"/);

  const starred = renderGrantCard(grant({ id: 'nsf-career', name: 'NSF CAREER', lastVerifiedAt: '2026-05-01' }), () => true, NOW, () => 'preparing');
  assert.match(starred, /is-stale/);
  assert.match(starred, /data-progress-id="nsf-career"/);
  assert.match(starred, /<option value="preparing" selected>/);

  const groupHtml = renderSponsorGroup({ sponsor: 'NSF', category: 'Government', grants: [grant({ id: 'nsf-career' })] }, () => true, NOW, () => 'applied');
  assert.match(groupHtml, /grant-sponsor-group/);
  assert.match(groupHtml, /<option value="applied" selected>/);

  const md = grantsToMarkdown([
    grant({ id: 'nsf-career', name: 'NSF CAREER', citizenship: 'open', lastVerifiedAt: '2026-10-20', summary: 'Early-career\n\naward.' })
  ], { now: NOW, getProgress: () => 'applied' });
  assert.match(md, /^# Starred CS awards & grants\n/);
  assert.match(md, /## 1\. NSF CAREER — NSF/);
  assert.match(md, /- \*\*My application status:\*\* Applied/);
  assert.match(md, /- \*\*Eligibility:\*\* Open to international applicants/);
  assert.match(md, /> Early-career award\./);
  assert.equal(grantsExportFileName(NOW.getTime()), 'cspicks-starred-awards-2026-11-02.md');
});

test('freshness line warns when an award was never re-verified or is stale', () => {
  const now = NOW.getTime();
  assert.match(opportunityFreshness({ checkedLabel: 'Verified', staleAfterDays: 90, addedAt: '2026-08-26', now }), /⚠ Not re-verified since it was added Aug 26, 2026/);
  assert.match(opportunityFreshness({ checkedAt: '2026-10-31', checkedLabel: 'Verified', staleAfterDays: 90, now }), /✓ Verified Oct 31, 2026 \(2 days ago\)/);
  assert.match(opportunityFreshness({ checkedAt: '2026-06-01', checkedLabel: 'Verified', staleAfterDays: 90, now }), /is-stale/);
  assert.equal(isRecentlyAdded('2026-10-26', now), true);
  assert.equal(isRecentlyAdded('2026-10-25', now), false);
});

test('application progress store keeps one known status per posting', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    const store = createProgressStore('test-progress');
    store.set('a', 'applied');
    store.set('b', 'bogus');
    assert.deepEqual(store.all(), { a: 'applied' });
    const items = [grant({ id: 'a' }), grant({ id: 'b' })];
    assert.deepEqual(filterByProgress(items, 'progress: applied', GRANTS_KEYWORD_SPECS, item => item.id, store).map(item => item.id), ['a']);
    assert.deepEqual(filterByProgress(items, 'progress: none', GRANTS_KEYWORD_SPECS, item => item.id, store).map(item => item.id), ['b']);
    store.set('a', '');
    assert.deepEqual(store.all(), {});
  } finally {
    delete globalThis.localStorage;
  }
  assert.equal(progressMatches('applied', 'any'), true);
  assert.equal(progressMatches(undefined, 'none'), true);
  assert.equal(progressMatches('declined', 'rejected'), true);
  assert.equal(progressMatches('offer', 'applied'), false);
});

test('grant checks validate structured stages, addedAt, and citizenship', () => {
  const base = grant({ addedAt: '2026-11-02' });
  assert.deepEqual(grantProblems([{ ...base, citizenship: 'open', deadlines: [{ stage: 'LOI', date: '2026-12-15', required: true }] }]), []);
  const problems = grantProblems([{ ...base, id: 'bad', addedAt: '11/02/2026', citizenship: 'maybe',
    deadlines: [{ stage: 'Full', date: '2027-01-26' }, { stage: '', date: '2026-12-15', extra: 1 }] }]);
  for (const expected of ['bad: addedAt (YYYY-MM-DD)', 'bad: deadlines[1]: unknown field extra', 'bad: deadlines[1].stage', 'bad: deadlines[1]: dates must be earliest first']) {
    assert.ok(problems.includes(expected), `${expected} in ${problems.join('; ')}`);
  }
  assert.ok(problems.some(problem => problem.startsWith('bad: citizenship')));
  const warnings = dataWarnings({ grants: [grant({ id: 'staged', deadline: 'Letter of intent: December 15, 2026; Full proposal: January 26, 2027' })], jobs: [job()], now: NOW });
  assert.ok(warnings.some(line => line.includes('staged: no addedAt')));
  assert.ok(warnings.some(line => line.includes('staged: deadline text names a multi-stage call')));
  assert.ok(warnings.some(line => line.includes('jobs.json j: no addedAt')));
});

test('feeds list the newest additions first and escape XML', () => {
  const entries = newestEntries([{ id: 'b', addedAt: '2026-10-01' }, { id: 'a', addedAt: '2026-11-01' }, { id: 'c' }]);
  assert.deepEqual(entries.map(entry => entry.id), ['a', 'b']);
  const xml = atomFeed({ title: 'T & U', subtitle: 's', page: 'https://x.org', feedUrl: 'https://x.org/f.xml',
    entries: [{ addedAt: '2026-11-01', title: '<AI> & ML', link: 'https://x.org/?a=1&b=2', official: 'https://y.org', summary: 's' }] });
  assert.match(xml, /<title>T &amp; U<\/title>/);
  assert.match(xml, /<title>&lt;AI&gt; &amp; ML<\/title>/);
  assert.match(xml, /<updated>2026-11-01T00:00:00Z<\/updated>/);
});

test('link check classifies broken, blocked, moved, and same-site redirects', () => {
  assert.equal(classify({ status: 404 }), 'broken');
  assert.equal(classify({ error: 'ENOTFOUND' }), 'broken');
  assert.equal(classify({ status: 403 }), 'blocked');
  assert.equal(classify({ status: 200, from: 'https://a.edu/jobs', to: 'https://b.com/jobs' }), 'moved');
  assert.equal(classify({ status: 200, from: 'https://new.nsf.gov/x', to: 'https://www.nsf.gov/y' }), 'redirected');
  assert.equal(classify({ status: 200, from: 'https://www.a.edu/x', to: 'https://a.edu/x/' }), 'ok');
  assert.equal(site('https://www.cs.ox.ac.uk/jobs'), 'ox.ac.uk');
  assert.equal(pageText('<p>Hi <script>var t=1</script><b>there</b></p>'), 'Hi there');
});
