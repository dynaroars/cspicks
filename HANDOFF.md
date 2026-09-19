# Handoff: csconfs CORE A/A* expansion + schedule audit — COMPLETE

All work described below is finished. Kept as a record of what was done and
the process notes that are still useful for future maintenance passes;
delete whenever it stops being useful.

## Original ask — all done

1. Track every CORE A/A* venue referenced by `src/data/conference-sets.ts`,
   not just CSRankings' own set. → **Done** (89 series added in `09e4bc3`).
2. Search's conference-set filter tooltip clarifies that some CORE A venues
   show zero results because CSRankings' own scrape never collected them.
   → **Done** (`66193b5`).
3. Audit the ~67 pre-existing tracked series for accuracy (Phase 1).
   → **Done**, all 11 planned batches complete.
4. Research real dates/deadlines for the 89 new CORE A/A* series (Phase 2).
   → **Done**, all 16 batches complete.
5. Backfill historical (2019–2025) editions for the 89 new series.
   → **Done**, all 16 batches complete, going back to 2019 where a reliable
   source was found.

## Process notes for future maintenance

- **Do not spawn subagents/Agent-tool calls for this kind of work** — the
  user explicitly asked for direct `WebSearch`/`WebFetch` research in
  batches after a wave of parallel research subagents mostly failed on a
  rate limit mid-run. Research one batch of ~4-7 related conferences at a
  time, apply the findings, run `npm test` + `npm run build`, then commit
  and push before moving to the next batch.
- **Recurring bug pattern**: multi-cycle conferences (two or more
  submission rounds per year) are prone to one cycle's record silently
  containing a sibling cycle's deadline/notification data instead of its
  own. Found and fixed this pattern repeatedly (VLDB, NSDI, EuroSys, FAST,
  ASPLOS, IMC, MobiCom, OOPSLA, ICDE all had instances). Rerun this check
  after any bulk edit — it's cheap and catches real errors without any web
  lookups:

  ```python
  import json
  from collections import defaultdict
  d = json.load(open('csconfs/data/conferences.json'))
  groups = defaultdict(list)
  for c in d:
      if c.get('note') and ('Cycle' in c['note'] or 'Round' in c['note']):
          groups[(c['name'], c['year'])].append(c)
  for key, recs in groups.items():
      if len(recs) < 2: continue
      sigs = set((r.get('deadline'), r.get('abstractDeadline'), r.get('notificationDate')) for r in recs)
      if len(sigs) < len(recs):
          print(key, [(r['note'], r.get('abstractDeadline'), r.get('deadline'), r.get('notificationDate')) for r in recs])
  ```

- When writing the JSON file from Python, always use
  `json.dump(..., ensure_ascii=False)` and append a trailing newline —
  the default `ensure_ascii=True` mangles non-ASCII names/places file-wide.
- Historical (past-year) entries in this dataset are intentionally sparser
  than current/upcoming editions: date/place only, no deadlines or chairs,
  matching the pre-existing convention for old entries elsewhere in the
  file. Several individual years were skipped entirely (not filled with an
  estimate) where no reliable source turned up in a single research pass —
  worth revisiting opportunistically, not urgent.
- Known gaps worth a future look: ICME 2027 (no confirmed dates at
  research time), AISTATS 2027 location (official site hadn't finalized
  it and third-party listings disagreed), DAC 2027 (official page
  disagreed with the existing record; left `estimated: true` pending a
  second look), a handful of scattered historical years across ~15 series
  where a specific year's date wasn't confidently found (e.g. EACL
  2019/2022/2025).
- `scripts/csconfs-maintain.mjs` is an existing automation script that
  spawns a `claude`/`codex` CLI subprocess to do this same research in a
  resumable way — untested in this sandboxed session (needs its own CLI
  auth), but worth knowing about (`node scripts/csconfs-maintain.mjs help`).
- `MAINTENANCE.md` section 5 ("CS Conference schedule") documents the full
  audit workflow, evidence-block format, local schema, and editing rules
  ("unknown beats wrong", never invent a chair from the wrong role, never
  replace a known value with a guess) — read it before any future editing
  pass.
