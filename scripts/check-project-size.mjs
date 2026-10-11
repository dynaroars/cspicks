#!/usr/bin/env node
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const maxTrackedAssetBytes = 40 * 1024 * 1024;
const problems = [];

for (const relative of ['public/professor_history_openalex.json', 'public/nsf-awards.json', 'public/school-aliases.json', 'public/core-extra-author-info.csv']) {
  const bytes = fs.statSync(new URL(relative, root)).size;
  if (bytes > maxTrackedAssetBytes) problems.push(`${relative}: ${(bytes / 1024 / 1024).toFixed(1)} MiB (limit 40 MiB)`);
}

if (problems.length) {
  console.error(`Project size guard failed:\n${problems.map(problem => `- ${problem}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Project size guard passed.');
}
