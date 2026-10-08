#!/usr/bin/env node
/**
 * Queue and seed tooling for the US Jobs crawl (MAINTENANCE.md §6.5, docs/AUTOMATION.md `jobs`).
 * It does no research and edits no postings: the scheduled agent reads the queue, visits each
 * department's hiring page, and edits public/jobs.json and scripts/data/jobs-sources.json.
 *
 *   npm run maintain:jobs -- --seed              add any US CSRankings school missing from the sources file
 *   npm run maintain:jobs -- --limit 12          print the next schools to crawl (default 12)
 *   npm run maintain:jobs -- --stats             coverage and posting counts
 */
import fs from 'node:fs/promises';
import Papa from 'papaparse';

const SOURCES = new URL('./data/jobs-sources.json', import.meta.url);
const JOBS = new URL('../public/jobs.json', import.meta.url);
const BASE = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages';
const DAY = 86400000;

const readJson = async (url, fallback) => JSON.parse(await fs.readFile(url, 'utf8').catch(() => JSON.stringify(fallback)));
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

async function fetchCsv(path) {
  const response = await fetch(`${BASE}/${path}`);
  if (!response.ok) throw new Error(`${response.status} from ${BASE}/${path}`);
  return Papa.parse(await response.text(), { header: true, skipEmptyLines: true }).data;
}

async function seed() {
  const [institutions, roster] = await Promise.all([fetchCsv('institutions.csv'), fetchCsv('csrankings.csv')]);
  const faculty = new Map();
  roster.forEach(row => faculty.set(row.affiliation, (faculty.get(row.affiliation) || 0) + 1));
  const sources = await readJson(SOURCES, []);
  const known = new Set(sources.map(source => source.school));
  let added = 0;
  for (const row of institutions) {
    if (row.countryabbrv !== 'us' || known.has(row.institution)) continue;
    sources.push({
      school: row.institution,
      homepage: row.homepage || null,
      facultyCount: faculty.get(row.institution) || 0,
      jobsUrl: null,
      state: null,
      lastCheckedAt: null,
      outcome: null,
      summary: null,
      checkedUrls: [],
      deferredUntil: null
    });
    added += 1;
  }
  // Refresh counts for existing rows without touching crawl state.
  sources.forEach(source => { source.facultyCount = faculty.get(source.school) ?? source.facultyCount; });
  sources.sort((a, b) => b.facultyCount - a.facultyCount || a.school.localeCompare(b.school));
  await fs.writeFile(SOURCES, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Seeded ${added} new school(s); ${sources.length} total.`);
}

/** Hiring season: postings appear August to January, so recheck more often then. */
export function recheckDays(now, hasOpenJobs) {
  const month = new Date(now).getUTCMonth() + 1;
  const inSeason = month >= 8 || month <= 2;
  if (hasOpenJobs) return inSeason ? 7 : 14;
  return inSeason ? 21 : 60;
}

/** Schools whose last crawl was unfinished come due much sooner than ones fully read. */
export function intervalFor(source, now, hasOpenJobs) {
  if (source.outcome === 'incomplete') return 1;
  if (source.outcome === 'not_found') return 10;
  if (source.outcome === 'blocked') return 14;
  return recheckDays(now, hasOpenJobs);
}

export function buildQueue(sources, jobs, now = Date.now()) {
  const openSchools = new Set(jobs.filter(job => !job.closedAt).map(job => job.school));
  return sources
    .filter(source => !source.deferredUntil || Date.parse(source.deferredUntil) <= now)
    .map(source => {
      const checked = source.lastCheckedAt ? Date.parse(source.lastCheckedAt) : null;
      const interval = intervalFor(source, now, openSchools.has(source.school));
      const dueInDays = checked === null ? -Infinity : (checked + interval * DAY - now) / DAY;
      return { source, dueInDays, reason: checked === null ? 'never checked' : `checked ${Math.floor((now - checked) / DAY)}d ago, every ${interval}d` };
    })
    .filter(item => item.dueInDays <= 0)
    .sort((a, b) => a.dueInDays - b.dueInDays || b.source.facultyCount - a.source.facultyCount || a.source.school.localeCompare(b.source.school));
}

async function main() {
  if (flag('seed')) return seed();
  const sources = await readJson(SOURCES, []);
  const jobs = await readJson(JOBS, []);
  if (flag('stats')) {
    const checked = sources.filter(source => source.lastCheckedAt).length;
    const withUrl = sources.filter(source => source.jobsUrl).length;
    console.log(`${sources.length} schools: ${checked} checked, ${withUrl} with a known hiring page; ${jobs.length} postings (${jobs.filter(job => !job.closedAt).length} not marked closed).`);
    return;
  }
  const limit = Number(option('limit', '12'));
  const queue = buildQueue(sources, jobs).slice(0, limit);
  if (!queue.length) return console.log('Nothing is due. Run with --seed if the sources file is empty.');
  queue.forEach(({ source, reason }, index) => console.log(
    `${index + 1}. ${source.school}  [${reason}]  hiring page: ${source.jobsUrl || 'unknown'}  dept: ${source.homepage || 'unknown'}`));
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) await main();
