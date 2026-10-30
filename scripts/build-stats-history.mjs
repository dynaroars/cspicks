#!/usr/bin/env node
/**
 * Generates public/stats-history.json for the Stats page's data-health section (mirrors VietProfs'
 * build-stats-history): a daily time series of what the curated datasets hold, walked from git history,
 * plus the current crawl freshness of scripts/data/jobs-sources.json (too large to ship to the browser).
 * A build-time artifact (gitignored), regenerated on dev/build from whatever git history is available;
 * a shallow clone just yields today's point.
 *
 * Usage: node --import tsx scripts/build-stats-history.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isActive } from '../src/jobs/jobs-data.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
const FILES = {
  jobs: 'public/jobs.json',
  grants: 'public/grants.json',
  conferences: 'csconfs/data/conferences.json',
  sources: 'scripts/data/jobs-sources.json'
};

const git = (args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 1024 * 1024 * 512 });

// Count physical text lines, without a phantom line after the final newline.
const countLines = content => content ? content.split('\n').length - Number(content.endsWith('\n')) : 0;
const isSource = file => /\.(ts|css|html)$/.test(file);

/**
 * Per-dataset counts for one snapshot (a missing file is null); `endOfDay` decides which postings were still active then.
 * @param {{ jobs?: any[] | null, grants?: any[] | null, conferences?: any[] | null, sources?: any[] | null }} snapshot
 * @param {number} endOfDay
 */
export function datasetMetrics({ jobs, grants, conferences, sources }, endOfDay) {
  return {
    activeJobs: jobs ? jobs.filter(job => isActive(job, endOfDay)).length : null,
    grants: grants ? grants.filter(grant => grant.status !== 'historical').length : null,
    conferences: conferences ? new Set(conferences.map(conf => `${conf.name}|${conf.year}`)).size : null,
    crawledSchools: sources ? sources.filter(source => source.lastCheckedAt).length : null
  };
}

/** How recently the jobs crawl last read each school's hiring pages, as of `now`. */
export function crawlFreshness(sources, now) {
  const within = days => sources.filter(source => source.lastCheckedAt && now - Date.parse(source.lastCheckedAt) <= days * DAY).length;
  return {
    schools: sources.length,
    withHiringUrl: sources.filter(source => source.jobsUrl).length,
    checked7: within(7),
    checked30: within(30),
    checked90: within(90)
  };
}

/** Reads many blobs in one `git cat-file --batch`; returns contents in request order. */
function readBlobs(ids) {
  if (!ids.length) return [];
  // `--batch` streams `<sha> <type> <size>\n<contents>\n`; sizes are bytes, so index the Buffer.
  const batch = git(['cat-file', '--batch'], `${ids.join('\n')}\n`);
  const out = [];
  let offset = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const headerEnd = batch.indexOf(0x0a, offset);
    const size = Number(batch.toString('utf8', offset, headerEnd).split(' ')[2]);
    const start = headerEnd + 1;
    out.push(batch.toString('utf8', start, start + size));
    offset = start + size + 1;
  }
  return out;
}

function historyPoints() {
  const log = git(['log', '--first-parent', '--format=%H %cI', '--', ...Object.values(FILES), 'src/']).toString().trim();
  const byDay = new Map();
  for (const line of log.split('\n').filter(Boolean).reverse()) {
    const [hash, iso] = line.split(' ');
    byDay.set(new Date(iso).toISOString().slice(0, 10), hash);
  }
  // Many days change only one file, so parse each distinct blob once.
  const parsed = new Map();
  const lines = new Map();
  const points = [];
  for (const [date, hash] of byDay) {
    const tree = git(['ls-tree', '-r', hash, '--', ...Object.values(FILES), 'src/']).toString().trim().split('\n').filter(Boolean)
      .map(entry => { const [meta, file] = entry.split('\t'); return { id: meta.split(/\s+/)[2], file }; });
    const wanted = tree.filter(({ id, file }) => isSource(file) ? !lines.has(id) : Object.values(FILES).includes(file) && !parsed.has(id));
    readBlobs(wanted.map(entry => entry.id)).forEach((content, i) => {
      const { id, file } = wanted[i];
      if (isSource(file)) lines.set(id, countLines(content));
      else {
        try { parsed.set(id, JSON.parse(content)); } catch { parsed.set(id, null); }
      }
    });
    const snapshot = Object.fromEntries(Object.entries(FILES).map(([key, file]) => {
      const entry = tree.find(item => item.file === file);
      return [key, entry ? parsed.get(entry.id) : null];
    }));
    const codeLines = tree.filter(({ file }) => file.startsWith('src/') && isSource(file)).reduce((sum, { id }) => sum + lines.get(id), 0);
    points.push({ date, ...datasetMetrics(snapshot, Date.parse(`${date}T23:59:59Z`)), codeLines });
  }
  return points;
}

async function main() {
  let points = [];
  try {
    points = historyPoints();
  } catch (error) {
    console.warn(`build-stats-history: git history unavailable (${error.message}); using the working tree only.`);
  }
  const now = Date.now();
  const readJson = file => readFile(path.join(root, file), 'utf8').then(JSON.parse);
  const current = Object.fromEntries(await Promise.all(Object.entries(FILES).map(async ([key, file]) => [key, await readJson(file)])));
  const sourceFiles = git(['ls-files', '--cached', '--others', '--exclude-standard', 'src/']).toString().trim().split('\n').filter(isSource);
  const codeLines = (await Promise.all(sourceFiles.map(file => readFile(path.join(root, file), 'utf8').then(countLines, () => 0)))).reduce((a, b) => a + b, 0);
  const today = new Date(now).toISOString().slice(0, 10);
  const latest = { date: today, ...datasetMetrics(current, now), codeLines };
  if (points.at(-1)?.date === today) points[points.length - 1] = latest;
  else points.push(latest);

  const output = { generatedAt: new Date(now).toISOString(), crawl: crawlFreshness(current.sources, now), history: points };
  await writeFile(path.join(root, 'public/stats-history.json'), `${JSON.stringify(output)}\n`);
  console.log(`build-stats-history: wrote ${points.length} snapshot(s) to public/stats-history.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
