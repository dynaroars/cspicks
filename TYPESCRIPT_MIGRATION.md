# TypeScript migration

This file is the durable handoff for the incremental JavaScript-to-TypeScript migration.
Each completed phase is committed separately to `main`. Resume at the first unchecked phase,
run the listed verification commands, and update this file in the same commit.

## Status

- [x] Phase 0 — tooling and CI guardrails
- [x] Phase 1 — shared domain types and typed external-data boundaries
- [ ] Phase 2 — foundation modules (`shared`, data helpers, `data`, metrics)
- [ ] Phase 3 — shared UI infrastructure and page controllers
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

### Phase 3

Convert shared controllers and UI utilities before page entry modules. Update HTML entry paths
only if Vite requires it; `.js` paths normally resolve converted `.ts` sources.

### Phase 4

Enable strict options incrementally, resolve all remaining diagnostics, decide whether manual
scripts merit conversion, and keep typechecking mandatory in CI.
