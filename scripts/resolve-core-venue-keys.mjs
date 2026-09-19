#!/usr/bin/env node
/**
 * resolve-core-venue-keys.mjs
 *
 * EXPANSION_PLAN.md Step 1.3: automatically resolve each CORE-only venue
 * acronym (from scripts/data/core-extra-venues.json) to its DBLP stream key,
 * without hand-verification.
 *
 * Resolution source: Wikidata's "DBLP venue ID" (P8926) claim, looked up via
 * the plain REST API (wbsearchentities + wbgetentities) — the SPARQL query
 * service proved less reliable to reach in practice, so the plain REST
 * endpoints are used instead.
 *
 * This deliberately does NOT query dblp.org itself. dblp.org runs "Anubis",
 * an anti-bot proof-of-work wall that returns an explicit Access Denied page
 * to headless/scripted clients (confirmed while building this — plain
 * fetch() gets connection resets, and a real headless Chromium context gets
 * an explicit Anubis denial page rather than DBLP content). That's a
 * deliberate access control DBLP put up specifically to stop scripted
 * querying, so this script does not attempt to evade it (no fingerprint
 * spoofing, no stealth-automation workarounds) — DBLP already publishes a
 * sanctioned bulk-access channel for exactly this kind of use: the full
 * `dblp.xml.gz` dump. EXPANSION_PLAN.md Step 2 downloads that dump anyway to
 * build the actual publication-count dataset, so the "does this resolved key
 * really exist, and does it have real volume" cross-check that would
 * otherwise need a live DBLP existence check is folded into that same dump
 * pass instead (see Step 2) — free byproduct of the one download, no second
 * network dependency on dblp.org at all.
 *
 * Anything Wikidata can't resolve confidently is written to `unresolved`
 * with reason `no-wikidata-signal` and picked up by Step 2's dump-based
 * cross-check, not guessed at here.
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch with retries + backoff; returns null (not a throw) if every attempt fails,
 *  since a single dead lookup must not kill the whole run. */
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

/** Wikidata P8926 lookup via the REST API. Returns `null` if the acronym
 *  matched nothing on Wikidata at all; `{ ambiguous, candidates }` if
 *  multiple unrelated venues share the acronym and can't be disambiguated
 *  automatically; otherwise a resolved `{ dblpKey, ... }`. */
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

async function main() {
  const input = JSON.parse(await readFile(INPUT, 'utf-8'));
  const results = {};
  const unresolved = [];

  for (const { acronym, area, tier } of input.extraVenues) {
    await sleep(WIKIDATA_SEARCH_DELAY_MS);
    const resolution = await resolveViaWikidata(acronym);

    if (resolution?.ambiguous) {
      unresolved.push({ acronym, reason: 'ambiguous-wikidata-matches', candidates: resolution.candidates });
      continue;
    }

    if (!resolution?.dblpKey) {
      unresolved.push({ acronym, reason: 'no-wikidata-signal' });
      continue;
    }

    const kind = resolution.dblpKey.startsWith('journals/') ? 'journals' : 'conf';
    const normalizedKey = resolution.dblpKey.includes('/') ? resolution.dblpKey : `conf/${resolution.dblpKey}`;

    results[acronym] = {
      area,
      tier,
      dblpKey: normalizedKey,
      kind,
      confidence: resolution.confidence,
      wikidataId: resolution.wikidataId,
      label: resolution.label,
      // Not yet cross-checked against real DBLP data — Step 2's dump parse
      // does this for free per EXPANSION_PLAN.md; treat as provisional
      // until that pass confirms nonzero, multi-year publication volume.
      existenceChecked: false
    };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    resolvedCount: Object.keys(results).length,
    unresolvedCount: unresolved.length,
    note: 'Resolved via Wikidata only (P8926 "DBLP venue ID"); dblp.org itself was not queried — see file header on Anubis. Existence/volume cross-checks for these keys, and DBLP-search-based resolution for entries in `unresolved`, happen during Step 2\'s dump parse instead.',
    resolved: results,
    unresolved
  };

  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Resolved ${output.resolvedCount}/${input.extraVenues.length} venues via Wikidata.`);
  console.log(`Unresolved (deferred to Step 2's dump cross-check): ${output.unresolvedCount}.`);
  console.log(`Written to ${OUTPUT}`);
}

main();
