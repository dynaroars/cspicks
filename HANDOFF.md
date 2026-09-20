# HANDOFF — CORE A/A* publication coverage expansion

Written mid-session. Read [EXPANSION_PLAN.md](EXPANSION_PLAN.md) first for the
full design — this file is "where things stand right now and what to do
next." Delete this file once the work it describes is finished and merged.

## Goal (restate before doing anything else)

Extend CS Picks' faculty publication counts to cover CORE A/A* venues that
CSRankings' own data doesn't track, **for the existing CSRankings faculty
roster only** — no new-faculty discovery, no changes to historical
affiliation, no changes to `csrankings-default`/`all-union` behavior. Only
the `core`/`core-a` conference-set filters are affected.

## Status: Steps 1-3.5 done and committed (on `main`, no branch)

Steps 1 (venue-list freeze), 2 (DBLP dump parser → `public/core-extra-author-info.csv`),
3 (integration into `src/data.ts`/`src/filters.ts`), and 3.5 (help text) are
**done**. What's left is Step 4 (already partly done — see below), Step 5
(partly done), and Step 6 (manual spot-check, not started).

### Step 2 recap (dump parser) — two real bugs found and fixed this session

1. `sax.createStream(false, {...})` uppercases every tag/attribute name in
   non-strict mode unless `lowercase: true` is also passed — without it the
   parser silently produced 0 records. Fixed.
2. **The output CSV's `area` column held the wrong value.** The script wrote
   `venueMeta.area` (the already-resolved research area, e.g. `mlmining`)
   instead of `venueMeta.acronym` (the venue key, e.g. `aistats`). This
   matters because `generated-author-info.csv`'s own `area` column is
   actually a **venue key**, not a research area — `src/data.ts`'s
   `publicationMatchesConferenceSet`/`getConferenceAreaMap` look venue keys
   up in `coreAMap`/`coreAStarMap` (which are keyed by acronym) to resolve
   the area *at query time*. With the bug, every row in the CSV would have
   silently failed that lookup and never matched any conference-set filter —
   the entire dataset would have been dead weight. **Caught by writing the
   Step 3 e2e test** (see below), not by inspection — if you're auditing
   this again, the giveaway is: does `row.area` look like `icse`/`aistats`
   (venue key) or like `plan`/`mlmining` (research area)? It must be the
   former.
   Fixed in `scripts/build-core-extra-pubs.js`: the row-bucket key and the
   `area` field both now use `venueMeta.acronym`; the accepted/rejected
   filter in `main()` now filters by acronym (`Object.keys(accepted)`)
   instead of by area.
3. Also fixed (lower-stakes): unresolved/guessed venues previously got
   `area: null`; a `KNOWN_KEY_OVERRIDES` table was added for 8 guessed
   acronym→DBLP-key mismatches confirmed by hand against the real dump
   (`acmmm→mm`, `icaps→aips`, `sigspatial→gis`, `csf→csfw`,
   `itcs→innovations`, `disc→wdag`, `pets→pet`, `ccc→coco`).

Current real output (regenerated after the acronym fix, against
`.dblp-dump/dblp-2026-09-01.xml.gz`, 8.4M dump records): **85 of 86**
EXTRA_VENUES accepted, **166,393 rows**, ~5.9MB, committed at
`public/core-extra-author-info.csv`. The one rejection, `ijcar`, is a
correct exclusion (real DBLP key, but only 2 years of history since IJCAR
only became a standalone series in 2024 — genuinely too new to clear
`MIN_DISTINCT_YEARS = 3`, not a wrong mapping).

### Step 3 (integration into `src/data.ts`/`src/filters.ts`) — done

**The critical correctness constraint** (already flagged before this
session, verified empirically to matter a lot: **13,652 of 34,617 roster
members have zero CSRankings-tracked publications, and 4,969 of those do
have a CORE-only-venue publication** — not a rare edge case):

