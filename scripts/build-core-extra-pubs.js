#!/usr/bin/env node
/**
 * build-core-extra-pubs.js
 *
 * EXPANSION_PLAN.md Step 2: stream-parse the full DBLP dump and emit
 * publication-count rows, in the same shape src/data.ts actually reads from
 * generated-author-info.csv (`name, area, count, adjustedcount, year`), for
 * publications in CORE A/A* venues CSRankings itself doesn't track — for the
 * EXISTING CSRankings faculty roster only. This does not discover new
 * faculty: a DBLP publication only produces a row if its author name is an
 * exact match against a name already in csrankings.csv.
 *
 * dblp.org runs an anti-bot wall (Anubis) that blocks scripted downloads of
 * the dump (see EXPANSION_PLAN.md's pre-flight checklist), so this script
 * takes an already-downloaded local file rather than fetching it itself —
 * download dblp.xml.gz via a regular browser first.
 *
 * This same pass also resolves/validates venue keys, folding in what would
 * otherwise have been separate live DBLP calls (also blocked by Anubis):
 *   - venues Step 1 (resolve-core-venue-keys.mjs) resolved via Wikidata are
 *     cross-checked here against real publication volume in the dump;
 *   - venues Step 1 left unresolved get a guessed key (`conf/<acronym>`)
 *     tried here, accepted only if it clears the same volume bar.
 * A key that doesn't show plausible, multi-year volume is excluded from the
 * output and reported, not guessed at silently.
 *
 * Usage:
 *   node scripts/build-core-extra-pubs.js <path-to-dblp-xxxx.xml.gz> [--dtd=<path-to-dtd>]
 *
 * Input:  <dump>, scripts/data/core-extra-venues.json, scripts/data/core-venue-dblp-keys.json,
 *         csrankings.csv (fetched live from GitHub — not behind Anubis)
 * Output: public/core-extra-author-info.csv, scripts/data/core-extra-pubs-report.json
 */

import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sax from 'sax';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSRANKINGS_CSV_URL = 'https://raw.githubusercontent.com/emeryberger/CSrankings/master/csrankings.csv';
const VENUE_KEYS_PATH = path.join(__dirname, 'data/core-venue-dblp-keys.json');
const EXTRA_VENUES_PATH = path.join(__dirname, 'data/core-extra-venues.json');
const OUTPUT_CSV = path.join(__dirname, '../public/core-extra-author-info.csv');
const REPORT_PATH = path.join(__dirname, 'data/core-extra-pubs-report.json');

// A candidate key needs at least this much real, spread-out volume in the
// whole dump (not just roster-matched papers) to be trusted as correct —
// catches both a wrong Wikidata mapping and a wrong guessed key.
const MIN_TOTAL_PAPERS = 20;
const MIN_DISTINCT_YEARS = 3;

// DBLP's stream key sometimes differs from the venue acronym in ways neither
// Wikidata's P8926 claim nor a `conf/<acronym>` guess can catch (EXPANSION_PLAN.md
// calls a few of these out by name). Confirmed against the actual dump content
// (`zcat dblp-2026-09-01.xml.gz | grep ...`) before adding each entry here —
// this is not a blind guess table, only substitutions for keys the guessed
// form provably doesn't match.
const KNOWN_KEY_OVERRIDES = {
  acmmm: 'conf/mm',
  icaps: 'conf/aips',
  sigspatial: 'conf/gis',
  csf: 'conf/csfw',
  itcs: 'conf/innovations',
  disc: 'conf/wdag',
  pets: 'conf/pet',
  ccc: 'conf/coco'
};

const PUB_TYPES = new Set(['article', 'inproceedings']);
const FIELD_TAGS = new Set(['author', 'year']);

function parseArgs(argv) {
  const positional = argv.filter(a => !a.startsWith('--'));
  const dtdFlag = argv.find(a => a.startsWith('--dtd='));
  return {
    dumpPath: positional[0],
    dtdPath: dtdFlag ? dtdFlag.slice('--dtd='.length) : null
  };
}

