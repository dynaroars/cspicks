# TypeScript migration

This file is the durable handoff for the incremental JavaScript-to-TypeScript migration.
Each completed phase is committed separately to `main`. Resume at the first unchecked phase,
run the listed verification commands, and update this file in the same commit.

## Status

- [x] Phase 0 — tooling and CI guardrails
- [x] Phase 1 — shared domain types and typed external-data boundaries
- [x] Phase 2 — foundation modules (`shared`, data helpers, `data`, metrics)
- [x] Phase 3 — shared UI infrastructure and page controllers
- [ ] Phase 4 — strict mode, remaining tests/scripts as appropriate, final CI gate (in progress)

## Decisions

- Keep explicit `.js` module specifiers in source while files are renamed to `.ts`.
  Vite and TypeScript resolve these to TypeScript source, and `tsx` gives the Node unit
  tests the same behavior.
- Type-check browser application code in `src/` and `csconfs/`. Keep one-off scripts
  out of the initial migration scope and revisit them in Phase 4.
- Use `moduleResolution: "Bundler"`, DOM libraries, no emit, and permissive checking
  initially. Enable strictness only after all application modules are converted.
- Treat fetched CSV and JSON as untrusted inputs. Phase 1 must type and validate/narrow
  those inputs at their parsing boundaries instead of relying only on assertions.
- Run `npm test`, `npm run typecheck`, and `npm run build` after every conversion batch.

## Resume instructions

1. Read this file and inspect `git log --oneline -10` and `git status --short`.
2. Start at the first unchecked phase; do not redo completed phases.
3. Preserve `.js` import specifiers unless the module strategy is deliberately changed.
4. Commit the completed phase directly to `main` with this file updated.

## Phase notes

### Phase 0

Adds TypeScript, `tsx`, declarations for Papa Parse and `he`, a permissive browser-oriented
`tsconfig.json`, a standalone `typecheck` command, and test/typecheck gates in deployment CI.

Completed 2026-09-01. Verification passed with Node 24.19.0:

- `npm test` — 8 test files passed
- `npm run typecheck`
- `npm run build` — 88 modules transformed

Next step: begin Phase 1 by inventorying the actual data shapes produced and consumed by
`src/data.js`, then add the type-only module and typed parsing boundaries without renaming files.

### Phase 1

Create a type-only module for the core `Professor`, `Publication`, `School`, raw CSV row,
filtered-data, affiliation-history, NSF-award, and grants shapes. Apply `// @ts-check` to the
data boundary modules and use Papa Parse generics plus runtime narrowing for fetched inputs.

Completed 2026-09-01. Added `src/types.d.ts`, typed the CSV promises feeding `src/data.js`,
enabled JavaScript checking on the ranking/grants/affiliation boundaries, and added runtime
narrowing for grants, NSF awards, and affiliation-history JSON. Malformed grants and NSF
payloads now fail explicitly instead of flowing into the UI. Verification passed:

- `npm test` — 8 test files passed, including new malformed-payload cases
- `npm run typecheck`
- `npm run build` — 88 modules transformed

Next step: Phase 2 starts with `src/shared.js` and dependency-free leaf utilities. Rename a
small batch to `.ts`, preserve `.js` import specifiers, and run all three verification commands
before proceeding to `src/data/*` and `src/data.js`.

### Phase 2

Convert in dependency order: shared/leaf utilities; `src/data/*` and affiliation-history;
`src/data.js`; `src/metrics/math.js`; remaining `src/metrics/*`; the `src/metrics.js` barrel.
Convert one coherent batch at a time and verify after each batch.

Checkpoint 2026-09-01: converted `src/shared.js` to `src/shared.ts` and
`src/affiliation-history-format.js` to `.ts`. Explicit `.js` imports continue to resolve under
TypeScript, `tsx`, and Vite. Verification passed (`npm run typecheck`, `npm test`, and
`npm run build`; 8 test files and 88 bundled modules).

