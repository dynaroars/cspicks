#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url);
const sourceRoots = ['src', 'csconfs', 'test'];
const maxLines = 600;
const maxTrackedAssetBytes = 40 * 1024 * 1024;
const problems = [];

function visit(relative) {
  const absolute = new URL(relative, root);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) visit(`${child}/`);
    else if (/\.(?:js|mjs|css)$/.test(entry.name) && !entry.name.includes('.generated.')) {
      const lines = fs.readFileSync(new URL(child, root), 'utf8').split('\n').length;
      if (lines > maxLines) problems.push(`${child}: ${lines} lines (limit ${maxLines})`);
    }
  }
}

sourceRoots.forEach(relative => visit(`${relative}/`));
for (const relative of ['public/professor_history_openalex.json', 'public/nsf-awards.json', 'public/school-aliases.json']) {
  const bytes = fs.statSync(new URL(relative, root)).size;
  if (bytes > maxTrackedAssetBytes) problems.push(`${relative}: ${(bytes / 1024 / 1024).toFixed(1)} MiB (limit 40 MiB)`);
}

if (problems.length) {
  console.error(`Project size guard failed:\n${problems.map(problem => `- ${problem}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Project size guard passed.');
}
