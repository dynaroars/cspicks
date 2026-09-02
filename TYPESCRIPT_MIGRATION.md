# TypeScript migration

This file is the durable handoff for the incremental JavaScript-to-TypeScript migration.
Each completed phase is committed separately to `main`. Resume at the first unchecked phase,
run the listed verification commands, and update this file in the same commit.

## Status

- [x] Phase 0 — tooling and CI guardrails
- [x] Phase 1 — shared domain types and typed external-data boundaries
- [x] Phase 2 — foundation modules (`shared`, data helpers, `data`, metrics)
- [ ] Phase 3 — shared UI infrastructure and page controllers (in progress)
- [ ] Phase 4 — strict mode, remaining tests/scripts as appropriate, final CI gate

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

Resume with analysis helpers. Convert `main`, `simulator`, `funding`, grants entry modules, and
other page controllers after their dependencies.

### Phase 4

Enable strict options incrementally, resolve all remaining diagnostics, decide whether manual
scripts merit conversion, and keep typechecking mandatory in CI.