/** DBLP's DTD declares named entities for accented characters etc. (e.g.
 *  `<!ENTITY auml "&#228;">`) that sax's default entity table doesn't know
 *  about; without these, author names with diacritics decode incorrectly
 *  and silently fail to match the roster. */
async function loadCustomEntities(dtdPath) {
  if (!dtdPath || !existsSync(dtdPath)) return {};
  const dtd = await readFile(dtdPath, 'utf-8');
  const entities = {};
  const entityRegex = /<!ENTITY\s+(\S+)\s+"&#x?([0-9a-fA-F]+);">/g;
  let match;
  while ((match = entityRegex.exec(dtd))) {
    const [, name, codePoint] = match;
    const isHex = dtd.slice(match.index, match.index + match[0].length).includes('&#x');
    entities[name] = String.fromCodePoint(parseInt(codePoint, isHex ? 16 : 10));
  }
  return entities;
}

function findDtdNextToDump(dumpPath) {
  const dir = path.dirname(dumpPath);
  const dtdFile = readdirSync(dir).find(f => f.endsWith('.dtd'));
  return dtdFile ? path.join(dir, dtdFile) : null;
}

async function loadRosterNames() {
  const res = await fetch(CSRANKINGS_CSV_URL);
  if (!res.ok) throw new Error(`Failed to fetch csrankings.csv: ${res.status}`);
  const csv = await res.text();
  const { data } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const names = new Set();
  for (const row of data) {
    const name = row.name?.trim();
    if (name) names.add(name);
  }
  return names;
}

function buildVenueKeyTable(venueKeysData, extraVenuesData) {
  // Step 1's core-extra-venues.json is the authoritative acronym->area map
  // for all 86 EXTRA_VENUES; core-venue-dblp-keys.json's `resolved` entries
  // duplicate it for resolved acronyms, but `unresolved` ones carry no area
  // at all, so fall back to this for those.
  const areaByAcronym = {};
  for (const v of extraVenuesData.extraVenues) areaByAcronym[v.acronym] = v.area;

  // acronym -> { dblpKey, area, tier, source }
  const byAcronym = {};
  for (const [acronym, entry] of Object.entries(venueKeysData.resolved)) {
    byAcronym[acronym] = { dblpKey: entry.dblpKey, area: entry.area ?? areaByAcronym[acronym], tier: entry.tier, source: 'wikidata' };
  }
  for (const entry of venueKeysData.unresolved) {
    // Best-effort guess for anything Wikidata couldn't resolve, regardless of
    // reason — validated below by the same volume bar as everything else,
    // never assumed. A confirmed override (see KNOWN_KEY_OVERRIDES) takes
    // precedence over the acronym-shaped guess.
    const dblpKey = KNOWN_KEY_OVERRIDES[entry.acronym] || `conf/${entry.acronym}`;
    byAcronym[entry.acronym] = { dblpKey, area: areaByAcronym[entry.acronym] ?? null, tier: null, source: KNOWN_KEY_OVERRIDES[entry.acronym] ? 'override' : 'guessed', guessedFor: entry.acronym };
  }
  // dblpKey -> acronym metadata, since that's what we match dump records against
  const byDblpKey = {};
  for (const [acronym, meta] of Object.entries(byAcronym)) {
    byDblpKey[meta.dblpKey] = { acronym, ...meta };
  }
  return byDblpKey;
}

function streamKeyOf(recordKey) {
  const parts = recordKey.split('/');
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
}

