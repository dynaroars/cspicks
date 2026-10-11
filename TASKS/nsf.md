# NSF funding (`public/nsf-awards.json`)

> **`/goal TASKS/nsf.md`**: Keep NSF award attribution current: routine name-matching refreshes, scoped resyncs, and the quarterly full sync. Work in bounded batches and open a PR on a
> topic branch for each; never push to `main`. Scheduled runs stop at the cap in
> [docs/AUTOMATION.md](../docs/AUTOMATION.md).

**Unknown beats wrong**: never fill a field from a prior year, a third-party tracker, or a guess.
Validate every batch with `npm test && npm run typecheck && npm run build && git diff --check`.

The browser does not query NSF directly. NSF rejects browser-origin requests,
and live per-user requests would make results dependent on API availability
and unstable name matching. Instead, `nsf.html` lazily loads a synchronized
static dataset (`public/nsf-awards.json`) only when someone opens it.

```bash
npm run sync:nsf:names            # monthly, or after any CSRankings roster update — 2 CSV downloads, seconds
npm run sync:nsf:all              # quarterly, or when data looks stale — thousands of NSF API queries, hours
npm run sync:nsf -- --school "X"  # scoped resync for one institution
npm run sync:nsf -- --faculty "X" # scoped resync for one person, useful while diagnosing a name variant
npm run sync:nsf:rebuild          # rebuild public/nsf-awards.json from the local cache, no API calls
```

**Run `sync:nsf:names` far more often than the others.** CSRankings spells
some faculty differently in `csrankings.csv` (what the award sync matched
against) than in `generated-author-info.csv` (what the site keys on); without
this refresh, anyone hired or renamed since the last award sync silently
shows no funding. It costs two CSV downloads and no NSF API access, so it's
safe to run any time. It rewrites `public/nsf-awards.json` and the reviewable
`public/nsf-name-crosswalk.csv` — commit both.

The crosswalk is meant to be read: each row records a name that needed
resolving. Correcting a wrong row by hand is a legitimate fix.

```bash
npm run sync:nsf:names   # then review the diff in public/nsf-name-crosswalk.csv
npm test && npm run build
```

**`sync:nsf:all`** (the full resync):

- queries the official NSF Award Search API for each unique faculty/institution pair;
- accepts awards only when the NSF recipient matches the current CSRankings institution;
- retains all listed PIs and co-PIs for fractional attribution;
- finds exact-title sibling awards for collaborative projects and deduplicates institution-transfer records;
- checkpoints progress in the ignored `.nsf-sync-cache.json` file so it can resume without repeating completed queries;
- writes the deployable dataset to `public/nsf-awards.json`, including explicit coverage totals.

NSF records awards under legal names (`Regents of the University of Michigan
- Flint`), informal ones (`Georgia Tech Research Corporation`), and expansions
of names CSRankings abbreviates (`Massachusetts Institute of Technology` vs
`Massachusetts Inst. of Technology`). The synchronizer normalizes those forms,
keeps an alias list for names it cannot derive, and assigns each awardee to
the *most specific* matching institution so a flagship never claims its
branch campus's awards.

Run the nationwide `sync:nsf:all` command again before a deploy when you want
fresh NSF data — deploying does not contact NSF automatically.

**Funding interpretation:** an award's estimated total amount is divided
equally among every listed PI and co-PI. University totals sum the shares
assigned to matched current CSRankings faculty. These are matched-faculty
statistics — not complete university NSF portfolios, annual expenditures,
fiscal-year obligation totals, or measures of research quality. Awards made
to a professor's former institution are intentionally excluded. Name
variants, missing co-PIs, transfers, supplements, and NSF data changes can
still cause omissions.
