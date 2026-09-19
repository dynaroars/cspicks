#!/usr/bin/env node
/**
 * list-core-extra-venues.mjs
 *
 * EXPANSION_PLAN.md Step 1.1: compute EXTRA_VENUES = (coreAMap ∪ coreAStarMap)
 * − (parentMap ∪ nextTier) — the CORE A/A* venues that CSRankings' own
 * generated-author-info.csv does not track at all, and that this expansion
 * needs a supplementary DBLP-derived dataset for.
 *
 * Writes a committed, reviewable artifact (not just console output) so the
 * venue list this whole project targets is explicit and diffable in PRs.
 *
 * Usage: node --import tsx scripts/list-core-extra-venues.mjs
 * Output: scripts/data/core-extra-venues.json
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { coreAMap, coreAStarMap, nextTier, parentMap } from '../src/data/conference-sets.ts';

const csrankingsVenues = new Set([...Object.keys(parentMap), ...Object.keys(nextTier)]);
const coreVenues = new Set([...Object.keys(coreAMap), ...Object.keys(coreAStarMap)]);

const extraVenues = [...coreVenues]
  .filter(venue => !csrankingsVenues.has(venue))
  .sort()
  .map(acronym => ({
    acronym,
    area: coreAStarMap[acronym] || coreAMap[acronym],
    tier: coreAStarMap[acronym] ? 'core-a-star' : 'core-a'
  }));

const output = {
  generatedAt: new Date().toISOString(),
  note: 'CORE A/A* venues declared in src/data/conference-sets.ts that CSRankings\' own generated-author-info.csv does not contain any rows for (verified by diffing live CSV areas against parentMap/nextTier). See EXPANSION_PLAN.md.',
  csrankingsVenueCount: csrankingsVenues.size,
  coreDeclaredVenueCount: coreVenues.size,
  extraVenueCount: extraVenues.length,
  extraVenues
};

const outDir = fileURLToPath(new URL('data/', import.meta.url));
await mkdir(outDir, { recursive: true });
const outPath = fileURLToPath(new URL('data/core-extra-venues.json', import.meta.url));
await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`${extraVenues.length} extra venues (of ${coreVenues.size} declared CORE A/A* venues) not covered by CSRankings' own data.`);
console.log(`Written to ${outPath}`);
