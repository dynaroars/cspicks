#!/usr/bin/env node
/**
 * Queue and seed tooling for the CS Jobs crawl (TASKS/jobs.md, docs/AUTOMATION.md `jobs`).
 * It does no research and edits no postings: the scheduled agent reads the queue, visits each
 * department's hiring page, and edits public/jobs.json and scripts/data/jobs-sources.json.
 *
 *   npm run maintain:jobs -- --seed              add any US CSRankings school missing from the sources file
 *   npm run maintain:jobs -- --add "Texas Christian University" --homepage https://cs.tcu.edu/ --state TX
 *                                                add a US school that is not in CSRankings (every US school is in scope)
 *   npm run maintain:jobs -- --limit 12          print the next schools to crawl (default 30)
 *   npm run maintain:jobs -- --related 20       print schools whose non-CS units (IST, ECE, data science) were never checked
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

const emptyRow = (school, homepage, facultyCount, country = 'US', region = 'northamerica') => ({
  school,
  homepage,
  facultyCount,
  country,
  region,
  jobsUrl: null,
  state: null,
  lastCheckedAt: null,
  outcome: null,
  summary: null,
  checkedUrls: [],
  relatedUnits: [],
  relatedCheckedAt: null,
  deferredUntil: null
});

async function seed() {
  const [institutions, roster] = await Promise.all([fetchCsv('institutions.csv'), fetchCsv('csrankings.csv')]);
  const faculty = new Map();
  roster.forEach(row => faculty.set(row.affiliation, (faculty.get(row.affiliation) || 0) + 1));
  const sources = await readJson(SOURCES, []);
  const known = new Map(sources.map(source => [source.school, source]));
  let added = 0;
  for (const row of institutions) {
    const country = (row.countryabbrv || 'us').toUpperCase();
    const region = row.region || 'northamerica';
    if (!known.has(row.institution)) {
      sources.push(emptyRow(row.institution, row.homepage || null, faculty.get(row.institution) || 0, country, region));
      added += 1;
    } else {
      const existing = known.get(row.institution);
      if (!existing.country) existing.country = country;
      if (!existing.region) existing.region = region;
      existing.facultyCount = faculty.get(row.institution) ?? existing.facultyCount;
    }
  }
  sources.forEach(source => {
    if (!source.country) source.country = 'US';
    if (!source.region) source.region = 'northamerica';
  });
  sources.sort((a, b) => {
    const aIsUS = (a.country || 'US') === 'US' ? 1 : 0;
    const bIsUS = (b.country || 'US') === 'US' ? 1 : 0;
    if (aIsUS !== bIsUS) return bIsUS - aIsUS;
    return b.facultyCount - a.facultyCount || a.school.localeCompare(b.school);
  });
  await fs.writeFile(SOURCES, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Seeded ${added} new school(s); ${sources.length} total.`);
}

/** A school CSRankings does not list. It keeps `csrankings: false` so `--seed` never confuses it with a roster school. */
async function addSchool() {
  const school = option('add', '').trim();
  const state = option('state', '').trim().toUpperCase();
  const country = option('country', 'US').trim().toUpperCase();
  if (!school || school.startsWith('--')) throw new Error('Usage: --add "School Name" [--homepage URL] [--state XX] [--country XX]');
  if (country === 'US' && state && !/^[A-Z]{2}$/.test(state)) throw new Error(`--state must be a USPS code, got "${state}"`);
  const sources = await readJson(SOURCES, []);
  if (sources.some(source => source.school.toLowerCase() === school.toLowerCase())) return console.log(`${school} is already in the sources file.`);
  sources.push({ ...emptyRow(school, option('homepage', null), 0, country, country === 'US' ? 'northamerica' : null), state: state || null, csrankings: false });
  await fs.writeFile(SOURCES, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Added ${school}; ${sources.length} schools total.`);
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

export function buildQueue(sources, jobs, now = Date.now(), country = null) {
  const openSchools = new Set(jobs.filter(job => !job.closedAt).map(job => job.school));
  return sources
    .filter(source => !source.deferredUntil || Date.parse(source.deferredUntil) <= now)
    .filter(source => !country || (source.country || 'US').toUpperCase() === country.toUpperCase())
    .map(source => {
      const checked = source.lastCheckedAt ? Date.parse(source.lastCheckedAt) : null;
      const interval = intervalFor(source, now, openSchools.has(source.school));
      const dueInDays = checked === null ? -Infinity : (checked + interval * DAY - now) / DAY;
      return { source, dueInDays, reason: checked === null ? 'never checked' : `checked ${Math.floor((now - checked) / DAY)}d ago, every ${interval}d` };
    })
    .filter(item => item.dueInDays <= 0)
    .sort((a, b) => {
      const aIsUS = (a.source.country || 'US') === 'US' ? 1 : 0;
      const bIsUS = (b.source.country || 'US') === 'US' ? 1 : 0;
      if (aIsUS !== bIsUS) return bIsUS - aIsUS;
      return a.dueInDays - b.dueInDays || b.source.facultyCount - a.source.facultyCount || a.source.school.localeCompare(b.source.school);
    });
}

/** Schools whose non-CS units (information schools, ECE, data science) have never been crawled, largest roster first. */
export function buildRelatedQueue(sources) {
  return sources
    .filter(source => !source.relatedCheckedAt)
    .sort((a, b) => b.facultyCount - a.facultyCount || a.school.localeCompare(b.school));
}

/**
 * Bulk-register schools from a JSON array of { school, state, homepage, jobsUrl?, kind? }. Existing rows keep their crawl state
 * and only gain a missing homepage/jobsUrl/kind; new rows are marked `csrankings: false`. `kind` is a free label such as
 * "R2", "R3", "liberal-arts", "teaching", "community-college", "masters".
 */
async function importSchools() {
  const entries = JSON.parse(await fs.readFile(option('import', ''), 'utf8'));
  const sources = await readJson(SOURCES, []);
  const byName = new Map(sources.map(source => [source.school.toLowerCase(), source]));
  let added = 0;
  let updated = 0;
  for (const entry of entries) {
    if (!entry.school || !/^[A-Z]{2}$/.test(entry.state || '')) throw new Error(`Bad entry (school and USPS state required): ${JSON.stringify(entry)}`);
    const existing = byName.get(entry.school.toLowerCase());
    if (existing) {
      for (const key of ['homepage', 'jobsUrl', 'kind']) if (!existing[key] && entry[key]) { existing[key] = entry[key]; updated += 1; }
      if (!existing.state) existing.state = entry.state;
      continue;
    }
    const row = { ...emptyRow(entry.school, entry.homepage || null, 0), state: entry.state, csrankings: false };
    if (entry.jobsUrl) row.jobsUrl = entry.jobsUrl;
    if (entry.kind) row.kind = entry.kind;
    sources.push(row);
    byName.set(entry.school.toLowerCase(), row);
    added += 1;
  }
  await fs.writeFile(SOURCES, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Imported: ${added} added, ${updated} fields filled; ${sources.length} schools total.`);
}

