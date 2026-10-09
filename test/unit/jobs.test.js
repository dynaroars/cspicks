import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  deadlineLabel, filterJobs, groupBySchool, isActive, jobsSuggestions, parseJobs, stateCounts
} from '../../src/jobs/jobs-data.js';
import { renderJobCard, renderSchoolCard, renderStateMap } from '../../src/jobs/jobs-render.js';
import { exportFileName, jobsToMarkdown, restoreStarredIds } from '../../src/jobs/jobs-export.js';
import { STATE_TILE_ROWS, US_STATES, resolveState } from '../../src/jobs/states.js';
import { buildQueue, recheckDays } from '../../scripts/jobs-maintain.mjs';

const NOW = Date.UTC(2026, 10, 1, 12); // Nov 1, 2026
const job = (overrides = {}) => ({
  id: 'gt-ai-2026', school: 'Georgia Institute of Technology', department: 'School of Computer Science',
  title: 'Assistant Professor, AI', track: 'tenure-track', level: 'assistant', areas: ['ai'], state: 'GA', city: 'Atlanta',
  deadline: '2026-12-15', lastSeenAt: '2026-10-20', url: 'https://example.edu/jobs/1', source: 'crawl', ...overrides
});
const jobs = [
  job(),
  job({ id: 'ut-sec', school: 'University of Texas at Austin', title: 'Teaching Professor', track: 'teaching', level: null, areas: ['sec'], state: 'TX', city: 'Austin', deadline: '2026-11-03' }),
  job({ id: 'ucsd-roll', school: 'Univ. of California - San Diego', title: 'Postdoc', track: 'postdoc', level: null, areas: [], state: 'CA', city: 'La Jolla', deadline: null, rolling: true, lastSeenAt: '2026-10-01' }),
  job({ id: 'old-passed', school: 'Cornell University', title: 'Assistant Professor', state: 'NY', deadline: '2026-09-01', lastSeenAt: '2026-08-20' }),
  job({ id: 'stale-nodeadline', school: 'Rice University', title: 'Lecturer', track: 'teaching', state: 'TX', deadline: null, lastSeenAt: '2026-05-01' }),
  job({ id: 'closed-flag', school: 'Brown University', state: 'RI', deadline: '2027-01-15', closedAt: '2026-10-25' })
];
const ids = list => list.map(entry => entry.id);

test('active status: deadline, rolling confirmation window, and closedAt', () => {
  assert.equal(isActive(jobs[0], NOW), true);
  assert.equal(isActive(jobs[1], NOW), true, 'deadline day itself is still open (AoE)');
  assert.equal(isActive(jobs[1], Date.UTC(2026, 10, 4, 12)), false);
  assert.equal(isActive(jobs[2], NOW), true, 'rolling and seen within 90 days');
  assert.equal(isActive(jobs[3], NOW), false, 'deadline passed');
  assert.equal(isActive(jobs[4], NOW), false, 'no deadline and not confirmed for 90+ days');
  assert.equal(isActive(jobs[5], NOW), false, 'explicitly closed');
});

test('defaults to active postings; status filter and keyword reach older ones', () => {
  assert.deepEqual(ids(filterJobs(jobs, { now: NOW })), ['ut-sec', 'gt-ai-2026', 'ucsd-roll']);
  assert.deepEqual(ids(filterJobs(jobs, { status: 'closed', now: NOW, sortBy: 'school' })), ['closed-flag', 'old-passed', 'stale-nodeadline']);
  assert.equal(filterJobs(jobs, { status: 'all', now: NOW }).length, jobs.length);
  assert.equal(filterJobs(jobs, { query: 'status: closed', now: NOW }).length, 3);
});

