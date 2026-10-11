# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, Cursor, Aider, etc.) working in this repository.

## Repository workflow

- Commit directly to `main` by default.
- Do not create a feature branch unless the user explicitly requests one.
- Never commit crawl/audit evidence or ledger files (e.g. `docs/data-sweep-*`). Put evidence in the commit message
  or PR description; per-school crawl state already lives in `scripts/data/jobs-sources.json`.
- Exception: scheduled/unattended routine runs follow [docs/AUTOMATION.md](docs/AUTOMATION.md) instead —
  producers open PRs (never push to `main`) and stop at their batch cap; the auditor routine merges.

## What this is

CS Picks is a static, client-side web app for exploring CS professors, schools, and research areas — an
accompanying tool to the *PhD Demystify* book (https://github.com/dynaroars/phd-cs-us), aimed at prospective
PhD applicants. No backend: all data is fetched client-side from CSRankings' GitHub-hosted CSVs and static
JSON files in `public/`, then processed in the browser.

## Commands

```bash
npm run dev       # vite dev server at http://localhost:5173/
npm test          # run the Node.js unit tests (test/unit/*.test.js)
npm run test:e2e  # Playwright e2e tests (test/e2e/); auto-starts the dev server on :4173
npm run build      # production build to dist/ (multi-page: index, simulator, funding, csconfs, grants, jobs)
npm run preview    # preview the production build
```

Run a single Node unit test with `node --import tsx --test --test-name-pattern="<substring>" test/unit/<file>.test.js` (it's plain
`node:test`, not a runner with its own CLI). The suite covers core data filtering, ranking, CSV errors,
NSF attribution, and rendering safety; no linter is configured. `postbuild` strips large data files
(`professor_history_openalex.json`, `school-aliases.json`, `core-extra-author-info.csv`, `data/`) from `dist/`
since those are fetched from raw GitHub at runtime rather than bundled.

Every data-refresh workflow (conferences, grants, jobs, NSF, affiliations, CSRankings-derived data) has one
playbook in `TASKS/`; [**MAINTENANCE.md**](MAINTENANCE.md) is the index with cadences. Read the relevant
playbook before any data-refresh or web-research task.

## Architecture

**Multi-page app, one entry module per HTML page** (wired in `vite.config.js` as separate rollup inputs):
- `index.html` + `src/main.ts` — Search page. `main.ts` is the page controller only: it owns the data load,
  the filter bar, URL state, and the example chips, then delegates to
  `src/search-results.ts` (result sections, keyword record filtering, DBLP author search), `src/comparison.ts` +
  `src/compare-view.ts` (`A vs B` head-to-head mode), and `src/analysis.ts` + `src/analysis-trends.ts`
  (the tabbed analysis panel, imported directly — no window globals or custom events). It also renders
  the Discoveries view (`?view=discoveries`, surfaced via the "🔭 Discoveries" nav link) in place of the
  normal search UI, reusing the same `filters` controller and `loadData()` call rather than standing up a
  second page: the header, filter bar, search box, and examples are identical to Search, but the default
  landing state puts the insight-card grid (`#discovery-stats`, inside `<main>`) where the university/
  faculty lists would otherwise sit. Typing an actual search still runs normally and replaces the cards
  with real results (`hideDiscoveryCards()` in `main.ts`) — Discoveries is a landing-state swap, not a
  separate search experience. `src/discoveries.ts` exports the pure rendering (`renderDiscoveries`) and
  URL/meta helper (`getDiscoveriesMeta`) that `main.ts` drives. Computation for its
  insights lives in `src/metrics.ts` (university-level) and is never done inline — see "Adding a new
  Discovery" below.
- `simulator.html` + `src/simulator.ts` — standalone ranking-impact workflow for adding, transferring, or
  removing faculty. Pure name-matching and rank-impact calculations live in `src/simulation.ts`.
- `nsf.html` + `src/funding.ts` — standalone NSF funding search over the synchronized snapshot in
  `public/nsf-awards.json`. Attribution and card rendering live in `src/nsf.ts`; Discoveries also reads it
  for its funding sections. Search itself carries no NSF data and never loads the snapshot.
- `csconfs.html` + `src/csconfs/main.ts` (and `csconfs-submit.html` + `src/csconfs/submit.ts`) — CS conference
  schedule explorer over `csconfs/data/conferences.json`.
- `grants.html` + `src/grants/main.ts` — standalone CS research awards, fellowships, and grants explorer
  over the database in `public/grants.json` (industry gifts, NSF calls, DARPA, DOE, DoD, foundations, societies).
- `jobs.html` + `src/jobs/main.ts` — US academic CS jobs explorer over `public/jobs.json`. Modeled on the grants page
  (search box, card list) with keyword filters (`track:`, `dept:`, `level:`, `area:`, `loc:`, `visa:`, `status:`),
  comma-separated alternatives, and a clickable search-help popup in `src/search-keywords.ts`. Legacy filter URL
  params restore as visible keywords. It has CSRankings rank sorts, a position/school view toggle,
  a US state tile map, and a Markdown export of ★ starred postings (in `src/jobs/jobs-render.ts`). `jobs-data.ts`
  owns loading, the active/closed definition (`isActive`: not closed, deadline not passed, or confirmed within 90 days),
  filtering, and grouping; `jobs-render.ts` the cards and map; school rank chips load lazily from `loadData()`. Covers any US
  school (CSRankings seeds the crawl list but is not a requirement), crawled by a scheduled routine (TASKS/jobs.md); queue/seed tooling is
  `scripts/jobs-maintain.mjs` with state in `scripts/data/jobs-sources.json`.
- `jobs-submit.html` + `src/jobs/submit.ts` — job submission/correction form (a lead channel; crawling is the main source).
- `stats.html` + `src/stats.ts` — site stats (roster, conferences, awards, jobs; never the large NSF snapshot), a CSRankings-default parity check, and
  repository activity from the GitHub API. Every page header links to it via the health icon, between the GitHub and
  ROARS Lab icons (all three share `.icon-link`; `test/unit/consistency.test.js` enforces the header on every page).
- `grants-submit.html` + `src/grants/submit.ts` — single unified submission/correction form for proposing
  new CS research awards or updating existing entries via GitHub Issue or email.
- `README.md` — a deliberately brief overview (features, dev commands, data sources, license); keep it short.

**Shared page infrastructure** — prefer these over per-page copies:
- `src/filters.ts` — `createFilterBar(mount, { fields, years, onChange })` renders the region / year-range /
  conference-set / History controls into a `<div id="filter-bar">`, owns their state, URL params, region
  persistence, and the one-time affiliation-history load. `filters.apply(rawData)` runs `filterByYears`
  with the right history maps; `filters.toParams()` writes the shared URL shape. Every page uses it, so
  the control ids (`#region-select`, `#start-year`, `#end-year`, `#conf-set`, `#historical-mode`) are the
  same everywhere.
- `src/charts.ts` — the only module that imports Chart.js. `drawChart(canvas, previous, config)` merges
  shared defaults and destroys the previous chart; `onThemeChange(fn)` re-renders on light/dark switches.
- `src/style.css` — the one shared stylesheet every page links (sections in cascade order); page-only CSS sits
  beside its page module (`src/jobs/jobs.css`, `src/grants/*.css`, `src/csconfs/*.css`).
- `src/search-controls.ts` — shared search controller for Search/Discoveries, Funding, Jobs, Awards, and CS Confs:
  keyword-name/value completion, the clickable ⓘ help popup, input events, `/` shortcut, up to four examples,
  and URL updates. Pages supply their keyword specs, value sources, ordinary suggestion groups, and rendering
  callbacks. `wireSearchInput` also serves the specialized Simulator workflow.
- `src/opportunity-card.ts` + the opportunity-cards section of `src/style.css` — shared Awards/Jobs card
  hierarchy, title/favorite row, organization, type tags, deadline/cycle, metadata, and visual tokens.
  Keep presentation changes here so the two explorers remain familiar across tabs; page renderers supply
  their domain-specific fields and preserve explicit estimated/historical/closed deadline states.
- `src/suggestion-box.ts` — low-level autocomplete keyboard handling, listbox markup, and `A vs B` completion.
- `src/search-keywords.ts` — parsing/alias resolution, quotes, comma alternatives (OR), repeated filters (AND),
  query mutation, and migration of legacy URL filters into visible keywords.
- `src/result-actions.ts` — shared ⋯ card menus for Jobs, Awards, and CS Confs, including copy-link feedback,
  outside-click/Escape dismissal, and the existing correction links; also the Copy Link / Web Share action.
- `src/metrics.ts` — the school/researcher/subfield metrics layer built on top of `data.ts`'s filtered
  output: per-school metrics (movement, momentum, concentration, breadth, collaboration proxy), per-capita
  ranking, rank-stability variants, area-vs-area comparison, and the Discoveries insight calculators
  (`calculateDiscoveryInsights`, `calculateSubfieldDiscoveries`, `buildPriorPeriodData`). Consumed by
  `analysis.ts`/`analysis-trends.ts`, `discoveries.ts`, and `scripts/paper-stats.mjs` alike, so it's the one
  place derived-metric logic should live rather than being duplicated per page.
- `src/favorites.ts` — browser-local ★ favorites used by CS Confs, Awards, and Jobs: stars reorder results
  immediately, `favorites: only` narrows through the search box, and legacy `favorites=only` links migrate
  into that keyword. No favorites dropdowns. Jobs offers Markdown export in its ⋯ menu with two or more
  stars. Dataset settings, maps, analysis, score breakdowns, and methodology are closed by default and
  available on demand; dataset-setting summaries show the active region/year/venue choices.
- `src/seo.ts` / `src/analytics.ts` — growth/discoverability infra used by every page:
  `seo.ts` keeps `<title>`/description/canonical/OpenGraph tags in sync with the on-screen view, and `analytics.ts` fires opt-in, no-op-by-default usage
  events (see README's Analytics section — nothing here talks to a network without a configured provider).
- `src/csrankings-rules.ts` (+ generated `src/csrankings-rules.generated.js`) — the area/venue taxonomy
  (venue aliases, CORE tier membership) mirrors upstream CSRankings' own Python source rather than being
  hand-maintained; `npm run sync:csrankings-rules` re-derives the generated file, which is the fallback
  used until/unless a client-side sync overrides it.

Pages have independent filtered state and use plain `<a href>` navigation. `loadData()` memoizes its promise,
so modules loaded together on Search share one download and parse of the canonical CSRankings inputs.

**Data pipeline (`src/data.ts` is the core of the app):**
1. `loadData()` fetches three CSVs directly from `raw.githubusercontent.com/emeryberger/CSrankings` at
   runtime (csrankings.csv, generated-author-info.csv, institutions.csv) and joins them into
   `{ professors, schools }` keyed by name.
2. `filterByYears(data, startYear, endYear, region, historyMap, aliasMap, confSet)` is the main
   query/aggregation function, built as a three-stage pipeline (`collectFilteredData` → `scoreSchools` →
   `rankSchools`) — filters publications by year range and conference set (CSRankings default /
   All / CORE A / CORE A*), optionally reassigns publications to historical affiliations (see below), and
   computes per-area, per-school rank aggregates. Nearly every view calls this rather than touching raw data.
3. **Historical affiliation mode**: `public/professor_history_openalex.json` (large, generated offline by
   `scripts/build-openalex-history.mjs`) maps professors to their affiliation at time of publication, sourced
   from OpenAlex rather than current CSRankings affiliation. `public/school-aliases.json` bridges OpenAlex
   institution names to CSRankings' abbreviated names. `public/manual_affiliations.csv` holds community
   corrections to bad OpenAlex data, merged in via `mergeAffiliationHistory()`. These assets are loaded only
   when the user enables Historical Mode.
4. **CORE A/A* extra publications**: `public/core-extra-author-info.csv` (generated offline by
   `scripts/build-core-extra-pubs.mjs` from a bulk DBLP dump — see `TASKS/csrankings.md`) covers publications in
   CORE A/A* venues CSRankings' own `generated-author-info.csv` doesn't track, for the existing roster only. Its
   `area` column holds a venue key exactly like `generated-author-info.csv` does (not a resolved research
   area — `getConferenceAreaMap`/`publicationMatchesConferenceSet` resolve that at query time). `loadData()`
   deliberately does **not** delete roster members with zero CSRankings-tracked publications, since a
   meaningful fraction of them (~5,000) only publish in these extra venues and would otherwise never get a
   chance to have this data attached; `collectFilteredData`'s per-query `inRange.length === 0` check already
   keeps them invisible everywhere else. `loadCoreExtraPubs()` lazily fetches and caches this CSV, merged into
   `filterByYears`'s query at the year/confSet-filter step (before ranking) only when `confSet` is `core` or
   `core-a` — see `src/filters.ts`'s `corePubsMap`, loaded the same way Historical Mode lazy-loads its data.
5. Area/conference taxonomy (area labels, parent conference→area map, CORE A/A* conference sets, "next tier"
   conferences) lives as static lookup tables in `src/data.ts` / `src/shared.ts`.

**Other modules:**
- `src/dblp.ts` — live queries to the public DBLP API (author search, per-author publication stats) used by
  the simulator to let users try out hypothetical/real candidate faculty not yet in CSRankings, with an
  IndexedDB cache for profile lookups that degrades to a miss in Node or private browsing.
- `src/shared.ts` — small cross-page utilities: area labels, Chart.js theme colors, name cleanup,
  HTML escaping, inline-value encoding, and external URL validation.

**Charts**: Chart.js throughout, colors driven by OS color scheme (`prefers-color-scheme: dark/light`), synced via
`updateChartDefaults()` in `shared.ts` and `onThemeChange()` in `charts.ts`.

**No build-time data fetching** — CSRankings data is fetched at page load, while OpenAlex data and the
CORE A/A* extra-publications CSV are each fetched on demand (Historical Mode / CORE A/A* conference-set
selection, respectively). `postbuild` deliberately excludes the large local copies from `dist/`.

## Adding a new Discovery

Discoveries must be reproducible from the same data every other page uses — never hardcoded or hand-picked.
1. **Compute it** in `src/metrics.ts`: add a case to `calculateDiscoveryInsights` (university-level) or
   `calculateSubfieldDiscoveries` (region-wide, per area), or a new pure function alongside them if the shape
   differs. Compare a current period against the equal-length prior period via `buildPriorPeriodData`, apply
   a minimum-evidence guard so a tiny denominator can't dominate the list, and return a ranked, capped
   (`limit`, default 5) array.
2. **Render it** in `src/discoveries.ts` via the shared `card(title, help, body, className)` helper — it
   slugifies the title into a stable `id` (`discovery-<slug>`), wires the ⓘ tooltip from `help`, and adds a
   Copy Link button for free. Use `schoolLink()`/`areaLink()` to link names back into Search.
3. **Add a unit test** in `test/unit/` asserting ranking/thresholds.

Keep the `help` text honest about methodology (thresholds, "prior period" definition, exclusions) — it's the
only methodology note most readers see.

## Testing notes

- `test/unit/*.test.js` uses Node's native test runner (`node --test`).
- `test/e2e/*.spec.js` uses Playwright to test all pages (`index.html`, `simulator.html`, `csconfs.html`, `csconfs-submit.html`, `grants.html`, `grants-submit.html`, `jobs.html`, `jobs-submit.html`, `nsf.html`).
