# Handoff: csconfs CORE A/A* expansion + schedule audit

Working doc for resuming this task in a new session. Delete this file once the
work below is finished and folded into normal maintenance.

## Original ask

1. `csconfs` (the CS Conference schedule page) only tracked CSRankings' own
   venue set, missing dozens of CORE A/A* venues (e.g. TACAS) that
   `src/data/conference-sets.ts` already classifies. → **Done.**
2. Search's conference-set filter already supported CORE A*/A (pre-existing),
   just needed a tooltip clarifying that some CORE A venues show zero results
   because CSRankings' own scrape never collected them. → **Done.**
3. Before researching real dates for the 89 newly-added venues, audit the
   **existing** ~67 already-tracked series for accuracy. → **In progress,
   25/67 done.**
4. Then research real dates/deadlines for the 89 new skeleton entries in
   batches. → **Not started.**

## Commits so far (in order)

- `09e4bc3` — added 89 CORE A/A* venues to `csconfs/data/conferences.json` as
  skeleton records (name, venueKeys, description only; verified:false,
  year:2026 placeholder, no dates).
- `dbc78fe` — fixed a self-inflicted bug: the script that added those 89
  records used Python's default `ensure_ascii=True`, which `\uXXXX`-escaped
  every non-ASCII character in the *entire* file. Re-serialized correctly.
  **Lesson: always use `ensure_ascii=False` when writing this file with
  Python's `json.dump`.**
- `66193b5` — added the CORE A/A* coverage-gap note to
  `src/filters.ts`'s `CONF_SET_HELP` tooltip text.
- `3ab6925` — applied confirmed research findings for CGO, DAC, ICCAD,
  Crypto, Eurocrypt, CAV, LICS, ECCV, ACL, and fixed a systematic VLDB bug
  (every submission-cycle record shared the final round's deadline instead
  of its own; also removed 11 stale duplicate 2026 cycle records).
- `90025fb` — found and fixed the same "duplicate cycle got the wrong
  round's data" bug in NSDI 2027, EuroSys 2027, and FAST 2027.

`MAINTENANCE.md` (section 5, "CS Conference schedule") already documents the
audit workflow, evidence-block format, and scope rules — read it before
continuing research. It was updated in `09e4bc3`'s neighboring commit to
mention the CORE A/A* scope expansion.

## Important process note

**Do not spawn subagents/Agent-tool calls for this.** The user explicitly
said "don't launch sub agents, just do in them batches" after a wave of 19
parallel research subagents mostly failed on a rate limit mid-run (some
completed and their findings were applied in `3ab6925`). Do the research
directly with `WebSearch`/`WebFetch` yourself, one batch of conferences at a
time, applying + committing after each batch.

## Recurring bug pattern to keep checking for

