# EXPANSION_PLAN.md — CORE A / CORE A* publication coverage

## Goal (and explicit non-goals)

**Goal:** when a user selects the "CORE A*" or "CORE A/A*" conference-set filter on
the Search page, faculty rankings/metrics should reflect publications in the
*additional* CORE A/A* venues that CSRankings itself does not track — not just a
re-slice of venues CSRankings already counts.

**Non-goals — do not do these:**
- **Do not discover new faculty.** The faculty roster stays exactly what
  `csrankings.csv` / `generated-author-info.csv` already define (~34,617 rows,
  some of which are alias rows for the same person). This project only adds
  *more publications* for people already in that roster.
- Do not change historical affiliation (that's `professor_history_openalex.json`'s
  job, unrelated to this).
- Do not touch `csrankings-default` or `all-union`/CSRankings-only behavior —
  this only affects the `core` and `core-a` conference-set options.
- Do not invent a new counting methodology — reuse CSRankings' own adjusted-count
  formula (`1 / #authors` per paper, summed) so CORE A/A* numbers are comparable
  in kind to the existing CSRankings-sourced numbers.

## Why the current CORE A/A* options don't do anything today

`src/data/conference-sets.ts` already *declares* `coreAMap` (91 venues) and
`coreAStarMap` (58 venues), but the actual data CS Picks fetches at runtime
(`generated-author-info.csv`, mirrored via `loadData()`) only contains **78
areas total — exactly CSRankings' own tracked venue set**
(`parentMap` ∪ `nextTier`, verified by pulling the live CSV and diffing area
values). None of the CORE-only venues are present in that CSV, so selecting
"CORE A" or "CORE A*" today silently produces the same numbers as
`csrankings-default`/`csrankings` minus nothing — the extra map entries are
dead weight until this plan's dataset exists.

Computed diff (script in Step 1 reproduces this):

```
EXTRA_VENUES = (coreAMap ∪ coreAStarMap) − (parentMap ∪ nextTier)
             = 86 venues today, e.g.:
  aamas acmmm acsac aied aistats alenex asiacrypt assets bmvc bpm cade caise
  ccc cgo ches cidr cikm colt conext cp cscw csf dis disc dsn eacl ease ecai
  ecir ecoop er esa esem esop esorics fc foga fpga gd gecco hotos icaps icdar
  icdcs icdm icdt icer icme icsa icsoc icws icwsm ijcar infocom interspeech
  ipdps ipsn islped ismar issre iswc itc itcs iui kr lak miccai middleware
  mmsys msr percom pets podc ppsn re recsys sat sdm seams sigspatial soups
  stacs tacas uai wacv wsdm
```

These 86 are the venues this project needs publication counts for. (`pets` is
already a stray leak into the live CSV per the code comment in
`conference-sets.ts` — verify at implementation time whether it needs special
handling or can be treated as already-covered.)

## Data source decision: bulk DBLP dump, not per-author API calls

Two options were considered:

