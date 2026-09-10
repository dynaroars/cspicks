# CS Conference Metadata Sweep

Resume by reading `AGENTS.md` and `MAINTENANCE.md`, then continue in batches of
about 20 records. For every metadata batch: use official sources, inspect the
diff, run `npm test`, `npm run typecheck`, `npm run build`, and
`npx playwright test test/e2e/csconfs.spec.js`, then commit and push directly to
`main`.

## Completed and pushed

- `cc768c6` — NSDI, ASPLOS, CAV, CCS, EuroSys, CHI, CVPR.
- `7361d29` — FAST, USENIX Security, EMNLP.
- `395f18f` — corrected ACM CCS series links.
- `2bab469` — ICFP, MobiCom cleanup, PLDI/POPL/SIGMOD series links.
- `c6fd4bf` — ICLR and The Web Conference.
- `c4b665a` — ICML 2027 region and SIGIR series link.
- `fb8a762` — NeurIPS 2026 and ICML 2026 link.
- `325ff65` — SIGMOD/PODS 2027 cycle dates and feedback windows.
- `ee66276` — MobiCom, MobiSys, and NDSS 2027 details.
- `7939675` — removed unsupported ECCV 2027 projection.
- `82415ae` — SIGGRAPH, SIGGRAPH Asia, and SIGCOMM 2027 details.
- `efee29a` — cleaned unsupported ICML/NeurIPS 2027 projections.
- `77a9d36` — official series links for AAAI, SIGCOMM, SIGGRAPH, SIGGRAPH Asia,
  MobiCom, and MobiSys editions.

Documentation consolidation commits `0a4ff25` and `8e10e56` removed the old
scattered Markdown instructions; use `MAINTENANCE.md` as the single playbook.

## Remaining watch list

The current audit is complete. Continue monitoring these items during the
weekly/monthly maintenance sweep, and update only when official pages publish
new facts:

- MobiCom 2027: place is still unpublished; the official page has the summer
  cycle dates and leaves the winter cycle TBA.
- MobiSys 2027: Ho Chi Minh City is confirmed, but dates and submission
  details remain unpublished on the official series page.
- SIGCOMM 2027: event, place, and chairs are confirmed; submission and
  notification dates remain TBA.
- SIGGRAPH Asia 2027: Tokyo, dates, and conference chair are confirmed;
  submission dates remain unannounced.
- AAAI 2028, ASPLOS 2028, CAV 2028, CCS 2028, CHI 2028, EuroSys 2028,
  SIGMOD 2028, and SOSP 2028: no validated official edition announcement;
  their unsupported projected dates and links were removed.
- ASE, UIST, EMNLP, ISCA, and MICRO 2027: no validated official edition
  schedule was available during this sweep; do not infer one.

## Current state

The sweep batches are committed on `main` after each validation pass. The
latest validation passed all unit tests, typecheck, build, and 2 CS Confs
browser tests.
