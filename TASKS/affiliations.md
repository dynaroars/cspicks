# Affiliation history (OpenAlex + `public/manual_affiliations.csv`)

> **`/goal TASKS/affiliations.md`**: Keep historical affiliations accurate: monitor the daily OpenAlex sync and re-verify manual corrections. Work in bounded batches and open a PR on a
> topic branch for each; never push to `main`. Scheduled runs stop at the cap in
> [docs/AUTOMATION.md](../docs/AUTOMATION.md).

**Unknown beats wrong**: never fill a field from a prior year, a third-party tracker, or a guess.
Validate every batch with `npm test && npm run typecheck && npm run build && git diff --check`.

`scripts/daily-openalex-sync.sh` runs unattended via cron: budget-capped,
self-checking before it commits (professor count can't shrink, `npm test`
must pass), auto-pushing on success, and leaving a local commit if the push
fails. Check `.openalex-cron.log` if Historical Mode data looks stale.

Manual full rebuilds are rare and expensive:

```bash
node scripts/build-openalex-history.js [--test --limit=10]   # full OpenAlex history rebuild
node scripts/build-school-aliases.js                          # rebuild the OpenAlex → CSRankings name mapping
node scripts/compact-openalex-history.mjs                     # re-compact the history file's on-disk format
```

Community corrections to bad OpenAlex data go in `public/manual_affiliations.csv`
(merged via `mergeAffiliationHistory()` in `src/data.ts`), not by hand-editing
the generated JSON.

## Re-verifying manual corrections

`public/manual_affiliations.csv` columns: `author_name,start_year,end_year,institution_name`. Check each row
against official appointment pages, press releases, or CVs. Correct only what an official source contradicts, and
cite the source per row in the PR. Rows you can't confirm stay as they are and are listed in the PR description.