Checkpoint 2026-09-01 (data foundation): converted `src/data/conference-sets.js`,
`src/data/institution-aliases.js`, and `src/data.js` to TypeScript. Added a typed conference-set
union, typed lookup maps, real generic CSV parsing, and concrete raw/filtered data dictionaries.
All three verification commands pass (8 test files, 88 bundled modules).

Completed 2026-09-01: converted all ten modules under `src/metrics/` plus the `src/metrics.js`
barrel. Shared metric entry points now use `RawData`, `FilteredData`, professor/school types,
typed numeric dictionaries, generic math helpers, and explicit rank-stability contracts.
Verification passed (`npm run typecheck`, `npm test`, and `npm run build`; 8 test files and
88 bundled modules).

Next step: Phase 3 should inventory remaining `src/**/*.js` by dependency. Start with leaf
infrastructure (`analytics`, `seo`, `share`, tooltip/cache/chart helpers), then shared controllers
and renderers, and convert HTML page entry modules last.

### Phase 3

Convert shared controllers and UI utilities before page entry modules. Update HTML entry paths
only if Vite requires it; `.js` paths normally resolve converted `.ts` sources.

Checkpoint 2026-09-01: converted the leaf infrastructure modules `analytics`, `seo`, `share`,
`submission`, `charts`, `dblp-cache`, and `tooltip-position` to TypeScript. This added typed
browser analytics globals, metadata/share inputs, generic IndexedDB transactions, Chart.js
configuration and target types, and safe DOM event narrowing. All three verification commands
pass (8 test files, 88 bundled modules).

Checkpoint 2026-09-01 (domain services): converted `csrankings-rules`, `simulation`, `nsf`,
`grants-data`, `grants-render`, and the grants submission adapter. Added explicit CSRankings
rule/issue maps, simulation operations and cloned-school types, funding index/faculty/school
contracts, and typed grants filtering/rendering. Corrected the NSF dataset contract (`scope` is
an array) and the per-capita helper to accept both school maps and arrays. All verification gates
pass (8 test files, 88 bundled modules).

Checkpoint 2026-09-02 (autocomplete and DBLP): converted `suggestion-box`,
`search-suggestions`, `dblp`, and `dblp-search-ui`. Added reusable suggestion item/group
contracts, typed DBLP search/profile/coauthor data, generic serialized request handling, and
safe nullable DOM parsing. All verification gates pass (8 test files, 88 bundled modules).

Checkpoint 2026-09-02 (search and comparison): converted `search-cards`, `search-results`,
`comparison`, and `compare-view`. Added typed card context, scoped professor results,
conference-level school aggregation, and infinite-list state while preserving the existing
module cycle between suggestions and comparison. All verification gates pass (8 test files,
88 bundled modules).

Checkpoint 2026-09-02 (filters): converted the shared filter controller and its persistence
helpers. Added typed filter state/controller options, conference-set normalization, and typed
DOM controls while retaining the existing JavaScript import specifiers. All verification gates
pass (8 test files, 88 bundled modules).

Checkpoint 2026-09-02 (analysis): converted `analysis`, `analysis-ui`, and all eight modules in
`src/analysis/`. Added shared analysis state/target contracts, metric-card inputs, typed chart
and form DOM access, stability-sweep promises, and raw/filtered data boundaries. The conversion
also made two missing `school-trends` data imports explicit. All verification gates pass (8 test
files, 88 bundled modules).

Checkpoint 2026-09-02 (discoveries): converted the discovery renderer and sharing controller.
Added raw-data, NSF-dataset, and filter-controller boundaries; generic card-list rendering; and
safe share-button event/timer handling. All verification gates pass (8 test files, 88 bundled
modules).

Checkpoint 2026-09-02 (main page): converted the primary search/discoveries controller. Typed
its raw/filtered data and lazy-module state, analysis targets, card options, randomized example
helpers, search inputs, and delegated DOM actions. Tightened shared suggestion/search-result
analysis targets to the supported school/researcher union. All verification gates pass (8 test
files, 88 bundled modules).

