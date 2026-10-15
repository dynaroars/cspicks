#!/usr/bin/env node
/**
 * Queue for the lab-postings routine (TASKS/labs.md): labs from public/labs.json whose postings were checked
 * longest ago come first (never-checked first), with each lab's open postings in public/jobs.json.
 *
 *   npm run maintain:labs -- --limit 12
 */
import fs from 'node:fs/promises';

const read = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));
const DAY = 86400000;

/** Labs ordered by `postingsCheckedAt` (missing first), then by fewest open postings. */
export function buildLabQueue(labs, jobs, now = Date.now()) {
  const open = new Map();
  jobs.filter(job => job.lab && !job.closedAt).forEach(job => open.set(job.lab, (open.get(job.lab) || 0) + 1));
  const checked = lab => (lab.postingsCheckedAt ? Date.parse(lab.postingsCheckedAt) : -Infinity);
  return labs
    .map(lab => ({ lab, open: open.get(lab.id) || 0, days: lab.postingsCheckedAt ? Math.floor((now - checked(lab)) / DAY) : null }))
    .sort((a, b) => checked(a.lab) - checked(b.lab) || a.open - b.open || a.lab.name.localeCompare(b.lab.name));
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--limit');
  const limit = at === -1 ? 12 : Number(args[at + 1]);
  const [labs, jobs] = await Promise.all([read('../public/labs.json'), read('../public/jobs.json')]);
  buildLabQueue(labs, jobs).slice(0, limit).forEach(({ lab, open, days }, index) => console.log(
    `${index + 1}. ${lab.name} (${lab.id})  [${days === null ? 'postings never checked' : `postings checked ${days}d ago`}; ${open} open]  careers: ${lab.careersUrl}`
    + `${lab.internshipsUrl ? `  interns: ${lab.internshipsUrl}` : ''}${lab.postdocsUrl ? `  postdocs: ${lab.postdocsUrl}` : ''}`));
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) await main();
