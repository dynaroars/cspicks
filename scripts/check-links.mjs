#!/usr/bin/env node
/**
 * Link check for the researched datasets: fetches every current award (public/grants.json), active job posting
 * (public/jobs.json), and lab careers page (public/labs.json) and reports which links are broken, moved to another
 * site, redirected within the site (update the stored URL), or blocked to scripts. With --changes it also hashes each page's visible text into a local, gitignored cache
 * (.link-check-cache.json) and lists pages whose text changed since the previous run, so a verification run can
 * start with the entries most likely to need edits instead of re-reading everything.
 *
 * A status code is only a lead: many hiring sites answer scripts differently from browsers (TASKS/jobs.md), so
 * confirm a "broken" or "changed" result on the rendered page before editing data. It never edits data itself.
 *
 *   npm run check:links                      # everything
 *   npm run check:links -- --grants --changes
 *   npm run check:links -- --jobs --limit 50 --json
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const args = new Set(process.argv.slice(2));
const flag = name => args.has(`--${name}`);
const option = name => {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};

const TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CACHE = new URL('../.link-check-cache.json', import.meta.url);

const read = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

/** Statuses that usually mean "scripts not welcome" rather than "page gone". */
const BLOCKED = new Set([401, 403, 405, 406, 429, 503, 999]);

/** Registrable domain, approximately: the last two labels, or three under a 2-letter TLD with ac/co/edu/gov/... */
export function site(url) {
  let labels;
  try { labels = new URL(url).hostname.toLowerCase().split('.'); } catch { return ''; }
  const second = labels.at(-2) ?? '';
  const keep = labels.length > 2 && labels.at(-1).length === 2 && ['ac', 'co', 'com', 'edu', 'gov', 'net', 'org'].includes(second) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

const stripUrl = url => String(url).replace(/^https?:\/\/(www\.)?/i, '').replace(/[/#?]+$/, '').toLowerCase();

/** @param {{ status?: number | null, error?: string, from?: string, to?: string }} result */
export function classify({ status, error, from, to }) {
  if (error) return /ENOTFOUND|EAI_AGAIN|certificate|CERT_/i.test(error) ? 'broken' : 'error';
  if (status === 404 || status === 410) return 'broken';
  if (BLOCKED.has(status)) return 'blocked';
  if (status >= 400) return 'error';
  if (to && site(to) !== site(from)) return 'moved';
  if (to && stripUrl(to) !== stripUrl(from)) return 'redirected';
  return 'ok';
}

/** Visible text only, whitespace-collapsed, so markup and script churn don't count as a change. */
export function pageText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function check(item) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(item.url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,*/*' } });
    const type = response.headers.get('content-type') || '';
    const body = /html|text|json/.test(type) ? await response.text() : '';
    const hash = body ? crypto.createHash('sha256').update(pageText(body)).digest('hex').slice(0, 16) : null;
    return { ...item, status: response.status, finalUrl: response.url, hash, result: classify({ status: response.status, from: item.url, to: response.url }) };
  } catch (error) {
    const message = error?.cause?.code || error?.cause?.message || error?.name || String(error);
    return { ...item, status: null, error: message, result: classify({ error: message }) };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, worker, size) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
      if (!flag('json')) process.stderr.write(`\r${results.filter(Boolean).length}/${items.length} checked`);
    }
  }));
  if (!flag('json')) process.stderr.write('\n');
  return results;
}

function activeJob(job) {
  if (job.closedAt && job.closedAt <= today) return false;
  return !job.deadline || job.rolling || job.deadline >= today;
}

async function main() {
  const all = !flag('grants') && !flag('jobs') && !flag('labs');
  const items = [];
  if (all || flag('grants')) {
    for (const grant of await read('../public/grants.json')) {
      if (grant.status !== 'historical') items.push({ dataset: 'grants', id: grant.id, url: grant.url });
    }
  }
  if (all || flag('jobs')) {
    for (const job of await read('../public/jobs.json')) if (activeJob(job)) items.push({ dataset: 'jobs', id: job.id, url: job.url });
  }
  if (all || flag('labs')) {
    for (const lab of await read('../public/labs.json')) {
      for (const [field, url] of Object.entries(lab)) {
        if (typeof url === 'string' && /^https?:\/\//.test(url)) items.push({ dataset: 'labs', id: `${lab.id}.${field}`, url });
      }
    }
  }
  const limit = Number(option('limit'));
  const queue = Number.isFinite(limit) && limit > 0 ? items.slice(0, limit) : items;
  const results = await pool(queue, check, CONCURRENCY);

  let changed = [];
  if (flag('changes')) {
    let cache = {};
    try { cache = JSON.parse(await fs.readFile(CACHE, 'utf8')); } catch { /* first run */ }
    for (const result of results) {
      const key = `${result.dataset}:${result.id}`;
      const previous = cache[key];
      if (result.hash && previous?.hash && previous.hash !== result.hash && previous.url === result.url) changed.push({ ...result, since: previous.checkedAt });
      if (result.hash) cache[key] = { url: result.url, hash: result.hash, checkedAt: today };
    }
    await fs.writeFile(CACHE, `${JSON.stringify(cache, null, 1)}\n`);
  }

  if (flag('json')) {
    console.log(JSON.stringify({ checkedAt: today, results, changed }, null, 2));
    return;
  }
  const groups = ['broken', 'moved', 'redirected', 'error', 'blocked'];
  for (const group of groups) {
    const rows = results.filter(result => result.result === group);
    if (!rows.length) continue;
    console.log(`\n${group.toUpperCase()} (${rows.length})`);
    for (const row of rows) {
      const detail = row.error || `${row.status}${row.finalUrl && row.finalUrl !== row.url ? ` → ${row.finalUrl}` : ''}`;
      console.log(`  ${row.dataset} ${row.id}: ${row.url} [${detail}]`);
    }
  }
  if (flag('changes')) {
    console.log(`\nCHANGED SINCE LAST RUN (${changed.length})`);
    for (const row of changed) console.log(`  ${row.dataset} ${row.id}: ${row.url} (last seen unchanged ${row.since})`);
  }
  const counts = Object.fromEntries(['ok', ...groups].map(group => [group, results.filter(result => result.result === group).length]));
  console.log(`\n${results.length} links: ${Object.entries(counts).map(([key, value]) => `${value} ${key}`).join(', ')}.`);
  console.log('Status codes are leads, not verdicts: confirm on the rendered page (npm run render:jobs) before changing data.');
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) await main();