Checkpoint 2026-09-02 (simulator): converted the simulator controller, candidate analysis, and
candidate results. Added explicit candidate/area-impact shapes, DBLP-profile maps, raw/filtered
data state, school inputs, and typed form/list controls. Added the ambient CSS-module declaration
needed by TypeScript page entries. All verification gates pass (8 test files, 88 bundled modules).

Checkpoint 2026-09-02 (funding): converted the NSF funding page controller. Added typed dataset
coverage metadata, funding index and discriminated comparison targets, suggestion groups, and
safe form/delegated-event handling. All verification gates pass (8 test files, 88 bundled
modules).

Completed 2026-09-02: converted both grants page entry modules. Added typed grant collections,
form fields, filter selects, autocomplete/delegated events, correction prefill, and submission
review links. The only JavaScript source remaining under `src/` is the generated CSRankings-rules
artifact, which remains generated by design. All verification gates pass (8 test files, 88
bundled modules).

Next step: Phase 4 should enable strict compiler options incrementally, resolve the resulting
diagnostics, and decide whether the remaining `csconfs` application JavaScript and manual scripts
belong in the final conversion scope.

### Phase 4

Enable strict options incrementally, resolve all remaining diagnostics, decide whether manual
scripts merit conversion, and keep typechecking mandatory in CI.