test('filters by track, area, state, rank, and free text', () => {
  assert.deepEqual(ids(filterJobs(jobs, { track: 'teaching', now: NOW })), ['ut-sec']);
  assert.deepEqual(ids(filterJobs(jobs, { area: 'sec', now: NOW })), ['ut-sec']);
  // A posting that says it is open to all areas matches any area; one naming none matches none.
  const open = job({ id: 'open-any', areas: [], anyArea: true });
  assert.deepEqual(ids(filterJobs([...jobs, open], { area: 'sec', now: NOW })).sort(), ['open-any', 'ut-sec']);
  assert.deepEqual(ids(filterJobs([open], { query: 'area: robotics', now: NOW })), ['open-any']);
  assert.match(renderJobCard(open, () => undefined, () => false, NOW), /All areas/);
  assert.ok(!/All areas|Any area/.test(renderJobCard(job({ areas: [] }), () => undefined, () => false, NOW)));
  assert.deepEqual(ids(filterJobs(jobs, { state: 'GA', now: NOW })), ['gt-ai-2026']);
  assert.deepEqual(ids(filterJobs(jobs, { level: 'assistant', now: NOW })), ['gt-ai-2026']);
  assert.deepEqual(ids(filterJobs(jobs, { query: 'atlanta', now: NOW })), ['gt-ai-2026']);
  assert.deepEqual(ids(filterJobs(jobs, { query: 'loc: texas', now: NOW })), ['ut-sec']);
  assert.deepEqual(ids(filterJobs(jobs, { query: 'loc: ca', now: NOW })), ['ucsd-roll']);
  assert.deepEqual(ids(filterJobs(jobs, { query: 'school: "san diego" track: postdoc', now: NOW })), ['ucsd-roll']);
  assert.deepEqual(ids(filterJobs(jobs, { query: 'artificial', now: NOW })), []);
  assert.deepEqual(ids(filterJobs(jobs, { query: 'ai', now: NOW })), ['gt-ai-2026']);
});

test('sorts by soonest deadline with rolling last, by recency, and by school', () => {
  assert.deepEqual(ids(filterJobs(jobs, { now: NOW })), ['ut-sec', 'gt-ai-2026', 'ucsd-roll']);
  assert.deepEqual(ids(filterJobs(jobs, { sortBy: 'school', now: NOW })), ['gt-ai-2026', 'ucsd-roll', 'ut-sec']);
  const recent = filterJobs([job({ id: 'a', postedDate: '2026-09-01' }), job({ id: 'b', postedDate: '2026-10-15' })], { sortBy: 'posted', now: NOW });
  assert.deepEqual(ids(recent), ['b', 'a']);
  // Closed postings come after active ones in "all" view, most recently closed first.
  assert.deepEqual(ids(filterJobs(jobs, { status: 'all', now: NOW })).slice(0, 3), ['ut-sec', 'gt-ai-2026', 'ucsd-roll']);
});

test('filters take several values: any value within a filter, every filter at once', () => {
  assert.deepEqual(ids(filterJobs(jobs, { track: ['teaching', 'postdoc'], now: NOW })), ['ut-sec', 'ucsd-roll']);
  assert.deepEqual(ids(filterJobs(jobs, { state: ['GA', 'CA'], now: NOW })), ['gt-ai-2026', 'ucsd-roll']);
  assert.deepEqual(ids(filterJobs(jobs, { track: ['teaching', 'postdoc'], state: ['CA'], now: NOW })), ['ucsd-roll']);
  assert.deepEqual(ids(filterJobs(jobs, { area: ['ai', 'sec'], now: NOW })), ['ut-sec', 'gt-ai-2026']);
  assert.deepEqual(ids(filterJobs(jobs, { level: ['assistant', 'full'], now: NOW })), ['gt-ai-2026']);
  assert.deepEqual(ids(filterJobs(jobs, { dept: ['cs', 'ece'], now: NOW })), ['ut-sec', 'gt-ai-2026', 'ucsd-roll']);
  assert.equal(filterJobs(jobs, { track: [], state: 'all', now: NOW }).length, 3, 'an empty list or "all" means no constraint');
  const map = renderStateMap(STATE_TILE_ROWS, { GA: 3, CA: 1 }, ['GA', 'CA']);
  assert.equal((map.match(/aria-pressed="true"/g) || []).length, 2);
});

