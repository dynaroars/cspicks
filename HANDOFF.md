# HANDOFF — CORE A/A* publication coverage expansion

Written mid-session because the user is about to run out of tokens. Read
[EXPANSION_PLAN.md](EXPANSION_PLAN.md) first for the full design — this file
is just "where things stand right now and what to do next." Delete this file
once the work it describes is finished and merged.

## Goal (restate before doing anything else)

Extend CS Picks' faculty publication counts to cover CORE A/A* venues that
CSRankings' own data doesn't track, **for the existing CSRankings faculty
roster only** — no new-faculty discovery, no changes to historical
affiliation, no changes to `csrankings-default`/`all-union` behavior. Only
the `core`/`core-a` conference-set filters are affected.

## Big constraint discovered this session — read this before writing any code

**`dblp.org` runs Anubis, an anti-bot proof-of-work wall, and it actively
denies scripted/headless clients** — confirmed for both the live search API
and the `dblp.xml.gz` dump download URL. Do not write code that tries to
evade this. The dump must be **downloaded manually by a human in a regular
browser** and handed to scripts as a local file path. Never have a script
try to fetch it. (Already done for this session — see below.)

## Status: what's done and committed (on `main`, no branch)

1. `EXPANSION_PLAN.md` — full design doc, source of truth for design
   decisions.
