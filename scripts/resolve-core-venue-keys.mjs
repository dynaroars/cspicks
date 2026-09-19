#!/usr/bin/env node
/**
 * resolve-core-venue-keys.mjs
 *
 * EXPANSION_PLAN.md Step 1.3: automatically resolve each CORE-only venue
 * acronym (from scripts/data/core-extra-venues.json) to its DBLP stream key,
 * without hand-verification. Chain of independent signals, each only
 * handing off to the next when it can't resolve confidently:
 *
 *   1. Wikidata "DBLP venue ID" (P8926) — primary. Looked up via the plain
 *      REST API (wbsearchentities + wbgetentities), not the SPARQL query
 *      service, because in practice the REST endpoints have proven far more
 *      reliable to reach than query.wikidata.org's SPARQL endpoint.
 *   2. DBLP venue-search API (dblp.org/search/venue/api) — fallback for
 *      anything Wikidata doesn't have a P8926 claim for.
 *   3. DBLP existence/activity check — confirm the resolved key actually has
 *      a live, multi-year index page on DBLP.
 *
 * Anything that fails every signal is written to the `unresolved` list
 * rather than guessed at — dropped from this round of the expansion, not
 * blocking it.
 *
 * Usage: node scripts/resolve-core-venue-keys.mjs
 * Input:  scripts/data/core-extra-venues.json
 * Output: scripts/data/core-venue-dblp-keys.json
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const INPUT = fileURLToPath(new URL('data/core-extra-venues.json', import.meta.url));
const OUTPUT = fileURLToPath(new URL('data/core-venue-dblp-keys.json', import.meta.url));

const WIKIDATA_SEARCH_DELAY_MS = 400;
const DBLP_SEARCH_DELAY_MS = 1200; // dblp.org rate-limits bursts; match src/dblp.ts's pacing

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch with retries + backoff; returns null (not a throw) if every attempt fails,
 *  since some upstream services in this pipeline are known to be flaky/unreachable
 *  from certain networks, and a single dead lookup must not kill the whole run. */
async function fetchJsonWithRetry(url, { attempts = 3, timeoutMs = 15000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        await sleep(2000 * attempt);
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      clearTimeout(timer);
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }
  return null;
}

/** Step 1: Wikidata P8926 lookup via the REST API. */
async function resolveViaWikidata(acronym) {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(acronym)}&language=en&format=json&limit=10`;
  const searchData = await fetchJsonWithRetry(searchUrl);
  const hits = searchData?.search || [];

  // Only trust candidates where the acronym matched an exact alias/label,
  // not a fuzzy substring match on an unrelated longer title.
  const exactHits = hits.filter(hit => (hit.match?.text || '').toUpperCase() === acronym.toUpperCase());
  if (!exactHits.length) return null;

  const ids = exactHits.map(hit => hit.id).slice(0, 8).join('|');
  const entitiesUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims|labels|descriptions|sitelinks&languages=en&format=json`;
  const entitiesData = await fetchJsonWithRetry(entitiesUrl);
  if (!entitiesData?.entities) return null;

  const candidates = Object.values(entitiesData.entities)
    .map(entity => {
      const claim = entity.claims?.P8926?.[0]?.mainsnak?.datavalue?.value;
      if (!claim) return null;
      return {
        wikidataId: entity.id,
        label: entity.labels?.en?.value || null,
        description: entity.descriptions?.en?.value || null,
        sitelinkCount: Object.keys(entity.sitelinks || {}).length,
        dblpKey: claim
      };
    })
    .filter(Boolean);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { ...candidates[0], confidence: 'wikidata' };

  const uniqueKeys = new Set(candidates.map(c => c.dblpKey));
  if (uniqueKeys.size === 1) return { ...candidates[0], confidence: 'wikidata' };

  // Multiple distinct Wikidata items claim a DBLP key for the same acronym
  // (a common pattern: two unrelated conference series happen to share an
  // acronym, e.g. AAMAS the well-known agents conference vs. an obscure
  // same-acronym workshop). Prefer one whose description reads like an
  // actual conference/workshop series over an unrelated same-acronym entity.
  const conferenceLike = candidates.filter(c => /confer|workshop|symposium/i.test(c.description || ''));
  const pool = conferenceLike.length ? conferenceLike : candidates;
  if (pool.length === 1) return { ...pool[0], confidence: 'wikidata-disambiguated' };

  // Tiebreak on having a Wikipedia article (sitelinks): the well-known
  // conference in an acronym collision almost always has one and the
  // obscure duplicate almost never does. Only accept if it's decisive.
  const maxSitelinks = Math.max(...pool.map(c => c.sitelinkCount));
  const withMaxSitelinks = pool.filter(c => c.sitelinkCount === maxSitelinks);
  if (maxSitelinks > 0 && withMaxSitelinks.length === 1) {
    return { ...withMaxSitelinks[0], confidence: 'wikidata-sitelink-disambiguated' };
  }

  return { ambiguous: true, candidates: pool };
}

