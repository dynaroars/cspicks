# Data sweep — latest checks (2026-10-10)

## Reviewed in this continuation

- UCSD: all 19 captured adjacent candidate details reviewed; 13 postings added, five excluded and one deferred. Committed as `8075f91`.
- Georgia Tech: Computing/ECE hiring indexes and recorded ECE all-areas detail read; one posting refreshed. Individual Computing ads, ECE HI/AP and broader adjacent units remain pending.
- Awards: eight industry/foundation records reviewed and corrected. IBM current-cycle pause, NVIDIA academic applications closure, Qualcomm staged 2027 North America application, Packard funding/eligibility and Hertz eligibility/reference dates documented. Apple invitation-only terms and historical Simons terms remain partial.
- Conferences: 40 existing cycle records corrected; 13 missing cycle/edition records added across software, vision/robotics and databases. Source conflicts and unsupported statistics retained as explicit gaps.

Exact before/after evidence is in the adjacent `data-sweep-*-evidence-2026-10-10.json` files. The authoritative overall progress ledger is `data-sweep-2026-10-10.json`.

## Existing jobs dataset audit (2026-10-11)

- Schema audit of all 390 job records found unsupported track and level values, 25 invalid area-tag sets, two missing `areas` arrays, and one unsupported visa-sponsorship value. Invalid required fields would make the strict Jobs parser reject the dataset; invalid area tags also fail to match area filters.
- Corrected the records and reran a read-only schema/taxonomy check: zero invalid records or area keys, with unique IDs and URLs. No test suite was run in this continuation.
- Exact record-level changes are in `data-sweep-jobs-schema-audit-2026-10-11.json`.

## Verification

All checks passed after the final dataset edits:

- `npm test`: 16 passed, zero failures.
- `npm run typecheck`: passed.
- `npm run build`: passed; generated 676 university and 27 research-area SEO pages.
- `npx playwright test test/e2e/jobs.spec.js test/e2e/grants.spec.js test/e2e/grants-submit.spec.js test/e2e/csconfs.spec.js`: 21 passed.
- `git diff --check`: passed.
- `node scripts/check-project-size.mjs`: passed.

Build requires network access for the existing SEO generator; its optional upstream alias CSV parse warning does not prevent generation. No app code or tests changed.

## Overall coverage remains incomplete

- Jobs: 201 school sources — 4 audited, 10 partial, 187 pending.
- Conferences: 161 series — 20 schedule-audited, 23 partial, 2 partial statistics checks, 116 pending.
- Awards: 191 records — 23 audited, 4 core-facts audited, 3 new audited, 9 partial, 152 pending.

Captured URLs are not counted as audited until their content is read and compared. This checkpoint does not complete the full sweep.
