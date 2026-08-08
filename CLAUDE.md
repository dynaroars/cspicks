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
npm run build      # production build to dist/ (multi-page: index, analysis, compare, faq)
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
```

## Architecture

**Multi-page app, one entry module per HTML page** (wired in `vite.config.js` as separate rollup inputs):
- `index.html` + `src/main.js` (~2750 lines) — main search page: professor/school/area/conference search,
  historical mode, the ranking-impact **simulator** (add/remove candidate faculty and see rank deltas), DBLP
  live author search.
- `analysis.html` + `src/analysis.js` — school-level analysis dashboard (rank trends, area growth, faculty
  diversity, subfield effort, AI growth, conference trends). Tab-based, each tab lazily renders its own chart.
- `compare.html` + `src/compare.js` — side-by-side two-school comparison across research areas.
- `faq.html` — static methodology page, no dedicated JS module.

Each page module independently calls `loadData()` and `filterByYears()` on load — there's no shared app state
or router between pages; navigation is plain `<a href>` between static HTML files.

**Data pipeline (`src/data.js` is the core of the app):**
1. `loadData()` fetches three CSVs directly from `raw.githubusercontent.com/emeryberger/CSrankings` at
   runtime (csrankings.csv, generated-author-info.csv, institutions.csv) and joins them into
   `{ professors, schools }` keyed by name.
2. `filterByYears(data, startYear, endYear, region, historyMap, aliasMap, confSet, useRaw)` is the main
   query/aggregation function — filters publications by year range and conference set (CSRankings default /
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
