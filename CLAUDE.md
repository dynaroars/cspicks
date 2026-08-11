# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CS Picks is a static, client-side web app for exploring CS professors, schools, and research areas — an
accompanying tool to the *PhD Demystify* book (https://github.com/dynaroars/phd-cs-us), aimed at prospective
PhD applicants. No backend: all data is fetched client-side from CSRankings' GitHub-hosted CSVs and static
JSON files in `public/`, then processed in the browser.

## Commands

```bash
npm run dev       # vite dev server at http://localhost:5173/cspicks/
npm test          # run the Node.js unit tests
npm run build      # production build to dist/ (multi-page: index, simulator, discoveries, funding)
npm run preview    # preview the production build
npm run deploy      # build + postbuild + publish dist/ to GitHub Pages (gh-pages branch)
```

The Node.js test suite covers core data filtering, ranking, CSV errors, and rendering safety; no linter is configured. `postbuild` strips large data files
(`professor_history_openalex.json`, `school-aliases.json`, `data/`) from `dist/` since those are fetched from
raw GitHub at runtime rather than bundled.

Data-generation scripts (run manually, not part of the build):
```bash
node scripts/build-openalex-history.js [--test --limit=10]  # rebuilds public/professor_history_openalex.json via OpenAlex API
node scripts/build-school-aliases.js                         # rebuilds public/school-aliases.json (OpenAlex → CSRankings name mapping)
npm run sync:nsf:all                                         # re-queries the NSF API for every faculty/institution pair (hours)
```

**Routine upkeep — run this when touching anything NSF-related, and monthly otherwise:**
```bash
npm run sync:nsf:names   # re-resolves NSF names against the current CSRankings roster
```
It costs two CSV downloads and no NSF API access. CSRankings spells some faculty
differently in `csrankings.csv` (what the award sync matched against) than in
`generated-author-info.csv` (what the site keys on); without this refresh, anyone
hired or renamed since the last award sync silently shows no funding. It rewrites
`public/nsf-awards.json` and the reviewable `public/nsf-name-crosswalk.csv`; commit both.
See "Routine Maintenance" in README.md.

## Architecture

**Multi-page app, one entry module per HTML page** (wired in `vite.config.js` as separate rollup inputs):
- `index.html` + `src/main.js` — Search page. `main.js` is the page controller only: it owns the data load,
  the filter bar, URL state, and the example chips, then delegates to
  `src/search-results.js` (result sections), `src/search-suggestions.js` (autocomplete),
  `src/comparison.js` + `src/compare-view.js` (`A vs B` head-to-head mode), and `src/analysis.js`
  (the tabbed analysis panel, imported directly — no window globals or custom events).
- `simulator.html` + `src/simulator.js` — standalone ranking-impact workflow for adding, transferring, or
  removing faculty. Pure name-matching and rank-impact calculations live in `src/simulation.js`.
- `discoveries.html` — standalone tool surfacing notable ranking and funding movements.
- `funding.html` + `src/funding.js` — standalone NSF funding search over the synchronized snapshot in
  `public/nsf-awards.json`. Attribution and card rendering live in `src/nsf.js`; Discoveries also reads it
  for its funding sections. Search itself carries no NSF data and never loads the snapshot.
- `FAQ.md` — GitHub-hosted FAQ, methodology, limitations, and data documentation.

**Shared page infrastructure** — prefer these over per-page copies:
- `src/filters.js` — `createFilterBar(mount, { fields, years, onChange })` renders the region / year-range /
  conference-set / History controls into a `<div id="filter-bar">`, owns their state, URL params, region
  persistence, and the one-time affiliation-history load. `filters.apply(rawData)` runs `filterByYears`
  with the right history maps; `filters.toParams()` writes the shared URL shape. Every page uses it, so
  the control ids (`#region-select`, `#start-year`, `#end-year`, `#conf-set`, `#historical-mode`) are the
  same everywhere.
- `src/charts.js` — the only module that imports Chart.js. `drawChart(canvas, previous, config)` merges
  shared defaults and destroys the previous chart; `onThemeChange(fn)` re-renders on light/dark switches.
- `src/suggestion-box.js` — `createSuggestionBox({ input, listbox, getGroups, onSelect })` owns the
  autocomplete menu's markup, keyboard handling, ARIA state, and the `A vs B` prefix logic (it completes the
  trailing side only and tells `getGroups` it is comparing). Search supplies CSRankings groups through
  `src/search-suggestions.js`; Funding supplies NSF universities, professors, and programs from its own
  index. Both pages mount it on `<div id="universal-suggestions">` inside `.universal-search`.

Pages have independent filtered state and use plain `<a href>` navigation. `loadData()` memoizes its promise,
so modules loaded together on Search share one download and parse of the canonical CSRankings inputs.

**Data pipeline (`src/data.js` is the core of the app):**
1. `loadData()` fetches three CSVs directly from `raw.githubusercontent.com/emeryberger/CSrankings` at
   runtime (csrankings.csv, generated-author-info.csv, institutions.csv) and joins them into
   `{ professors, schools }` keyed by name.
2. `filterByYears(data, startYear, endYear, region, historyMap, aliasMap, confSet)` is the main
   query/aggregation function, built as a three-stage pipeline (`collectFilteredData` → `scoreSchools` →
   `rankSchools`) — filters publications by year range and conference set (CSRankings default /
   All / CORE A / CORE A*), optionally reassigns publications to historical affiliations (see below), and
   computes per-area, per-school rank aggregates. Nearly every view calls this rather than touching raw data.
3. **Historical affiliation mode**: `public/professor_history_openalex.json` (large, generated offline by
   `scripts/build-openalex-history.js`) maps professors to their affiliation at time of publication, sourced
   from OpenAlex rather than current CSRankings affiliation. `public/school-aliases.json` bridges OpenAlex
   institution names to CSRankings' abbreviated names. `public/manual_affiliations.csv` holds community
   corrections to bad OpenAlex data, merged in via `mergeAffiliationHistory()`. These assets are loaded only
   when the user enables Historical Mode.
4. Area/conference taxonomy (area labels, parent conference→area map, CORE A/A* conference sets, "next tier"
   conferences) lives as static lookup tables in `src/data.js` / `src/shared.js`.

**Other modules:**
- `src/dblp.js` — live queries to the public DBLP API (author search, per-author publication stats) used by
  the simulator to let users try out hypothetical/real candidate faculty not yet in CSRankings.
- `src/shared.js` — small cross-page utilities: area labels, Chart.js theme colors, name cleanup,
  HTML escaping, inline-value encoding, and external URL validation.

**Charts**: Chart.js throughout, colors driven by `data-theme` attribute on `<html>` (light/dark), synced via
`updateChartDefaults()` in `shared.js`.

**No build-time data fetching** — CSRankings data is fetched at page load, while OpenAlex data is fetched on
demand when Historical Mode is enabled. `postbuild` deliberately excludes the large local copies from `dist/`.