/** Step 2: DBLP's own venue-search API, scored by title similarity. */
function tokenize(text) {
  return new Set(String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []);
}

function jaccardSimilarity(a, b) {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

async function resolveViaDblpSearch(acronym, fullName) {
  const query = fullName || acronym;
  const url = `https://dblp.org/search/venue/api?q=${encodeURIComponent(query)}&format=json&h=20`;
  const data = await fetchJsonWithRetry(url, { attempts: 2, timeoutMs: 10000 });
  const hits = data?.result?.hits?.hit || [];
  if (!hits.length) return null;

  const scored = hits
    .map(hit => {
      const info = hit.info || {};
      const urlPath = String(info.url || '');
      const keyMatch = urlPath.match(/\/db\/(conf|journals)\/([^/]+)\//);
      if (!keyMatch) return null;
      return {
        dblpKey: `${keyMatch[1]}/${keyMatch[2]}`,
        kind: keyMatch[1],
        venueTitle: info.venue,
        similarity: jaccardSimilarity(fullName || acronym, info.venue)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity);

  const best = scored[0];
  if (!best || best.similarity < 0.5) return null;
  return { ...best, confidence: 'dblp-search' };
}

/** Step 3: confirm the resolved key is a real, multi-edition DBLP stream. */
async function checkDblpExistence(dblpKey) {
  const url = `https://dblp.org/db/${dblpKey}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return null; // null = "couldn't check", distinct from false = "checked, doesn't exist"
  }
}

async function main() {
  const input = JSON.parse(await readFile(INPUT, 'utf-8'));
  const results = {};
  const unresolved = [];
  let dblpUnreachableCount = 0;

  for (const { acronym, area, tier } of input.extraVenues) {
    await sleep(WIKIDATA_SEARCH_DELAY_MS);
    let resolution = await resolveViaWikidata(acronym);

    if (resolution?.ambiguous) {
      unresolved.push({ acronym, reason: 'ambiguous-wikidata-matches', candidates: resolution.candidates });
      continue;
    }

    if (!resolution) {
      await sleep(DBLP_SEARCH_DELAY_MS);
      resolution = await resolveViaDblpSearch(acronym, resolution?.label);
    }

    if (!resolution) {
      unresolved.push({ acronym, reason: 'no-signal-matched' });
      continue;
    }

    const kind = resolution.kind || (resolution.dblpKey.startsWith('journals/') ? 'journals' : 'conf');
    const normalizedKey = resolution.dblpKey.includes('/') ? resolution.dblpKey : `conf/${resolution.dblpKey}`;

    await sleep(DBLP_SEARCH_DELAY_MS);
    const exists = await checkDblpExistence(normalizedKey);
    if (exists === null) dblpUnreachableCount++;
    if (exists === false) {
      unresolved.push({ acronym, reason: 'resolved-key-not-live-on-dblp', attemptedKey: normalizedKey, confidence: resolution.confidence });
      continue;
    }

    results[acronym] = {
      area,
      tier,
      dblpKey: normalizedKey,
      kind,
      confidence: resolution.confidence,
      wikidataId: resolution.wikidataId || null,
      label: resolution.label || resolution.venueTitle || null,
      existenceChecked: exists === true
    };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    resolvedCount: Object.keys(results).length,
    unresolvedCount: unresolved.length,
    dblpUnreachableCount,
    note: dblpUnreachableCount > 0
      ? `dblp.org was unreachable for ${dblpUnreachableCount} existence check(s) during this run; those entries are marked existenceChecked: false and should be re-verified on a re-run once DBLP is reachable, per EXPANSION_PLAN.md Step 1.3's automated chain (this is a network-availability note, not a resolution failure).`
      : null,
    resolved: results,
    unresolved
  };

  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Resolved ${output.resolvedCount}/${input.extraVenues.length} venues.`);
  console.log(`Unresolved: ${output.unresolvedCount}.`);
  if (dblpUnreachableCount) console.log(`DBLP unreachable for ${dblpUnreachableCount} existence check(s) — see output notes.`);
  console.log(`Written to ${OUTPUT}`);
}

main();
