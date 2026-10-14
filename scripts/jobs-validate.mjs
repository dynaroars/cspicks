#!/usr/bin/env node
/**
 * Fast pre-commit check for the CS Jobs data (TASKS/jobs.md). Run it before every commit that
 * touches public/jobs.json or scripts/data/jobs-sources.json; it prints every bad record and
 * exits 1, so one malformed posting can't reach main and block the Pages deploy.
 *
 *   npm run validate:jobs
 */
import fs from 'node:fs/promises';
import { jobsDatasetProblems } from '../src/jobs/jobs-data.ts';

const JOBS = new URL('../public/jobs.json', import.meta.url);
const SOURCES = new URL('./data/jobs-sources.json', import.meta.url);

/** Every problem in the shipped jobs dataset, one line each; empty when it is valid. */
export function jobsFileProblems(jobs, sources) {
  const problems = jobsDatasetProblems(jobs);
  if (!Array.isArray(jobs) || !Array.isArray(sources)) return problems;
  const schools = new Set(sources.map(source => source.school));
  const seen = { id: new Map(), url: new Map() };
  jobs.forEach((job, index) => {
    const label = typeof job?.id === 'string' ? job.id : `record #${index}`;
    for (const key of ['id', 'url']) {
      const value = job?.[key];
      if (typeof value !== 'string') continue;
      if (seen[key].has(value)) problems.push(`${label}: duplicate ${key} (also ${seen[key].get(value)})`);
      else seen[key].set(value, label);
    }
    if (typeof job?.school === 'string' && !schools.has(job.school)) {
      problems.push(`${label}: school "${job.school}" is not in jobs-sources.json (add it with maintain:jobs --add)`);
    }
    if (typeof job?.url === 'string' && !job.url.startsWith('https://')) problems.push(`${label}: url is not https`);
    if (Array.isArray(job?.areas) && job.areas.some(area => !area)) problems.push(`${label}: empty area`);
  });
  return problems;
}

async function main() {
  const [jobs, sources] = await Promise.all([JOBS, SOURCES].map(async url => JSON.parse(await fs.readFile(url, 'utf8'))));
  const problems = jobsFileProblems(jobs, sources);
  if (problems.length) {
    console.error(`public/jobs.json has ${problems.length} problem(s):\n${problems.map(line => `  ${line}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`public/jobs.json OK: ${jobs.length} postings, ${sources.length} schools.`);
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) await main();