Three separate multi-round conferences (NSDI, EuroSys, FAST) each had one
submission-cycle record that was a **mislabeled duplicate of a sibling
cycle's data** instead of having its own round's real dates (e.g. a
"Cycle 1/2" record silently containing Round 2's dates). Found by literally
comparing deadline/abstractDeadline/notificationDate tuples across records
sharing `(name, year)`. Before doing per-conference web research on the
remaining series, rerun this check — it's cheap and catches real errors
without needing any web lookups:

```python
import json
from collections import defaultdict
d = json.load(open('csconfs/data/conferences.json'))
groups = defaultdict(list)
for c in d:
    if c.get('note') and 'Cycle' in c['note']:
        groups[(c['name'], c['year'])].append(c)
for key, recs in groups.items():
    if len(recs) < 2: continue
    sigs = set((r.get('deadline'), r.get('abstractDeadline'), r.get('notificationDate')) for r in recs)
    if len(sigs) < len(recs):
        print(key, [(r['note'], r.get('abstractDeadline'), r.get('deadline'), r.get('notificationDate')) for r in recs])
```
(Already run once after the last fix — clean as of `90025fb`. Rerun after
future edits in case new duplicates are introduced.)

## Status: existing-series audit (Phase 1, target ~67 series)

**Done / verified against official sources (25):** AAAI, ICML, ICLR, IJCAI,
NeurIPS, ACL, CVPR, ECCV, EMNLP, ICCV (partially — see below), NAACL, OSDI,
SOSP, EuroSys, USENIX ATC, NSDI, CGO, DAC (partially — see below), ICCAD,
Crypto, Eurocrypt, CAV, LICS, VLDB, FAST.

**Inspected but not independently source-verified (treat as unaudited):**
SIGMETRICS, IMC — looked internally consistent on read-through but were not
checked against an official page this session.

**Known unresolved conflict (left alone, needs a human or a fresh look):**
DAC 2027 — a subagent found the official `dac.com/2026/events/dac-2027` page
stating July 11–14, 2027 and different abstract/submission deadlines than
the local record (which has `2027-06-22` and Nov 12/19, 2026), but reported
`needs-review` confidence rather than `confirmed`. Left unchanged pending a
second look. Record is already `estimated: true, verified: false` so it's
not presented to users as confirmed.

**Not yet touched (42 remaining):** ASE, ASPLOS, CCS, CHI, EC, EMSOFT,
Eurographics, FSE, HPCA, ICDE, ICFP, ICRA, ICSE, IEEE S&P, IMC, IROS, ISCA,
ISSTA, KDD, MICRO, MobiCom, MobiSys, NDSS, OOPSLA, PLDI, PODS, POPL, RSS,
RTSS, SIGCOMM, SIGCSE TS, SIGGRAPH, SIGGRAPH Asia, SIGIR, SIGMETRICS,
SIGMOD, UIST, USENIX Security, UbiComp / ISWC, VIS, VR, WWW.

Suggested next batches (same grouping used earlier, ~4-6 series each, per
`MAINTENANCE.md`'s guidance — do each one yourself via WebSearch/WebFetch,
not via Agent/subagent):

1. CCS, IEEE S&P, USENIX Security, NDSS (security)
2. ISCA, MICRO, HPCA, ASPLOS (architecture)
3. PLDI, POPL, OOPSLA, ICFP (PL)
4. ICSE, FSE, ASE, ISSTA (SE)
5. SIGMOD, ICDE, PODS, SIGMETRICS, IMC (DB + the two "inspected only" ones)
6. SIGCOMM, MobiCom, MobiSys (networking)
7. SIGGRAPH, SIGGRAPH Asia, Eurographics, VIS, VR (graphics)
8. CHI, UIST, UbiComp / ISWC (HCI)
9. SIGIR, WWW (IR/web)
10. ICRA, IROS, RSS, RTSS, EMSOFT (robotics/embedded)
11. EC, KDD, SIGCSE TS (misc)

## Phase 2: research the 89 new CORE A/A* skeleton series — **Done.**

All 89 series (AAMAS through WSDM, see commit list below) now have real
dates/deadlines/chairs researched from official sources, applied across 16
batches (~5-7 series each), each followed by `npm test` + `npm run build`
and a commit. A few series have partial data where the official site itself
hadn't published full details yet (e.g. ICME 2027, AISTATS 2027 location,
HotOS/ICS/CADE/GECCO/FOGA 2027 deadlines) — those are left `estimated: true,
verified: false` with a `note` explaining the gap, per the "unknown beats
wrong" rule. The duplicate-cycle sanity check (see script above) was rerun
and is clean.

Commits (in order): `e9a2cbd` FOCS/STOC/SODA/ITCS/CCC/ALENEX, `ca02515`
ESA/STACS/COLT/CP/SAT, `28516bc` CADE/IJCAR/KR/ICAPS, `56fc9ff`
ESORICS/CHES/CSF/FC/ACSAC/DSN, `89a3b04` PETS/SOUPS/ASIACRYPT, `7908828`
INFOCOM/CoNEXT/ICDCS/IPDPS/PODC/DISC, `d24f3c5`
HotOS/Middleware/ICS/IPSN/SenSys/ISLPED, `13d814a` ESOP/ECOOP, `226083e`
CIDR/ICDT/CIKM/WSDM/SDM/ICDM, `4b8aec2`
AISTATS/UAI/GECCO/PPSN/FOGA/AAMAS/ECAI, `b23c7f0`
BMVC/WACV/ACM MM/ICME/MICCAI/ICDAR, `31b1205` EACL/ECIR/Interspeech,
`f6ff73f` CSCW/DIS/IUI/ASSETS/ICWSM, `59abb91`
ESEM/EASE/ICSA/ISSRE/SEAMS/MSR/ICER, `dbb5a3f`
FPGA/ITC/ISMAR/PerCom/MMSys/ICSOC/ICWS, `ba76fa8`
BPM/CAiSE/ER/GD/LAK/AIED/RE/RecSys/SIGSPATIAL/TACAS.

Remaining follow-up (not urgent): ICME 2027's official site had no
confirmed dates at research time — recheck in a future weekly/monthly pass.

## Workflow reminders for whoever resumes

- Read `MAINTENANCE.md` section 5 in full before editing dates — it defines
  the evidence/stop-condition rules ("unknown beats wrong"), the exact local
  schema, and the editing rules (never invent a chair from the wrong role,
  never replace a known value with a guess, etc).
- After any edit to `csconfs/data/conferences.json`: run `npm test` and
  `npm run build`, then commit with a descriptive message (this repo commits
  directly to `main`, no feature branches, per `AGENTS.md`).
- When writing the JSON file from Python, always
  `json.dump(..., ensure_ascii=False)` and append a trailing newline — see
  the `dbc78fe` incident above.
- `scripts/csconfs-maintain.mjs` is an existing (unused this session)
  automation script that spawns a `claude`/`codex` CLI subprocess to do this
  same research in a resumable way — it wasn't used here because it requires
  its own CLI auth and wasn't verified to work inside this sandboxed session,
  but it's worth knowing about (`node scripts/csconfs-maintain.mjs help`).