2. `scripts/list-core-extra-venues.mjs` + committed output
   `scripts/data/core-extra-venues.json` (86 CORE A/A* venues CSRankings
   doesn't track).
3. `scripts/resolve-core-venue-keys.mjs` — resolves acronyms to DBLP stream
   keys via Wikidata P8926. Output gitignored
   (`scripts/data/core-venue-dblp-keys.json`, regenerate anytime); resolves
   ~29-49 of 86 depending on Wikidata reachability, rest handled by Step 2.
4. **`scripts/build-core-extra-pubs.js` — Step 2's dump parser. Written,
   validated against the real dump, and its output committed this session.**
   What changed from the earlier draft:
   - **Fixed a real bug**: `sax.createStream(false, {...})` (non-strict mode)
     uppercases every tag/attribute name unless you also pass
     `lowercase: true`. Without it, `PUB_TYPES.has(node.name)` (`'article'`,
     `'inproceedings'`) never matched anything and the whole parse silently
     produced 0 records. Fixed by adding `lowercase: true` to the sax
     options — **do not remove this**, it's not cosmetic.
   - **Fixed a second bug**: venue-key entries built from Step 1's
     `unresolved` list only guessed a `conf/<acronym>` key for two of the
     three `reason` values Step 1 actually emits (a naming mismatch between
     the two scripts), silently skipping most unresolved venues. Now every
     unresolved entry gets a guess attempt regardless of `reason` — the
     downstream volume-plausibility check is what actually guards against a
     bad guess, so gating on `reason` was redundant and buggy.
   - **Added a `KNOWN_KEY_OVERRIDES` table** for guessed acronym→key
     mismatches confirmed by hand against the real dump content (`zcat
     dblp-2026-09-01.xml.gz | grep ...`), not guessed: `acmmm→conf/mm`,
     `icaps→conf/aips`, `sigspatial→conf/gis`, `csf→conf/csfw`,
     `itcs→conf/innovations`, `disc→conf/wdag`, `pets→conf/pet`,
     `ccc→conf/coco`. (`conf/ccc` exists in DBLP but is an unrelated,
     long-dead 1991-only venue — not CCC/Computational Complexity, which
     lives at `conf/coco`.)
   - Also fixed: unresolved/guessed venues previously got `area: null`
     (only Wikidata-resolved entries carried an area) — now falls back to
     `scripts/data/core-extra-venues.json`'s acronym→area map, which is
     authoritative for all 86 acronyms regardless of resolution path.
   - Real run against `.dblp-dump/dblp-2026-09-01.xml.gz` (~1.1GB gz,
     8.4M dump records, `sax` streaming, ~90s):
     **85 of 86 EXTRA_VENUES accepted**, 153,556 output rows. The one
     rejection (`ijcar`) is a correct exclusion, not a bug: DBLP's real
     `conf/ijcar` key only has 2 years of history (2024, 2026) because IJCAR
     only became a standalone series recently (previously colocated/merged
     with other venues under different keys) — genuinely too new to clear
     the `MIN_DISTINCT_YEARS = 3` plausibility bar, not a wrong mapping.
   - Spot-checked output: e.g. Vincent Conitzer (well-known AAMAS/AI
     researcher) shows up with plausible per-year AAMAS counts.
   - Output: `public/core-extra-author-info.csv` (153,556 rows, `name, area,
     count, adjustedcount, year`, ~5.4MB — committed) and
     `scripts/data/core-extra-pubs-report.json` (accepted/rejected report —
     committed, same treatment as `core-extra-venues.json`).
5. `scripts/check-project-size.mjs` — added `public/core-extra-author-info.csv`
   to the guarded-file list (40 MiB cap; it's ~5.4MB today).
6. `package.json` — `sax` devDependency (already added, now committed with
   lockfile), new `core-extra:build-pubs` script alias, and `postbuild` now
   also strips `dist/core-extra-author-info.csv` (same treatment as
   `professor_history_openalex.json`/`school-aliases.json` — it'll be fetched
   from raw GitHub at runtime once Step 3 wires that up, not bundled).
7. `.gitignore` — `.dblp-dump/` added (the local dump download).
8. `npm test` — all 77 tests pass. `npm run check:size` reports one
   **pre-existing, unrelated** failure (`src/styles/components/results-cards.css`
   over the 600-line limit) — not touched this session, don't fix it as part
   of this work unless asked.

The DBLP dump used: `.dblp-dump/dblp-2026-09-01.xml.gz` (~1.1GB, September
2026 snapshot) and `.dblp-dump/dblp-2023-06-28.dtd`. Both gitignored, still
on disk for a future rerun if needed.

## Not started yet — Step 3 onward from EXPANSION_PLAN.md

This is the next thing to pick up. Everything below is unstarted.

- **Step 3 (integration into `src/data.ts`)** — the trickiest remaining part.
  Already verified against the actual code, don't re-derive:
  - `professors` is keyed by `name` only; pub rows are matched via
    `professors[name]` and pushed as `{area, year, count, adjustedcount}` —
    no `dept` field, matching the new CSV's schema (no `dept` column, by
    design).
  - **Critical correctness bug to avoid**: `src/data.ts` deletes any
    professor whose `pubs.length === 0` immediately after the
    `authorInfo.forEach(...)` loop. The new extra-venue rows **must be
    concatenated into the same array `authorInfo` is iterated from, before
    that loop runs** — not attached to `professor.pubs` afterward.
  - Lazy-load `public/core-extra-author-info.csv` the same way Historical
    Mode lazy-loads `professor_history_openalex.json` (fetched from
    `GITHUB_RAW`, only when `confSet` is `core` or `core-a` — see
    `src/data.ts` around line 239 for the existing pattern to mirror).
  - Double-check no double-counting: `EXTRA_VENUES` is defined as
    CSRankings-tracked-venues minus CORE-declared-venues, so structurally a
    paper can't be in both; still worth a unit test asserting this rather
    than trusting it silently (see Step 5).
- **Step 3.5**: update `CONF_SET_HELP` in `src/filters.ts` — it currently
  has an honest disclaimer about CORE A/A* venues showing no results; that
  becomes partially inaccurate once Step 3 ships and needs to describe the
  new partial-but-real coverage (85 of 86 extra venues, not all CORE venues
  in general) instead.
- **Step 4**: add a `MAINTENANCE.md` cadence row — quarterly/on-new-dump, a
  human downloads a fresh dump via browser, then runs
  `npm run core-extra:build-pubs -- <path-to-dump>` (or
  `node scripts/build-core-extra-pubs.js <path>` directly) to regenerate
  `public/core-extra-author-info.csv`.
- **Step 5**: tests (`test/unit/` schema + merge tests — assert the merge
  point behavior above, assert `EXTRA_VENUES` has zero overlap with
  `parentMap ∪ nextTier`; `test/e2e/` Search spec extension).
- **Step 6**: a *manual*, human-in-a-regular-browser spot-check comparing a
  handful of faculty's extra-dataset counts against their real DBLP profile
  page (not scripted — Anubis).

## Quick resume checklist for the next session

1. Read `EXPANSION_PLAN.md` in full (Step 3 section especially).
2. Read this file.
3. `git status` / `git log --oneline -10` to confirm nothing changed
   underneath since this was written.
4. Start Step 3: wire `public/core-extra-author-info.csv` into
   `src/data.ts`'s lazy-load + merge pipeline, following the Historical Mode
   pattern and respecting the pre-delete merge-point constraint above.
