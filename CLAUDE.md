# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CS Picks is a static, client-side web app for exploring CS professors, schools, and research areas — an
accompanying tool to the *PhD Demystify* book (https://github.com/dynaroars/phd-cs-us), aimed at prospective
PhD applicants. No backend: all data is fetched client-side from CSRankings' GitHub-hosted CSVs and static
JSON files in `public/`, then processed in the browser.

## Commands

```bash
npm run dev       # vite dev server at http://localhost:5173/
npm test          # run the Node.js unit tests (test/data.test.js)
npm run test:e2e  # Playwright e2e tests (test/e2e/); auto-starts the dev server on :4173
npm run build      # production build to dist/ (multi-page: index, simulator, funding)
npm run preview    # preview the production build
```

Run a single Node unit test with `node --test-name-pattern="<substring>" test/data.test.js` (it's plain
`node:test`, not a runner with its own CLI). The suite covers core data filtering, ranking, CSV errors,
NSF attribution, and rendering safety; no linter is configured. `postbuild` strips large data files
(`professor_history_openalex.json`, `school-aliases.json`, `data/`) from `dist/` since those are fetched from
raw GitHub at runtime rather than bundled.

Data-generation scripts (run manually, not part of the build):
```bash
node scripts/build-openalex-history.js [--test --limit=10]  # rebuilds public/professor_history_openalex.json via OpenAlex API
node scripts/build-school-aliases.js                         # rebuilds public/school-aliases.json (OpenAlex → CSRankings name mapping)
npm run sync:csrankings-rules                                 # rebuilds src/csrankings-rules.generated.js from upstream CSRankings' area/venue rules
npm run sync:nsf:all                                          # re-queries the NSF API for every faculty/institution pair (hours)
npm run sync:nsf -- --school "<name>"                          # scoped NSF sync for one institution
npm run sync:nsf:rebuild                                       # rebuilds public/nsf-awards.json from the local NSF cache, no API calls
npm run og:image                                                # regenerates public/og-image.png via Playwright/Chromium
npm run sitemap                                                 # regenerates public/sitemap.xml from the current roster
node scripts/paper-stats.mjs                                    # regenerates paper/stats.json (the figures cited in paper/main.tex) from live data
```
`scripts/daily-openalex-sync.sh` is a cron entry point (not run by hand) that drives the OpenAlex ROR-capture
backfill in daily batches and auto-commits/pushes on success.

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
  (the tabbed analysis panel, imported directly — no window globals or custom events). It also renders
  the Discoveries view (`?view=discoveries`, surfaced via the "🔭 Discoveries" nav link) in place of the
  normal search UI, reusing the same `filters` controller and `loadData()` call rather than standing up a
  second page: the header, filter bar, search box, and examples are identical to Search, but the default
  landing state puts the insight-card grid (`#discovery-stats`, inside `<main>`) where the university/
  faculty lists would otherwise sit. Typing an actual search still runs normally and replaces the cards
  with real results (`hideDiscoveryCards()` in `main.js`) — Discoveries is a landing-state swap, not a
  separate search experience. `src/discoveries.js` exports the pure rendering (`renderDiscoveries`) and
  URL/meta helpers (`discoveriesParams`, `getDiscoveriesMeta`) that `main.js` drives. Computation for its
  insights lives in `src/metrics.js` (university-level) and is never done inline — see "Adding a new
  Discovery" below.
- `simulator.html` + `src/simulator.js` — standalone ranking-impact workflow for adding, transferring, or
  removing faculty. Pure name-matching and rank-impact calculations live in `src/simulation.js`;
  `src/dblp-search-ui.js` renders the DBLP candidate-search UI.
- `nsf.html` + `src/funding.js` — standalone NSF funding search over the synchronized snapshot in
  `public/nsf-awards.json`. Attribution and card rendering live in `src/nsf.js`; Discoveries also reads it
  for its funding sections. Search itself carries no NSF data and never loads the snapshot.
- `grants.html` + `src/grants/main.js` — standalone CS research awards, fellowships, and grants explorer
  over the database in `public/grants.json` (industry gifts, NSF calls, DARPA, DOE, DoD, foundations, societies).
- `grants-submit.html` + `src/grants/submit.js` — single unified submission/correction form for proposing
  new CS research awards or updating existing entries via GitHub Issue or email.
- `FAQ.md` — GitHub-hosted FAQ, methodology, limitations, and data documentation. `PRODUCT.md` has the
  brand/design-principles brief (tone, anti-references, accessibility bar) worth checking before UI/CSS work.

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
- `src/metrics.js` — the school/researcher/subfield metrics layer built on top of `data.js`'s filtered
  output: per-school metrics (movement, momentum, concentration, breadth, collaboration proxy), per-capita
  ranking, rank-stability variants, area-vs-area comparison, and the Discoveries insight calculators
  (`calculateDiscoveryInsights`, `calculateSubfieldDiscoveries`, `buildPriorPeriodData`). Consumed by
  `analysis.js`/`analysis-ui.js`, `discoveries.js`, and `scripts/paper-stats.mjs` alike, so it's the one
  place derived-metric logic should live rather than being duplicated per page.
- `src/analysis-ui.js` — shared HTML-rendering helpers (metric cards, labeled tooltips) used by the
  Search-page analysis panel; keeps `analysis.js` focused on orchestration.
- `src/seo.js` / `src/share.js` / `src/analytics.js` — growth/discoverability infra used by every page:
  `seo.js` keeps `<title>`/description/canonical/OpenGraph tags in sync with the on-screen view, `share.js`
  is the reusable Copy Link / Web Share control, and `analytics.js` fires opt-in, no-op-by-default usage
  events (see README's Analytics section — nothing here talks to a network without a configured provider).
- `src/csrankings-rules.js` (+ generated `src/csrankings-rules.generated.js`) — the area/venue taxonomy
  (venue aliases, CORE tier membership) mirrors upstream CSRankings' own Python source rather than being
  hand-maintained; `npm run sync:csrankings-rules` re-derives the generated file, which is the fallback
  used until/unless a client-side sync overrides it.
- `src/dblp-cache.js` — IndexedDB-backed cache for DBLP profile lookups (DBLP rate-limits hard and a
  lookup costs ~3s); degrades to a cache miss rather than throwing in Node or private browsing.

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

**Charts**: Chart.js throughout, colors driven by OS color scheme (`prefers-color-scheme: dark/light`), synced via
`updateChartDefaults()` in `shared.js` and `onThemeChange()` in `charts.js`.

**No build-time data fetching** — CSRankings data is fetched at page load, while OpenAlex data is fetched on
demand when Historical Mode is enabled. `postbuild` deliberately excludes the large local copies from `dist/`.

## Adding a new Discovery

Discoveries must be reproducible from the same data every other page uses — never hardcoded or hand-picked.
1. **Compute it** in `src/metrics.js`: add a case to `calculateDiscoveryInsights` (university-level) or
   `calculateSubfieldDiscoveries` (region-wide, per area), or a new pure function alongside them if the shape
   differs. Compare a current period against the equal-length prior period via `buildPriorPeriodData`, apply
   a minimum-evidence guard so a tiny denominator can't dominate the list, and return a ranked, capped
   (`limit`, default 5) array.
2. **Render it** in `src/discoveries.js` via the shared `card(title, help, body, className)` helper — it
   slugifies the title into a stable `id` (`discovery-<slug>`), wires the ⓘ tooltip from `help`, and adds a
   Copy Link button for free. Use `schoolLink()`/`areaLink()` to link names back into Search.
3. **Add a unit test** in `test/unit/` asserting ranking/thresholds.

Keep the `help` text honest about methodology (thresholds, "prior period" definition, exclusions) — it's the
only methodology note most readers see.

## 💰 Crawling & Updating CS Research Awards, Grants & Fellowships (`public/grants.json`)

The `grants.html` explorer reads from `public/grants.json` and supports user submissions/corrections via `grants-submit.html`. Future AI agents can systematically discover, verify, and update funding opportunities using this standardized workflow without having to re-analyze the whole system:

### 1. Targeted Web Search Queries by Category
When searching the web for new calls, updated deadlines, or funding programs, run these high-yield query patterns:

- **Federal Agencies (Faculty & Lab Solicitations)**:
  - NSF: `"NSF CAREER solicitation computer science"`, `"NSF CRII solicitation CISE"`, `"NSF CISE Core programs medium small"`, `"NSF SaTC Secure and Trustworthy Cyberspace"`, `"NSF AI Institutes"`, `"NSF FRR Foundational Research in Robotics"`, `"NSF SHF Software Hardware Foundations"`, `"NSF CPS Cyber-Physical Systems"`, `"NSF POSE Open-Source Ecosystems"`
  - DARPA: `"DARPA Young Faculty Award YFA solicitation"`, `"DARPA I2O open BAA HR001126S0001"`, `"DARPA Disruptioneering Disruption Opportunities"`, `"DARPA MTO open BAA"`
  - DOE: `"DOE Early Career Research Program FOA computer science"`, `"DOE ASCR open FOA"`, `"DOE SciDAC partnerships institutes"`, `"DOE Quantum Information Science Centers"`, `"DOE ARPA-E open energy computing"`
  - DoD / Service Labs: `"ONR Young Investigator Program YIP"`, `"AFOSR Young Investigator Program BAA"`, `"ARO Early Career Program Scientists Engineers"`
  - NIH & NASA: `"NIH R01 computer science biomedical AI"`, `"NASA Early Career Faculty CS robotics"`

- **Student Fellowships & Early-Career Grants (Undergrad, Master's, PhD)**:
  - Federal / National: `"NSF Graduate Research Fellowship Program GRFP"`, `"DoD NDSEG Fellowship National Defense Science Engineering"`, `"DOE CSGF Computational Science Graduate Fellowship"`, `"DOE NNSA SSGF Stewardship Science"`, `"DOE NNSA LRGF Laboratory Residency"`, `"NSF CyberCorps Scholarship for Service SFS"`, `"DoD SMART Scholarship"`, `"NASA Space Technology Graduate Research Opportunities NSTGRO"`, `"NSF REU Sites Computer Science"`
  - Industry PhD Fellowships: `"Google PhD Fellowship computer science"`, `"Meta Research PhD Fellowship"`, `"Microsoft Research PhD Fellowship"`, `"Microsoft Research Ada Lovelace Fellowship"`, `"Apple Scholars in AI/ML PhD Fellowship"`, `"NVIDIA Graduate Fellowship Program"`, `"Amazon PhD Fellowship"`, `"Jane Street Graduate Research Fellowship"`, `"Two Sigma PhD Fellowship"`, `"IBM PhD Fellowship Program"`, `"Qualcomm Innovation Fellowship QInF"`, `"Adobe Research Fellowship"`, `"Bloomberg Data Science PhD Fellowship"`, `"Snap Research Fellowship"`, `"Gen Digital Symantec Graduate Fellowship"`
  - Foundations & Societies: `"Hertz Foundation Graduate Fellowship computing"`, `"National GEM Consortium Graduate Fellowship"`, `"Ford Foundation Predoctoral Fellowship"`, `"CRA Outstanding Undergraduate Researcher Award"`, `"CRA-WP Graduate Research Fellowship"`, `"ACM Doctoral Dissertation Award"`, `"NCWIT Collegiate Award"`

- **Tech Industry Faculty Awards & Academic RFPs**:
  - Google: `"Google Research Scholar Program faculty"`, `"Google Academic Research Awards"`
  - Microsoft: `"Microsoft Research Faculty Fellowship"`, `"Microsoft Accelerate Foundation Models"`
  - Meta: `"Meta Research RFP grants AI systems security"`
  - Amazon: `"Amazon Research Awards ARA call for proposals"`
  - NVIDIA: `"NVIDIA Academic Hardware Grant"`, `"NVIDIA Applied Research Accelerator"`
  - Frontier AI Labs: `"OpenAI Researcher Access Program academic"`, `"OpenAI academic frontier model grants"`, `"Anthropic researcher access program"`
  - Other Industry: `"<Company> Research Award OR Faculty Fellowship computer science"` (Adobe, Qualcomm, IBM, Sony Research Award, Samsung GRO, Bloomberg, Cisco, Snap, Broadcom)

- **Prestigious Foundations & Non-Profits**:
  - `"Alfred P. Sloan Research Fellowships Computer Science"`, `"David and Lucile Packard Fellowships Science Engineering"`, `"Simons Investigators Theoretical Computer Science"`, `"Schmidt Sciences AI2050 Fellowships"`, `"Burroughs Wellcome Fund Career Awards at the Scientific Interface CASI"`

### 2. Standardized Audience Taxonomy
In `targetAudience`, always use these exact strings to ensure dropdown filters work correctly:
- `"Faculty"`: Tenure-track, tenured, and research faculty.
- `"PhD Students"`: Doctoral candidates.
- `"Undergraduate Students"`: College undergraduates and rising seniors.
- `"Master's Students"`: MS / professional graduate students.
- `"Postdocs"`: Postdoctoral scholars and fellows.

### 3. Schema Specification for `public/grants.json`
Every entry in `public/grants.json` MUST adhere to this structure:
```json
{
  "id": "unique-kebab-case-id",
  "name": "Full Formal Name of Award or Solicitation",
  "shortName": "Concise Short Name",
  "sponsor": "Sponsoring Agency or Company (e.g. NSF, Google Research, DARPA, DOE)",
  "sponsorCategory": "Government | Industry | Non-Profit / Foundation | Professional Society",
  "targetAudience": ["Faculty", "PhD Students", "Undergraduate Students", "Postdocs"],
  "whoFor": "Clear, human-readable audience description (e.g., 1st/2nd-year PhD students, Untenured Assistant Professors)",
  "deadline": "Clear description of deadline / cycle (e.g., Annual (Late October), Rolling / Open)",
  "deadlineMonth": 10,
  "amount": "Funding amount and perks (e.g., $37,000/yr stipend + tuition, $500,000+ over 5 years)",
  "summary": "1-2 sentence description of scope, purpose, and research goals.",
  "eligibility": [
    "Key eligibility rule 1 (e.g. US citizenship / international eligibility)",
    "Key eligibility rule 2 (e.g. university enrollment or tenure-track status)"
  ],
  "topics": ["AI/ML", "Systems", "Security", "Theory", "Robotics", "HPC", "Quantum"],
  "url": "https://official-program-or-rfp-url.org",
  "featured": true
}
```
*Note on `deadlineMonth`*: Set to `1..12` for the primary annual deadline month, or `0` for rolling/year-round/open calls (used for chronological sorting).

### 4. Reviewing User Submissions (`grants-submit.html`)
When a user submits a new award proposal or edit via `grants-submit.html`:
1. The submission generates structured JSON with the official URL, name, sponsor, audience, and eligibility details.
2. Review the cited official program URL to verify legitimacy, deadline cycle, and funding terms.
3. Add or update the corresponding record in `public/grants.json`.
4. Run validation commands below before committing.

### 5. Verification & Validation Commands
After adding or modifying grants in `public/grants.json`:
```bash
npm test                                            # Runs test/unit/*.test.js (asserts schema completeness, unique IDs, and filter integrity)
npm run build                                       # Verifies Vite multi-page bundle compilation
npx playwright test test/e2e/grants.spec.js test/e2e/grants-submit.spec.js  # Runs Playwright E2E verification
```

## Testing notes

- `test/unit/*.test.js` uses Node's native test runner (`node --test`).
- `test/e2e/*.spec.js` uses Playwright to test all pages (`index.html`, `simulator.html`, `csconfs.html`, `csconfs-submit.html`, `grants.html`, `grants-submit.html`, `nsf.html`).


