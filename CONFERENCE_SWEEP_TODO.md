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

## Next research targets

Prioritize current/upcoming records with missing or suspect official details:

- SIGCOMM 2027: verify whether notification dates are published; Atlanta and
  organizing chairs are confirmed.
- MobiCom 2027: verify place when the official site announces it.
- MobiSys 2027: place is confirmed as Ho Chi Minh City; all dates remain TBA.
- SIGGRAPH Asia 2027: Tokyo/date confirmed; submission dates remain unannounced.
- AAAI 2028, ASPLOS 2028, CAV 2028, CCS 2028, CHI 2028, EuroSys 2028, SIGMOD
  2028, SOSP 2028: check official future-edition announcements; do not infer
  dates or places.
- ASE 2027, UIST 2027, EMNLP 2027, SIGIR 2027, ISCA 2027, MICRO 2027,
  IJCAI 2027, and NAACL 2027: audit edition links and missing fields.
- OSDI/NSDI, IEEE S&P, FAST, VLDB, ICDE, SIGMETRICS, and other multi-cycle
  records: fill rebuttal/notification dates only from official CFP pages and
  apply shared metadata to every cycle.

## Current state

`main` was clean and synced after `77a9d36`. The last validation passed all
unit tests, typecheck, build, and 2 CS Confs browser tests.