test('rank sorts order schools by CSRankings rank, unranked schools last both ways', () => {
  const rank = { 'Georgia Institute of Technology': 7, 'University of Texas at Austin': 9 };
  const rankOf = school => rank[school];
  assert.deepEqual(ids(filterJobs(jobs, { sortBy: 'rank', rankOf, now: NOW })), ['gt-ai-2026', 'ut-sec', 'ucsd-roll']);
  assert.deepEqual(ids(filterJobs(jobs, { sortBy: 'rank-desc', rankOf, now: NOW })), ['ut-sec', 'gt-ai-2026', 'ucsd-roll']);
  // A school's own postings go by soonest deadline; without ranks loaded, schools stay grouped by name.
  const gt = [job({ id: 'gt-late', deadline: '2027-01-30' }), job({ id: 'gt-soon', deadline: '2026-11-20' })];
  assert.deepEqual(ids(filterJobs(gt, { sortBy: 'rank', rankOf, now: NOW })), ['gt-soon', 'gt-late']);
  assert.deepEqual(ids(filterJobs(jobs, { sortBy: 'rank', now: NOW })), ['gt-ai-2026', 'ucsd-roll', 'ut-sec']);
});

test('starred postings export to Markdown with ranks, dates, and safe links', () => {
  const ranks = school => school === 'Georgia Institute of Technology' ? { rank: 7, areaRanks: { ai: 3 } } : undefined;
  const md = jobsToMarkdown([
    job({ reviewBegins: '2026-11-15', summary: 'Hiring in\n\nall of AI.' }),
    job({ id: 'bad', school: 'Evil U', title: 'Lecturer\n# injected', url: 'javascript:alert(1)', areas: [], anyArea: true, level: null })
  ], { ranks, now: NOW });
  assert.match(md, /^# Starred US academic CS jobs\n/);
  assert.match(md, /on 2026-11-01 · 2 positions\./);
  assert.match(md, /## 1\. Assistant Professor, AI — Georgia Institute of Technology/);
  assert.match(md, /- \*\*School:\*\* Georgia Institute of Technology \(#7 CSRankings\)/);
  assert.match(md, /- \*\*Research areas:\*\* .+ \(#3 CSRankings\)/);
  assert.match(md, /- \*\*Status:\*\* Dec 15, 2026 · 45 days left/);
  assert.match(md, /- \*\*Review begins:\*\* Nov 15, 2026/);
  assert.match(md, /- \*\*Official posting:\*\* <https:\/\/example\.edu\/jobs\/1>/);
  assert.match(md, /> Hiring in all of AI\./);
  assert.match(md, /## 2\. Lecturer # injected — Evil U/, 'newlines cannot start a new heading');
  assert.match(md, /Research areas:\*\* Open to all areas/);
  assert.ok(!md.includes('javascript:'));
  assert.ok(!md.includes('Start date'), 'empty fields are left out');
  assert.equal(exportFileName(NOW), 'cspicks-starred-jobs-2026-11-01.md');
});

test('restoring an exported file finds its postings by id, then URL, then title and school', () => {
  const md = jobsToMarkdown([jobs[1], jobs[0]], { now: NOW });
  assert.match(md, /- \*\*CS Picks ID:\*\* `ut-sec`/);
  assert.deepEqual(restoreStarredIds(md, jobs), { ids: ['ut-sec', 'gt-ai-2026'], unmatched: 0 });
  // Windows line endings and a repeated section still restore once each.
  assert.deepEqual(restoreStarredIds(`${md}\n${md}`.replace(/\n/g, '\r\n'), jobs).ids, ['ut-sec', 'gt-ai-2026']);

  // Files exported before ids were added: match by posting URL when unique, else by the heading.
  const listed = [job({ id: 'a', url: 'https://example.edu/a' }), job({ id: 'b', title: 'Lecturer', url: 'https://example.edu/shared' }),
    job({ id: 'c', title: 'Postdoc', url: 'https://example.edu/shared' })];
  const legacy = jobsToMarkdown(listed, { now: NOW }).replace(/^- \*\*CS Picks ID:.*\n/gm, '');
  assert.ok(!legacy.includes('CS Picks ID'));
  assert.deepEqual(restoreStarredIds(legacy, listed), { ids: ['a', 'b', 'c'], unmatched: 0 });

  // Postings no longer listed are counted, and unrelated Markdown restores nothing.
  assert.deepEqual(restoreStarredIds(md, [jobs[0]]), { ids: ['gt-ai-2026'], unmatched: 1 });
  assert.deepEqual(restoreStarredIds('# Notes\n\nNothing here.\n', jobs), { ids: [], unmatched: 0 });
});

test('state counts ignore the state filter; school grouping preserves order', () => {
  const counts = stateCounts(filterJobs(jobs, { state: 'GA', now: NOW }, true));
  assert.deepEqual(counts, { TX: 1, GA: 1, CA: 1 });
  const groups = groupBySchool(filterJobs([job(), job({ id: 'gt-2' })], { now: NOW }));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].jobs.length, 2);
});

test('deadline labels', () => {
  assert.match(deadlineLabel(jobs[1], NOW).text, /3 days left/);
  assert.equal(deadlineLabel(jobs[1], NOW).className, 'is-urgent');
  assert.equal(deadlineLabel(jobs[2], NOW).text, 'Rolling review');
  assert.match(deadlineLabel(jobs[3], NOW).text, /^Closed Sep 1, 2026/);
});

test('parser rejects malformed data', () => {
  assert.throws(() => parseJobs({}), /Invalid jobs dataset/);
  assert.throws(() => parseJobs([{ id: 'x' }]), /Invalid jobs dataset/);
  assert.throws(() => parseJobs([job({ state: 'ZZ' })]), /Invalid jobs dataset/);
  assert.throws(() => parseJobs([job({ track: 'janitor' })]), /Invalid jobs dataset/);
  assert.throws(() => parseJobs([job({ deadline: 'Dec 15' })]), /Invalid jobs dataset/);
  assert.equal(parseJobs([job()]).length, 1);
});

test('state tile map places every state exactly once', () => {
  const placed = STATE_TILE_ROWS.flat().filter(cell => cell !== '.');
  assert.equal(new Set(placed).size, placed.length);
  assert.deepEqual([...placed].sort(), Object.keys(US_STATES).sort());
  STATE_TILE_ROWS.forEach(row => assert.equal(row.length, 12));
  assert.equal(resolveState('california'), 'CA');
  assert.equal(resolveState('tx'), 'TX');
  assert.equal(resolveState('atlantis'), null);
});

test('rendering escapes content, links into Search and Simulator, and shows ranks', () => {
  const ranks = school => (school === jobs[0].school ? { rank: 7, areaRanks: { ai: 3 } } : undefined);
  const hostile = job({ title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' });
  const html = renderJobCard(hostile, ranks, () => false, NOW);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('javascript:'));
  assert.match(renderJobCard(jobs[0], ranks, () => false, NOW), /#7 CSRankings/);
  assert.match(renderJobCard(jobs[0], ranks, () => false, NOW), /#3 AI/);
  const school = renderSchoolCard(groupBySchool([jobs[0]])[0], ranks, () => false, NOW);
  assert.match(school, /index\.html\?q=Georgia/);
  assert.match(school, /simulator\.html\?univ=Georgia/);
  const map = renderStateMap(STATE_TILE_ROWS, { GA: 3 }, 'GA');
  assert.equal((map.match(/<button type="button" class="job-map-tile/g) || []).length, 51);
  assert.match(map, /data-state="GA" aria-pressed="true"|aria-pressed="true" aria-label="Georgia: 3 positions"/);
});

test('suggestions list schools, areas, states, and position types', () => {
  const items = jobsSuggestions(jobs);
  assert.ok(items.schools.some(item => item.label === 'Rice University'));
  assert.ok(items.areas.some(item => item.label === 'Security'));
  assert.ok(items.states.some(item => item.label === 'Texas'));
  assert.equal(items.tracks.length, 6);
});

test('crawl queue prioritises never-checked, big schools, and open-posting schools in season', () => {
  const source = (school, facultyCount, extra = {}) => ({ school, facultyCount, lastCheckedAt: null, deferredUntil: null, ...extra });
  const sources = [
    source('Small U', 5),
    source('Big U', 80),
    source('Fresh U', 90, { lastCheckedAt: new Date(NOW - 2 * 86400000).toISOString() }),
    source('Open U', 40, { lastCheckedAt: new Date(NOW - 10 * 86400000).toISOString() }),
    source('Deferred U', 99, { deferredUntil: new Date(NOW + 5 * 86400000).toISOString() })
  ];
  const queue = buildQueue(sources, [{ school: 'Open U' }], NOW).map(item => item.source.school);
  assert.deepEqual(queue, ['Big U', 'Small U', 'Open U']);
  assert.ok(recheckDays(NOW, true) < recheckDays(NOW, false));
  // Unfinished crawls come due before fully read schools.
  const day = 86400000;
  const unfinished = buildQueue([
    { school: 'Done U', facultyCount: 50, outcome: 'complete', lastCheckedAt: new Date(NOW - 4 * day).toISOString(), deferredUntil: null },
    { school: 'Partial U', facultyCount: 5, outcome: 'incomplete', lastCheckedAt: new Date(NOW - 4 * day).toISOString(), deferredUntil: null },
    { school: 'Lost U', facultyCount: 5, outcome: 'not_found', lastCheckedAt: new Date(NOW - 4 * day).toISOString(), deferredUntil: null }
  ], [], NOW).map(item => item.source.school);
  assert.deepEqual(unfinished, ['Partial U']);
  assert.ok(recheckDays(Date.UTC(2026, 5, 1), false) > recheckDays(NOW, false));
});

test('shipped jobs dataset is valid, unique, and uses CSRankings school names', async () => {
  const data = parseJobs(JSON.parse(await fs.readFile(new URL('../../public/jobs.json', import.meta.url), 'utf8')));
  const sources = JSON.parse(await fs.readFile(new URL('../../scripts/data/jobs-sources.json', import.meta.url), 'utf8'));
  const schools = new Set(sources.map(source => source.school));
  assert.ok(sources.length >= 150, 'sources are seeded from CSRankings');
  assert.equal(new Set(data.map(entry => entry.id)).size, data.length, 'ids are unique');
  assert.equal(new Set(data.map(entry => entry.url)).size, data.length, 'one record per posting URL');
  data.forEach(entry => {
    assert.ok(schools.has(entry.school), `${entry.id}: "${entry.school}" is not a CSRankings school in jobs-sources.json`);
    assert.match(entry.url, /^https:\/\//);
    entry.areas.forEach(area => assert.ok(area, `${entry.id}: empty area`));
  });
});

test('render step keeps hiring links and drops student-career boilerplate', async () => {
  const { pickHiringLinks, condenseText } = await import('../../scripts/jobs-render.mjs');
  const links = pickHiringLinks([
    ['Faculty Positions', 'https://cs.example.edu/positions'],
    ['Faculty Positions', 'https://cs.example.edu/positions'],
    ['Career Services', 'https://cs.example.edu/career'],
    ['Assistant Professor, Security', 'https://apply.interfolio.com/1'],
    ['Employment', 'mailto:hr@example.edu'],
    ['News: we are hiring a dean', 'https://cs.example.edu/news/1'],
    ['Equal Employment Opportunity', 'https://example.edu/eeo']
  ]);
  assert.deepEqual(links.map(([text]) => text), ['Faculty Positions', 'Assistant Professor, Security']);
  assert.equal(condenseText('a\n\n\n\nb   \nc', 100), 'a\n\nb\nc');
  assert.equal(condenseText('x'.repeat(50), 10).length, 10);
});

test('departmentKind classifies units that hire CS PhDs', async () => {
  const { departmentKind, filterJobs } = await import('../../src/jobs/jobs-data.ts');
  assert.equal(departmentKind('College of Information Sciences and Technology'), 'information');
  assert.equal(departmentKind('Electrical and Computer Engineering'), 'ece');
  assert.equal(departmentKind('Electrical Engineering and Computer Science'), 'ece');
  assert.equal(departmentKind('School of Computing and Information'), 'cs');
  assert.equal(departmentKind('Department of Computer Science'), 'cs');
  assert.equal(departmentKind('Data Science Institute'), 'data');
  assert.equal(departmentKind('Ira A. Fulton Schools of Engineering'), 'other');
  const base = { track: 'tenure-track', level: 'open', areas: [], state: 'PA', url: 'https://x.edu', summary: '', source: 'crawl', lastSeenAt: new Date().toISOString().slice(0, 10) };
  const jobs = [{ ...base, id: 'a', school: 'A', title: 'T', department: 'College of Information Sciences and Technology' },
    { ...base, id: 'b', school: 'B', title: 'T', department: 'Department of Statistics' }];
  assert.deepEqual(filterJobs(jobs, { dept: 'information' }).map(j => j.id), ['a']);
  assert.deepEqual(filterJobs(jobs, { query: 'dept: data' }).map(j => j.id), ['b']);
});
