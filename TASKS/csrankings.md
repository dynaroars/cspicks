# CSRankings-derived data

> **`/goal TASKS/csrankings.md`**: Keep the venue taxonomy, CORE A/A* extra publications, sitemap, and OG image in sync with upstream CSRankings and DBLP. Work in bounded batches and open a PR on a
> topic branch for each; never push to `main`. Scheduled runs stop at the cap in
> [docs/AUTOMATION.md](../docs/AUTOMATION.md).

**Unknown beats wrong**: never fill a field from a prior year, a third-party tracker, or a guess.
Validate every batch with `npm test && npm run typecheck && npm run build && git diff --check`.

## Roster & publications (no local maintenance)

`src/data.ts:loadData()` fetches `csrankings.csv`, `generated-author-info.csv`,
`institutions.csv`, plus optional honors/alias CSVs, directly from CSRankings'
`gh-pages` branch at page-load time. There is no local copy to refresh. If
users report load failures:

- Check whether the upstream CSVs actually load (`curl -sI <url>`).
- Check whether a local validator added for one of the runtime-fetched JSON/CSV
  files (`src/data.ts`, `src/types.d.ts`) is stricter than what the generator
  or upstream source actually produces. This has happened before: a strict
  validator required every value in `public/school-aliases.json` to be a
  `string`, but the generator intentionally emits `null` for excluded/unmatched
  institutions (~13% of entries), so every load broke. Cross-check a validator
  against the script that produces the file, not just against current
  consumers, before trusting it.

## Taxonomy / venue rules

```bash
npm run sync:csrankings-rules   # rebuilds src/csrankings-rules.generated.js from upstream CSRankings' Python rules
```

Run after CSRankings adds/renames a conference or changes CORE tier
membership. This is the fallback used until a client-side sync overrides it.

## CORE A/A* extra publications (`public/core-extra-author-info.csv`)

CSRankings' own `generated-author-info.csv` only tracks its own venue set;
selecting the "CORE A*" or "CORE A*/A" conference-set filter also needs
publications in CORE A/A* venues CSRankings doesn't track. That data comes from a bulk DBLP
dump, not a live API. `dblp.org` runs an anti-bot wall (Anubis) that blocks
scripted downloads, but Schloss Dagstuhl mirrors every monthly release, with
md5 checksums, at
`https://drops.dagstuhl.de/storage/artifacts/dblp/xml/<YYYY>/dblp-<YYYY-MM-DD>.xml.gz`
(the DTD sits alongside as `dblp-<version>.dtd`). The quarterly
`.github/workflows/dblp-core-extra.yml` Action does the steps below and opens
a PR; to run them by hand:

1. Download a fresh dump and its matching `.dtd` from the Dagstuhl mirror
   above (or from `https://dblp.org/xml/release/` in a regular browser).
2. `npm run core-extra:build-pubs -- <path-to-dump.xml.gz>` re-parses it and
   overwrites `public/core-extra-author-info.csv` and
   `scripts/data/core-extra-pubs-report.json`.
3. Check the report's `rejected` section: a venue that drops out (implausible
   volume) or a previously-rejected one that now clears the bar changes the
   exact count `src/filters.ts`'s `CONF_SET_HELP` text cites — update that
   text's venue count/example if it drifts.
4. Re-run `npm test` (the CSV schema test in `test/unit/data.test.js` will
   catch a malformed regenerate) and commit the new CSV alongside the
   updated report.

`scripts/resolve-core-venue-keys.mjs` (Wikidata-based acronym→DBLP-key
resolution) can also be re-run independently if CORE's own venue list
changes (`npm run core-extra:resolve-keys`), but doesn't need to run every
quarter — the dump-based parse in `build-core-extra-pubs.js` re-validates and
guesses keys anyway.

## Sitemap & OG image

```bash
npm run sitemap    # regenerates public/sitemap.xml from the current roster
npm run og:image   # regenerates public/og-image.png via Playwright/Chromium
```

Regenerate before a release or whenever the roster/page set has changed
enough that either would visibly drift (new pages, materially different
school/professor counts). Not needed for routine data-only refreshes like
NSF or grants updates.