| | **A. Live DBLP API per faculty** (reuse `fetchAuthorStats` in `src/dblp.ts`) | **B. Bulk `dblp.xml.gz` dump + local filter** (recommended) |
|---|---|---|
| Requests | ~34,617 author lookups + profile fetches, serialized at DBLP's rate limit (`src/dblp.ts` already paces itself at ~1.2s/request for the simulator) | 1 download (~4GB+ compressed, updated periodically by DBLP) |
| Runtime | Realistically 12+ hours of continuous querying, resumable across days like `build-openalex-history.js` already does for OpenAlex | Minutes to ~1-2 hours of local streaming parse, one-shot |
| Identity resolution | Requires resolving each roster name to a DBLP pid via the author-search API — an extra fuzzy-match step per name | None — the dump's own `<author>` text nodes are the same disambiguated "Name 0001" strings already sitting in `csrankings.csv`'s `name` column, so matching is a direct set-membership check |
| Precedent | New pattern, but code (`fetchAuthorStats`) already exists for it | Exactly what CSRankings' own build pipeline does (`Makefile` downloads `dblp.xml.gz`, C++/Python tooling filters it) — we're just adding a wider venue map on the same input |
| Risk | Rate-limit churn, partial-failure bookkeeping at faculty scale | One large streaming-XML pass; must not attempt to load the file into memory (`DOMParser` won't work — needs a SAX/stream parser) |

**Decision: Option B.** Download the full DBLP dump once (per refresh cycle),
stream-parse it, and emit rows only for `(author name ∈ roster) AND (venue ∈
EXTRA_VENUES)`. This sidesteps DBLP's live rate limits entirely and reuses the
exact same identity space CSRankings already committed to `csrankings.csv`.

Live-API `fetchAuthorStats` logic remains valuable as a **cross-check tool**
(Step 6) — spot-verify a handful of faculty's counts from the bulk parse
against a live per-author fetch — but should not be the production pipeline.

## Step-by-step plan

### Step 1 — Freeze and validate the extra-venue list

1. Write a small script (`scripts/list-core-extra-venues.mjs`) that imports
   `parentMap`, `nextTier`, `coreAMap`, `coreAStarMap` from
   `src/data/conference-sets.ts` and computes `EXTRA_VENUES` as above. Commit
   its output as a reviewable artifact, not just a mental diff.
2. Cross-check `EXTRA_VENUES` against the official CORE rankings portal
   (https://www.core.edu.au/conference-portal, CORE2023 or latest) via its
   own export/API rather than eyeballing the site — CORE's list changes
   between editions and CS Picks' maps may already be stale or missing
   venues. This step produces the authoritative acronym + full-name list that
   Step 3 resolves against; it is a data pull, not a manual audit.
3. **Resolve the DBLP stream key for every `EXTRA_VENUES` entry
   automatically** — DBLP's key often differs from the acronym (e.g. `icaps`
   → `aips`, `acmmm` → `mm`, `sigspatial` → `gis`), so this cannot be assumed
   1:1, but it also should not require hand-checking 86 venues one at a time.
   Build `scripts/resolve-core-venue-keys.mjs` as a chain of automated,
   independent signals, each one only handing off to the next when it can't
   resolve confidently:
   1. **Wikidata lookup (primary).** Many CS conferences have a "DBLP venue
      ID" property (P8926). Run a single SPARQL query against Wikidata's
      endpoint for all 86 official names at once; anything with a P8926 hit
      is resolved with high confidence, no guessing involved.
   2. **DBLP venue-search API (fallback).** For anything Wikidata misses,
      query `https://dblp.org/search/venue/api?q=<full official name>&format=json`
      — search by full name (from Step 1.2's CORE data), not acronym, since
      acronyms collide (e.g. "MM"). Score every returned candidate by string
      similarity between the CORE full name and DBLP's `venue` field; accept
      only the top candidate if it clears a similarity threshold (e.g. 0.8),
      otherwise leave it unresolved rather than guessing.
   3. **Automated existence/activity check.** For every key resolved by (1)
      or (2), fetch `https://dblp.org/db/conf/<key>/` (or `journals/<key>/`)
      and confirm it 200s and lists multiple years/editions — catches a
      plausible-looking but wrong or dead key automatically.
   4. **Post-parse anomaly detection (belt-and-suspenders, in Step 2).**
      Since the bulk parser already streams the entire dump, tally total
      papers-per-year for every resolved key for free and flag implausibly
      low volume or a non-contiguous year history as a likely wrong mapping.
   Anything that fails all four signals goes into a small `unresolved.json`
   report and is **dropped from this round** rather than blocking the
   project or requiring a manual lookup — a missing venue just means that
   venue's papers aren't counted yet, which is strictly better than a wrong
   mapping silently mis-counting faculty.
   Journal-shaped `EXTRA_VENUES` entries (if any) still need the same
   `normalizeDblpVenue`-style issue/volume handling already present in
   `src/dblp.ts` for TOG/CGF/TVCG/etc. — the resolution chain above should
   also record whether a resolved key is `conf/*` or `journals/*` so Step 2
   knows which entries need that extra handling.
   Output: a committed, script-generated mapping table, e.g.
   `src/data/core-extra-venue-dblp-keys.generated.json`, `{ acronym: {
   dblpKey, kind: 'conf'|'journals', confidence, source } }` — regenerated by
   rerunning the script, not hand-edited, mirroring how
   `csrankings-rules.generated.js` is treated as a rebuildable artifact.

### Step 2 — Acquire and stream-parse the DBLP dump

1. Download `https://dblp.org/xml/release/dblp.xml.gz` (and the matching
   `dblp.dtd`) — large (multi-GB compressed); do not commit it or any
   intermediate to the repo (`.gitignore` it, same treatment as
   `.openalex-ror-progress.json`).
2. Use a streaming XML parser (e.g. `sax` or `saxes` via npm — DBLP's own
   tooling uses a SAX-style reader for the same reason: the file is too large
   to DOM-parse) reading directly off the gzip stream (Node's `zlib.gunzip`
   pipe) so the raw XML is never fully materialized on disk or in memory.
3. Build an in-memory `Set` of roster names from `generated-author-info.csv`
   (`name` column, already DBLP-disambiguated strings like `A. B. Siddique
   0001`) and a `Map<name, dept>` from `csrankings.csv`/`generated-author-info.csv`
   for the output rows' `dept` field.
4. For each `<article>`/`<inproceedings>` record in the dump:
   - Extract the DBLP key's stream segment (`key="conf/<stream>/..."` or
     `journals/<stream>/...`), map it through the Step 1 table to a CORE
     acronym; skip if not in `EXTRA_VENUES`'s DBLP-key set.
   - For each `<author>` text node, check set membership against the roster
     name set (exact string match — no fuzzy matching needed, since both
     sides are DBLP's own canonical strings).
   - Apply the same "does this actually count as a real paper" filters CS
     Picks already codifies for live DBLP data in `src/dblp.ts`:
     `hasEligiblePageRange` logic (page-count / venue-shape sanity check) and
     any venue-specific special-casing needed once actual `EXTRA_VENUES`
     entries are inspected (most will be plain `conf/*` proceedings and won't
     need `normalizeDblpVenue`'s journal-issue gymnastics, but verify).
   - Compute `adjusted = 1 / authorCount` per paper per matched roster author,
     matching CSRankings' own weighting.
5. Emit one row per `(name, area, year)` aggregate — same shape as
   `generated-author-info.csv`: `name, dept, area, count, adjustedcount, year`
   — to a new generated file, e.g. `public/core-extra-author-info.csv` (or
   `.json` if a keyed-by-name structure is more convenient for the merge step
   in Step 3; CSV keeps the shape symmetric with the file it extends).

This script (`scripts/build-core-extra-pubs.js`) should be structured like
`scripts/build-openalex-history.js`: resumable is less critical here since
it's a single local pass rather than thousands of rate-limited requests, but
still worth checkpointing progress (e.g. last byte offset or last completed
venue) in case the parse is interrupted on a multi-hour run, and worth logging
match counts per venue so a silently-wrong DBLP-key mapping is easy to spot
(a venue that matches 0 papers across 30+ years is almost certainly a wrong
key, not a genuinely unpublishing venue).

### Step 3 — Integrate into the ranking pipeline

**Verified against the actual code** (`src/data.ts`): `professors` is keyed
purely by `name` (from `csrankings.csv`), and `generated-author-info.csv` rows
are matched via `professors[name]` and pushed onto `professor.pubs` as
`{area, year, count, adjustedcount}` — no `dept` field is read in that join.
So:

- The extra CSV's schema can drop `dept` entirely: just
  `name, area, count, adjustedcount, year`, matching only what's actually
  consumed.
- **Merge point matters more than it looks.** `src/data.ts` deletes any
  professor whose `pubs.length === 0` immediately after the `authorInfo`
  forEach loop finishes (`for (const name in professors) { if
  (professors[name]?.pubs.length === 0) delete professors[name]; }`). A
  faculty member with zero CSRankings-tracked publications but real
  CORE-only-venue publications would already be deleted by the time a
  bolted-on later merge tried to attach anything. **The extra rows must be
  concatenated into the same array `authorInfo` is iterated from, before that
  build/delete step runs** — not appended to `professor.pubs` afterward as a
  separate pass.
- Extra rows must never accidentally match the existing `[unit note]`
  annotation regex (`^(.*?)\s+\[([^\]]+)\]$`) applied to `annotatedName` —
  keep generated `name` values as plain roster names with no bracket suffix.

Concretely:

1. In `src/data.ts`, add a lazy loader for the new file, following the same
   pattern Historical Mode uses for `professor_history_openalex.json` — only
   fetched when the user actually selects `core` or `core-a` as the
   conference set, not on every page load.
2. Before the `authorInfo.forEach(...)` block that builds `professor.pubs`,
   concatenate the extra dataset's rows onto the `authorInfo` array when
   `confSet` is `core` or `core-a`, so every downstream step (pub attachment,
   the zero-pubs deletion, `scoreSchools`) sees them as native rows.
3. Confirm `publicationMatchesConferenceSet`/`getConferenceAreaMap` don't need
   changes — they already return `true`/an area for anything in
   `coreAMap`/`coreAStarMap`; the fix here is upstream (making sure the
   *data* backing those areas exists), not the filter logic itself.
4. Double-check no double-counting: a paper in a venue that's in **both**
   CSRankings' set and CORE's set (there is overlap, e.g. `sigcse`, `oopsla`,
   `usenixatc`, `rtas` are in both `parentMap`/`nextTier` and `coreAMap`) must
   only be counted once. Since Step 2's parser only emits rows for
   `EXTRA_VENUES` (already defined as the *non-overlapping* set), this should
   be structurally impossible, but assert it in a unit test (Step 5) rather
   than trusting the invariant silently.
5. Update the existing conference-set help text in `src/filters.ts`
   (`CONF_SET_HELP`, which today honestly warns "Some CORE A/A* venues (e.g.
   TACAS) show no results because CSRankings itself never collects their
   publications, not because of a filter here.") once this dataset ships —
   that caveat becomes partially inaccurate and needs to reflect the new,
   partial-but-real coverage instead of the current all-or-nothing framing.

### Step 4 — Regeneration cadence

Add a new row to `MAINTENANCE.md`'s cadence table, in the spirit of the
existing OpenAlex/NSF entries:

| Cadence | Domain | Action |
|---|---|---|
| **Quarterly, or when DBLP publishes a new dump** | CORE A/A* extra publications | `node scripts/build-core-extra-pubs.js` (re-download dump, re-parse, overwrite `public/core-extra-author-info.csv`) |

Quarterly matches the existing NSF full-sync cadence and is reasonable given
DBLP's own release cadence (dumps are refreshed roughly monthly, but faculty
rosters and CORE rankings themselves don't change fast enough to justify more
frequent reruns).

### Step 5 — Tests

- `test/unit/`: schema test for `public/core-extra-author-info.csv` (same
  shape assertions as the existing `generated-author-info.csv` schema test),
  a test asserting `EXTRA_VENUES` (from Step 1's script) has zero overlap with
  `parentMap ∪ nextTier`, and a merge test that a synthetic extra-pubs row for
  a known-fixture faculty member shows up in `core`/`core-a` results but not
  in `csrankings-default`/`all-union` results.
- `test/e2e/`: extend the Search spec (or add a small new case) asserting that
  switching the conference-set selector to "CORE A*" changes at least one
  visible ranking number relative to the default set, for a school/area known
  to have coverage in the extra dataset.

### Step 6 — Spot-check against the live API

Before trusting the bulk-parsed dataset, pick ~10-20 faculty across a few
`EXTRA_VENUES` (especially ones with tricky DBLP-key mappings from Step 1) and
compare their extra-dataset paper counts against a live call to the existing
`fetchAuthorStats` (temporarily pointed at a `confSet` that includes only
those venues) for the same person. Mismatches point at either a wrong DBLP-key
mapping (Step 1) or a parser bug (Step 2), not a live-API vs. bulk-dump
discrepancy — the dump and the live API are the same underlying DBLP data,
just fetched two different ways.

## Pre-flight checklist (do before writing Step 1's code)

- **New dependency needed.** No streaming XML parser is currently in
  `package.json` (only `papaparse`/`he`/`chart.js` at runtime, `vite`/
  `playwright`/`typescript` for dev). Add a SAX-style parser (e.g. `sax`) as a
  **devDependency**, since this script only runs at maintenance time and must
  never ship in the app bundle — same treatment as other maintenance-only
  tooling.
- **`scripts/check-project-size.mjs` guards a hardcoded file list** (currently
  `professor_history_openalex.json`, `nsf-awards.json`, `school-aliases.json`
  at a 40 MiB cap). Add `public/core-extra-author-info.csv` to that list once
  it exists, even though it's expected to be small (it's the roster ∩
  86-venue intersection, not the full dump).
- **Confirm DBLP's dump terms allow this use** — DBLP explicitly publishes
  `dblp.xml.gz` for bulk reuse/research, but do a one-line sanity check of
  their current terms page before building a script around it, same as any
  other upstream data dependency this repo already leans on.
- **Decide rollout visibility**: ship the new dataset and immediately update
  `CONF_SET_HELP` (Step 3.5), or land it quietly and update the copy in a
  follow-up once real coverage numbers can be sanity-checked in production.
  Recommend updating the help text in the same PR — shipping a fix without
  updating the text that describes the old limitation is the kind of drift
  this repo's own conventions (see AGENTS.md's "Adding a new Discovery" note
  about keeping methodology text honest) call out explicitly.

## Open questions to resolve before implementation

1. Does the current `coreAMap`/`coreAStarMap` need a refresh against the
   latest official CORE ranking edition before building on top of it, or is
   it considered current? (Step 1.2 addresses this, but flagging because it
   changes the venue list this whole project targets.)
2. Are any `EXTRA_VENUES` entries actually journals rather than conference
   proceedings on DBLP (affecting whether `normalizeDblpVenue`'s
   issue/volume-based disambiguation logic needs to be ported into the bulk
   parser)?
3. Storage format for the output — CSV (symmetric with
   `generated-author-info.csv`, trivial union) vs. a more compact per-faculty
   JSON (smaller if most faculty have zero extra-venue papers, which is
   likely the common case). Recommend starting with CSV for pipeline
   simplicity and revisiting if file size becomes a concern (`postbuild`
   already strips large data files from `dist/`, so runtime bundle size isn't
   the constraint — fetch-on-demand latency for Historical-Mode-style lazy
   loading is).
