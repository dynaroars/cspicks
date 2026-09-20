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

Also added since: an e2e case for `confSet=core` (CORE A* only, fixture
professor "Alan Astar" / "Star Extra University", venue `aamas`) alongside
the existing `core-a` case — both conference-set branches of the merge are
now covered. `AGENTS.md`'s data-pipeline section also now documents
`core-extra-author-info.csv`/`loadCoreExtraPubs()` alongside the existing
Historical Mode writeup.

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

### Step 6 — worksheet prepared, actual check still needs a human

Confirmed again this session (see below): DBLP's Anubis wall really does
block scripted/headless access, even a real Chromium context via Playwright
gets served an explicit "Access Denied" page — not a bug, a deliberate
control, so this project does not attempt to evade it. The comparison itself
has to happen in a human's own regular browser. What *is* done: the
candidate list below, generated from the actual committed dataset, so the
human doesn't have to hunt for what to check — just open each DBLP author
page and compare the total paper count in that venue against the number
here. Prioritized toward `guessed`/`override`-sourced venues (the trickiest
key resolutions, see `KNOWN_KEY_OVERRIDES` in `build-core-extra-pubs.js`),
plus a couple of `wikidata`-resolved (high-confidence) venues as a control
group that should need no correction.

| Name | Venue (DBLP key) | Our total count (all years) | Years in our data |
| --- | --- | --- | --- |
| Milind Tambe | aamas | 140 | 1995-2024 (28 distinct years) |
| Nicholas R. Jennings | aamas | 120 | 1996-2023 (21 distinct years) |
| Tat-Seng Chua | acmmm | 129 | 1994-2025 (27 distinct years) |
| Qingming Huang | acmmm | 90 | 2005-2025 (19 distinct years) |
| Malte Helmert | icaps | 49 | 2002-2023 (19 distinct years) |
| Jörg Hoffmann 0001 | icaps | 43 | 2002-2023 (20 distinct years) |
| Hanan Samet | sigspatial | 72 | 1994-2025 (29 distinct years) |
| Cyrus Shahabi | sigspatial | 49 | 2001-2025 (20 distinct years) |
| David A. Basin | csf | 25 | 2006-2025 (16 distinct years) |
| Stéphanie Delaune | csf | 20 | 2004-2025 (14 distinct years) |
| Mark Braverman | itcs | 15 | 2011-2025 (10 distinct years) |
| Yuval Ishai | itcs | 15 | 2010-2023 (10 distinct years) |
| Rachid Guerraoui | disc | 39 | 1995-2024 (20 distinct years) |
| Hagit Attiya | disc | 34 | 1987-2025 (24 distinct years) |
| Ian Goldberg 0001 | pets | 10 | 2002-2014 (7 distinct years) |
| Claudia Díaz | pets | 8 | 2002-2010 (6 distinct years) |
| Lance Fortnow | ccc | 32 | 1987-2016 (19 distinct years) |
| Russell Impagliazzo | ccc | 27 | 1988-2023 (17 distinct years) |
| Andreas Krause 0001 | aistats | 35 | 2014-2025 (control: wikidata-resolved) |
| Roberto Cipolla | bmvc | 86 | 1989-2023 (control: wikidata-resolved) |
| Mihir Bellare | asiacrypt | 20 | 2000-2024 (control: wikidata-resolved) |

"Our total count" is the sum of the CSV's `count` column (raw paper count,
not adjusted-for-coauthors) across every row for that name+venue pair — that
should line up closely with the number of that venue's entries on the
person's DBLP page (small discrepancies are expected/fine: DBLP dedupes
differently in edge cases, and a mismatch of 1-2 papers isn't a sign of a
wrong key — a mismatch of dozens, or zero when DBLP clearly shows papers,
would be). To regenerate this table after a future dump refresh, use the
node one-liner in this session's transcript (groups `public/core-extra-author-info.csv`
by name+venue, sums `count`, prints top entries per venue) — it's not worth
turning into a committed script since it's a one-off per QA pass, not a
repeated maintenance task.

Independently, these names are also a strong *prior* plausibility check by
domain knowledge alone even before opening DBLP: Tambe and Jennings are
literally AAMAS's founding/most-cited figures, Samet effectively defined the
SIGSPATIAL/GIS community, Guerraoui and Attiya are among DISC's most
published authors, and Fortnow/Impagliazzo are leading complexity
theorists central to CCC — high counts for exactly these people in exactly
these venues is what a correct dataset should produce.

Also tried and deliberately abandoned this session: an automated substitute
using Semantic Scholar's API (not behind Anubis) to cross-check Vincent
Conitzer's AAMAS count. Semantic Scholar's `venue` field turned out to be
too inconsistently populated to trust (only 1 of ~32 known AAMAS papers for
an extremely prolific, well-indexed researcher matched a venue-name regex) —
that's a Semantic Scholar data-quality issue, not evidence of a problem
here, but it means Semantic Scholar can't stand in for the real check either.
Don't re-attempt that shortcut; the DBLP comparison genuinely needs a human
on a real browser.

## Everything currently passes

`npm test` (80/80 unit tests), `npx playwright test` (40/40 e2e across every
page, including both the `core` and `core-a` merge cases), `npm run
typecheck` (clean). `npm run check:size` reports one **pre-existing,
unrelated** failure (`src/styles/components/results-cards.css` over the
600-line limit) — not touched this session.

## Quick resume checklist for the next session

1. Read `EXPANSION_PLAN.md` in full.
2. Read this file, especially the Step 6 worksheet table above.
3. `git status` / `git log --oneline -10` to confirm nothing changed
   underneath since this was written.
4. The only remaining work is Step 6: a human opens each DBLP author page in
   the worksheet table and compares the count. If everything checks out
   (or only off by the expected small margin), the whole
   EXPANSION_PLAN.md is complete — delete this file, and consider updating
   EXPANSION_PLAN.md's own header to note it shipped rather than deleting
   that file too (it's useful design-history context to keep).