async function parseDump({ dumpPath, entities, venueKeyTable, rosterNames }) {
  const volumeByKey = new Map(); // dblpKey -> Map<year, count> (ALL papers, not just roster matches)
  const rowsByBucket = new Map(); // `${name}\u0000${area}\u0000${year}` -> { name, area, year, count, adjustedcount }
  let recordsSeen = 0;
  let matchedVenueRecords = 0;
  let rosterMatchedPapers = 0;
  const unexpectedKinds = new Set();

  // strict:false (DBLP's XML isn't strictly well-formed re: entities) but
  // lowercase:true is required — non-strict mode otherwise uppercases every
  // tag/attribute name, which silently breaks the tag-name checks below.
  const parser = sax.createStream(false, { trim: false, normalize: false, lowercase: true });
  Object.assign(sax.ENTITIES, entities);

  let depth = 0;
  let current = null;
  let currentField = null;
  let textBuf = '';

  parser.on('opentag', node => {
    depth++;
    if (depth === 2 && PUB_TYPES.has(node.name) && node.attributes.key) {
      current = { type: node.name, key: node.attributes.key, authors: [], year: null };
    } else if (depth === 3 && current && FIELD_TAGS.has(node.name)) {
      currentField = node.name;
      textBuf = '';
    }
  });

  const onText = text => { if (currentField) textBuf += text; };
  parser.on('text', onText);
  parser.on('cdata', onText);

  parser.on('closetag', name => {
    if (depth === 3 && current && currentField === name) {
      if (name === 'author') current.authors.push(textBuf.trim());
      else if (name === 'year') current.year = Number.parseInt(textBuf, 10);
      currentField = null;
      textBuf = '';
    } else if (depth === 2 && current && name === current.type) {
      recordsSeen++;
      if (recordsSeen % 2_000_000 === 0) {
        console.log(`  ...${(recordsSeen / 1_000_000).toFixed(1)}M dump records scanned so far`);
      }

      const streamKey = streamKeyOf(current.key);
      const venueMeta = streamKey ? venueKeyTable[streamKey] : null;
      if (venueMeta && Number.isFinite(current.year) && current.authors.length > 0) {
        matchedVenueRecords++;
        if (!volumeByKey.has(streamKey)) volumeByKey.set(streamKey, new Map());
        const yearCounts = volumeByKey.get(streamKey);
        yearCounts.set(current.year, (yearCounts.get(current.year) || 0) + 1);

        const rosterAuthorsHere = current.authors.filter(a => rosterNames.has(a));
        if (rosterAuthorsHere.length > 0) {
          const adjusted = 1 / current.authors.length;
          for (const authorName of rosterAuthorsHere) {
            rosterMatchedPapers++;
            const bucketKey = `${authorName}\u0000${venueMeta.area}\u0000${current.year}`;
            const bucket = rowsByBucket.get(bucketKey) || { name: authorName, area: venueMeta.area, year: current.year, count: 0, adjustedcount: 0 };
            bucket.count += 1;
            bucket.adjustedcount += adjusted;
            rowsByBucket.set(bucketKey, bucket);
          }
        }
      } else if (streamKey?.startsWith('journals/') && venueKeyTable[streamKey]) {
        unexpectedKinds.add(streamKey);
      }
      current = null;
    }
    depth--;
  });

  await new Promise((resolve, reject) => {
    parser.on('error', reject);
    parser.on('end', resolve);
    createReadStream(dumpPath)
      .on('error', reject)
      .pipe(createGunzip())
      .on('error', reject)
      .pipe(parser);
  });

  return { volumeByKey, rowsByBucket, recordsSeen, matchedVenueRecords, rosterMatchedPapers, unexpectedKinds };
}

function validateVenues(venueKeyTable, volumeByKey) {
  const accepted = {};
  const rejected = {};
  for (const [dblpKey, meta] of Object.entries(venueKeyTable)) {
    const yearCounts = volumeByKey.get(dblpKey);
    const totalPapers = yearCounts ? [...yearCounts.values()].reduce((a, b) => a + b, 0) : 0;
    const distinctYears = yearCounts ? yearCounts.size : 0;
    const plausible = totalPapers >= MIN_TOTAL_PAPERS && distinctYears >= MIN_DISTINCT_YEARS;
    const record = { acronym: meta.acronym, dblpKey, area: meta.area, source: meta.source, totalPapers, distinctYears };
    if (plausible) accepted[meta.acronym] = record;
    else rejected[meta.acronym] = record;
  }
  return { accepted, rejected };
}