- `src/data.ts`'s `loadDataFromSources()` **no longer deletes** professors
  whose `pubs.length === 0` after the `authorInfo.forEach` loop. This is
  intentional and behavior-preserving for every existing view:
  `collectFilteredData`'s own `inRange.length === 0 → continue` already
  excludes anyone with no publications matching a given query, so a
  zero-pub professor is invisible in every confSet exactly as before. The
  only observable difference is that `rawData.professors[name]` now
  resolves to a `{pubs: []}` object instead of `undefined` for these ~13.6k
  people (used by `main.ts`'s "vs researcher" link validation and
  `analysis.ts`'s direct lookup) — a minor, arguably-more-correct edge case,
  not a behavior regression for rankings/search.
- New `loadCoreExtraPubs()` in `src/data.ts` — lazy singleton (mirrors
  `loadAffiliationData()`), fetches `${GITHUB_RAW}/core-extra-author-info.csv`,
  returns `Map<string, Publication[]>` keyed by name.
- `collectFilteredData`/`filterByYears` gained an optional trailing
  `corePubsMap` parameter. When `confSet` is `core` or `core-a` **and** the
  map is loaded, a professor's extra pubs are concatenated with their base
  `pubs` **at query time**, before the year/confSet filter runs — this
  works precisely because professors are no longer deleted at load time.
  `all-union`/`csrankings-default`/`csrankings` never see the extra data
  (per EXPANSION_PLAN.md's explicit non-goal), even though `all-union`'s own
  `publicationMatchesConferenceSet` already unions in CORE venues by area —
  that inconsistency is deliberate, matching the plan's stated scope; revisit
  only if asked.
- `src/filters.ts`: `coreExtraPubs` module-level cache + `loadCoreExtraPubsMap()`,
  a `corePubsMap` getter on `FilterController` (only non-null when
  `confSet` is core/core-a), wired into `apply()`. The `#conf-set` `<select>`
  now has its own `change` listener (split out from the
  region/years group) that awaits the load, disabling the select
  meanwhile — mirrors the History toggle's async pattern. `ready()` also
  loads it eagerly if a shared URL already has `confSet=core`/`core-a`.
- `CONF_SET_HELP` in `src/filters.ts` updated to describe the new coverage
  (85 of 86 extra venues; IJCAR is the one exception) instead of the old
  all-or-nothing "CSRankings never collects these" framing. **Note**: this
  text hardcodes "85"/"IJCAR" — if a future quarterly rerun changes which
  venues clear the plausibility bar, update this text too (see the new
  MAINTENANCE.md section 2.5, which calls this out).

### Step 5 (tests) — partly done

Done:
- `test/unit/data.test.js`: merge test (`CORE-extra publications only
  surface for a professor under core/core-a...`), zero-overlap test
  (`EXTRA_VENUES ... never overlap CSRankings-tracked venues`), and a CSV
  schema test that specifically asserts `row.area` looks like a venue key,
  not a research area (this is the regression test for the Step 2 bug above
  — don't weaken it).
- `test/e2e/search.spec.js`: new fixture roster member `Cora Coreman` /
  `Core Extra University` with zero base pubs and one `core-extra` pub
  (venue `aistats`), plus a test asserting she's invisible under the default
  view and visible under `core-a`. **This test is what caught the Step 2
  acronym-vs-area bug** — when editing this fixture or the merge logic
  again, keep in mind `selectOption('core-a')` doesn't wait for the async
  extra-data fetch; the test waits for `#conf-set` to re-enable first.

Not done:
- No dedicated e2e case for `confSet=core` (only `core-a` is covered) —
  low priority, `core` is a subset of `core-a`'s logic path.

### Step 4 (regeneration cadence) — mostly done

- `MAINTENANCE.md` gained a cadence-table row and a full "2.5. CORE A/A*
  extra publications" section with the exact regen command
  (`npm run core-extra:build-pubs -- <path-to-dump>`) and a reminder to
  check `CONF_SET_HELP`'s hardcoded venue count after every regen.
- `package.json` gained a `core-extra:build-pubs` script alias and
  `postbuild` now also strips `dist/core-extra-author-info.csv` (fetched
  from raw GitHub at runtime, not bundled — same treatment as
  `professor_history_openalex.json`).
- `scripts/check-project-size.mjs` guards `public/core-extra-author-info.csv`
  (~5.9MB today, 40MB cap).

### Step 6 — not started

A human should do a manual, regular-browser spot-check (not scripted —
Anubis) comparing ~10-20 faculty across a few EXTRA_VENUES against their
real DBLP profile page. Not done this session.

## Everything currently passes

`npm test` (80/80 unit tests), `npx playwright test` (39/39 e2e across every
page), `npm run typecheck` (clean). `npm run check:size` reports one
**pre-existing, unrelated** failure (`src/styles/components/results-cards.css`
over the 600-line limit) — not touched this session.

## Quick resume checklist for the next session

1. Read `EXPANSION_PLAN.md` in full.
2. Read this file.
3. `git status` / `git log --oneline -10` to confirm nothing changed
   underneath since this was written.
4. Remaining work, in priority order: Step 6 (manual DBLP spot-check —
   needs a human), then optionally a `confSet=core` e2e case, then delete
   this file once the whole plan is considered shipped.