Checkpoint 2026-09-02 (strictness baseline): enabled `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `noImplicitOverride`, `noUncheckedIndexedAccess`, and
`useUnknownInCatchVariables`; each passes across the migrated application. The remaining major
gates are `noImplicitAny` (360 diagnostics across 30 files) and `strictNullChecks` (418 across
34 files). Keep tests and manual build scripts in JavaScript; next convert the five `csconfs`
browser modules, then reduce `noImplicitAny` diagnostics by dependency layer before enabling it.

Checkpoint 2026-09-02 (`csconfs`): converted all five conference-schedule browser modules and
added a shared conference record/group contract. Typed schedule filtering, date/deadline helpers,
rendering, autocomplete, and page state. The submission controller now retrieves named controls
through `form.elements`, avoiding collisions with built-in `HTMLFormElement.name` and `.target`.
All verification gates pass (8 test files, 88 bundled modules).

Resume by reducing `noImplicitAny` diagnostics in dependency order, starting with `shared`, data,
and metrics before controllers. Tests and manual build scripts remain JavaScript by design.

Checkpoint 2026-09-02 (`noImplicitAny` shared/leaf pass): typed shared labels, name/URL/date
helpers, repository commit responses, Chart.js default integration, IndexedDB expiry writes,
grant sorting/submission dictionaries, and per-capita rank callbacks. This clears all
`noImplicitAny` diagnostics from `shared`, `dblp-cache`, `dblp-search-ui`, `grants-data`, the
grants submission controller, and `metrics/per-capita`, reducing the total from 366 to 296.
All normal verification gates pass. Resume with `data.ts`, then the remaining metrics modules.

Checkpoint 2026-09-02 (`noImplicitAny` data pass): fully typed `data.ts` loading, honor/alias
maps, affiliation resolution, publication aggregation, school scoring, and generic competition
ranking. Added runtime narrowing for the fetched school-alias JSON. `data.ts` now has zero
`noImplicitAny` diagnostics and the repository total is 232. All normal verification gates pass.
Resume with the remaining metrics modules, led by `metrics/discoveries.ts`.

Checkpoint 2026-09-02 (`noImplicitAny` metrics pass): cleared every remaining metrics diagnostic
by typing generic discovery sorting, regional-area and area-change dictionaries, comparison
verdict inputs, formatting values, and numeric fragility-threshold exits. The repository total is
now 189. All normal verification gates pass. Resume with simulation/DBLP services, then analysis
and page controllers; leave `compare-view` until its comparison-domain contracts are established.

Checkpoint 2026-09-02 (`noImplicitAny` simulation/DBLP pass): cleared all remaining diagnostics
from the DBLP client, simulation engine, candidate analysis, and candidate results. Added a shared
candidate-stat contract compatible with both roster and DBLP records, typed ranking sentinels,
queue callbacks, retry cleanup, and empty-result fallbacks. The repository total is now 172.
All normal verification gates pass (8 test files, 88 bundled modules). Resume with analysis and
page controllers; keep `compare-view` for the final comparison-domain pass.

Checkpoint 2026-09-02 (`noImplicitAny` analysis pass): cleared the analysis controller and all
analysis-helper diagnostics. Reused inferred researcher-pattern and DBLP-coauthor contracts,
typed chart series and stability-table keys, and widened the conference display-name lookup at
its dynamic venue boundary. The repository total is now 144. All normal verification gates pass
(8 test files, 88 bundled modules). Resume with the small page controllers and search cards,
then type `comparison` and `compare-view` together as the final `noImplicitAny` slice.

Checkpoint 2026-09-02 (`noImplicitAny` page-controller pass): cleared the search, funding,
grants, conference-schedule, conference-submission, and search-card diagnostics. Typed shared
suggestion-box handles, page filter state, funding comparison inputs, randomized examples,
conference schedule loading, chart-independent timers, affiliation tuples, and ranking
sentinels. The repository total is now 104, all confined to `comparison.ts` and
`compare-view.ts`. All normal verification gates pass (8 test files, 88 bundled modules).
Resume by typing those two files together, then enable `noImplicitAny` in `tsconfig.json`.

Checkpoint 2026-09-02 (`noImplicitAny` complete): typed the comparison controller and rendering
boundary, including shared entity, chart, scoreboard, verdict, and area-comparison contracts.
The funding page continues to reuse the now-typed scoreboard API. Enabled `noImplicitAny` in
`tsconfig.json`; the repository passes it with zero diagnostics. All normal verification gates
pass (8 test files, 88 bundled modules). Resume Phase 4 by taking a fresh `strictNullChecks`
baseline and reducing it in dependency order before enabling that option.

Checkpoint 2026-09-02 (`strictNullChecks` baseline): with `noImplicitAny` enabled, the fresh
null-safety run reports 639 diagnostics across 41 files. The earlier 418 estimate was taken while
implicit `any` still masked nullable paths, so 639 is the new authoritative baseline. Start with
shared utilities and leaf metrics, then data/domain services, then controllers and renderers;
enable `strictNullChecks` only after the standalone run reaches zero. Continue using
`npx tsc --noEmit --strictNullChecks` to measure progress, with the three normal gates at every
checkpoint.

Checkpoint 2026-09-02 (`strictNullChecks` shared/leaf pass): cleared null-safety diagnostics
from shared locale/region/name helpers and the leaf math, effort, per-capita, school, and
stability metrics. The central `FilteredSchool.rank` contract now explicitly permits `null`,
matching per-capita mode when a department falls below its faculty threshold. The repository
total is now 623. All normal verification gates pass (8 test files, 88 bundled modules).
Resume with `data.ts` and the remaining metrics before moving to services and controllers.

Checkpoint 2026-09-02 (`strictNullChecks` data pass): cleared all null-safety diagnostics from
`data.ts`. CSV ingestion now narrows optional source fields before parsing/indexing, affiliation
and alias lookups have explicit fallbacks, filtered-professor construction iterates known entries,
and ranking/history operations guard indexed values. The repository total is now 578. All normal
verification gates pass (8 test files, 88 bundled modules). Resume with the remaining domain
metrics, then DBLP/simulation services.

Checkpoint 2026-09-02 (`strictNullChecks` metrics pass): cleared all remaining null-safety
diagnostics under `src/metrics/`. Made unavailable ranks explicit in parity/verdict logic,
guarded indexed accumulators and fragility candidates, and encoded the established-school and
Map lookup invariants used by discovery comparisons. The repository total is now 503. All normal
verification gates pass (8 test files, 88 bundled modules). Resume with DBLP, CSRankings rules,
NSF, and simulation domain services before page controllers.