async function main() {
  if (flag('seed')) return seed();
  if (flag('add')) return addSchool();
  if (flag('import')) return importSchools();
  const sources = await readJson(SOURCES, []);
  const jobs = await readJson(JOBS, []);
  if (flag('related')) {
    const queue = buildRelatedQueue(sources).slice(0, Number(option('related', '20')));
    if (!queue.length) return console.log('Every school has had its non-CS units checked.');
    queue.forEach((source, index) => console.log(`${index + 1}. ${source.school}  CS hiring page: ${source.jobsUrl || 'unknown'}  dept: ${source.homepage || 'unknown'}`));
    return;
  }
  if (flag('stats')) {
    const checked = sources.filter(source => source.lastCheckedAt).length;
    const withUrl = sources.filter(source => source.jobsUrl).length;
    console.log(`${sources.length} schools: ${checked} checked, ${withUrl} with a known hiring page; ${jobs.length} postings (${jobs.filter(job => !job.closedAt).length} not marked closed).`);
    return;
  }
  const limit = Number(option('limit', '30'));
  const country = option('country', null);
  const queue = buildQueue(sources, jobs, Date.now(), country).slice(0, limit);
  if (!queue.length) return console.log('Nothing is due. Run with --seed if the sources file is empty.');
  queue.forEach(({ source, reason }, index) => console.log(
    `${index + 1}. ${source.school}  [${reason}]  hiring page: ${source.jobsUrl || 'unknown'}  dept: ${source.homepage || 'unknown'}`));
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) await main();