async function main() {
  const { dumpPath, dtdPath: dtdArg } = parseArgs(process.argv.slice(2));
  if (!dumpPath || !existsSync(dumpPath)) {
    console.error('Usage: node scripts/build-core-extra-pubs.js <path-to-dblp-xxxx.xml.gz> [--dtd=<path>]');
    console.error('(dblp.org is behind an anti-bot wall — download the dump via a regular browser first; see EXPANSION_PLAN.md.)');
    process.exit(1);
  }

  const dtdPath = dtdArg || findDtdNextToDump(dumpPath);
  console.log(`Dump: ${dumpPath}`);
  console.log(`DTD (for entity decoding): ${dtdPath || '(none found — accented author names may fail to match)'}`);

  console.log('Loading CSRankings faculty roster (live fetch)...');
  const rosterNames = await loadRosterNames();
  console.log(`  ${rosterNames.size} roster names loaded.`);

  console.log('Loading Step 1 venue-key resolutions...');
  const venueKeysData = JSON.parse(await readFile(VENUE_KEYS_PATH, 'utf-8'));
  const extraVenuesData = JSON.parse(await readFile(EXTRA_VENUES_PATH, 'utf-8'));
  const venueKeyTable = buildVenueKeyTable(venueKeysData, extraVenuesData);
  console.log(`  ${Object.keys(venueKeyTable).length} candidate venue keys to check (resolved + guessed).`);

  const entities = await loadCustomEntities(dtdPath);
  console.log(`  ${Object.keys(entities).length} custom DTD entities loaded for decoding.`);

  console.log('Streaming the dump (this can take several minutes for a ~1GB+ file)...');
  const { volumeByKey, rowsByBucket, recordsSeen, matchedVenueRecords, rosterMatchedPapers, unexpectedKinds } =
    await parseDump({ dumpPath, entities, venueKeyTable, rosterNames });
  console.log(`  Scanned ${recordsSeen.toLocaleString()} dump records.`);
  console.log(`  ${matchedVenueRecords.toLocaleString()} records matched a candidate venue key.`);
  console.log(`  ${rosterMatchedPapers.toLocaleString()} of those had a roster author.`);
  if (unexpectedKinds.size) {
    console.warn(`  NOTE: matched journal-shaped keys (${[...unexpectedKinds].join(', ')}) — these may need issue/volume disambiguation like src/dblp.ts's normalizeDblpVenue; not applied here.`);
  }

  const { accepted, rejected } = validateVenues(venueKeyTable, volumeByKey);
  console.log(`Venue validation: ${Object.keys(accepted).length} accepted, ${Object.keys(rejected).length} rejected (implausible volume).`);

  const acceptedAreas = new Set(Object.values(accepted).map(v => v.area));
  const outputRows = [...rowsByBucket.values()].filter(row => acceptedAreas.has(row.area));

  const csv = Papa.unparse(outputRows.map(r => ({
    name: r.name,
    area: r.area,
    count: r.count,
    adjustedcount: Number(r.adjustedcount.toFixed(5)),
    year: r.year
  })), { header: true });
  await writeFile(OUTPUT_CSV, `${csv}\n`);
  console.log(`Wrote ${outputRows.length} rows to ${OUTPUT_CSV}`);

  const report = {
    generatedAt: new Date().toISOString(),
    dumpPath,
    recordsSeen,
    matchedVenueRecords,
    rosterMatchedPapers,
    outputRowCount: outputRows.length,
    accepted,
    rejected
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote validation report to ${REPORT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
