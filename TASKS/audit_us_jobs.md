# Crawl US Academic CS Jobs (`audit_us_jobs.md`)

> **Autonomous Goal Directive (`/goal TASKS/audit_us_jobs.md`):**
> Work through `npm run maintain:jobs -- --limit 30` in bounded batches. For each school, find its official
> department hiring page, record every CS-relevant opening in `public/jobs.json`, keep `lastSeenAt` and `closedAt`
> current for postings already listed, and record the crawl result in `scripts/data/jobs-sources.json`.
> Submit each batch as a GitHub PR on a topic branch. Never commit directly to `main`. Scheduled runs stop at the cap in
> [`docs/AUTOMATION.md`](../docs/AUTOMATION.md) (`jobs`); the 100% goal is reached across runs.

---

## Purpose & scope

Keep the US Jobs page (`jobs.html`) accurate: postings at US CSRankings schools, faculty (tenure-track,
teaching, research), postdocs, visiting, and chair/dean. The full schema, source rules, and the
active/closed definition are in **MAINTENANCE.md §6.5**; read it first.

## Rules that matter most

1. **Official pages only.** The department's own hiring page, the university HR posting, or the department's
   announcement is the source. AcademicJobsOnline, HigherEdJobs, Indeed, LinkedIn, X, and mailing lists are leads:
   follow them to the official posting. If there is no official posting, do not add the job.
2. **Unknown beats wrong.** No guessed deadlines, areas, ranks, or start dates. Use `null`/empty. Never carry a
   deadline over from a prior year.
3. **Never delete.** Closed postings are the archive. Mark them with `closedAt`.
4. **Keep `lastSeenAt` honest.** Set it to today only for postings you saw live on the official page this run.
   A posting with no deadline that is not re-confirmed for 90 days drops out of the default "active" view.
5. **Areas.** Record every area the posting specifically names in `areas`; set `anyArea: true` when it explicitly says all/any areas. Both can apply. Never infer an area the posting doesn't state; empty `areas` without `anyArea` means unspecified.
5b. **CSRankings names.** `school` must be the exact institution name in `scripts/data/jobs-sources.json`.
6. **One record per posting URL**; keep `id`s stable and unique.

## Reading JavaScript pages

If a page looks empty (Interfolio, Workday, PeopleAdmin, PeopleSoft, NEOGOV), render it: `npx playwright install --with-deps chromium` once, then `npm run render:jobs -- <url>` (page text) or `npm run render:jobs -- --links <homepage>` (hiring links). See MAINTENANCE.md §6.5. Do not bypass a 403 or challenge page; mark that school `blocked`.

## Per-school workflow

1. Start at the school's `homepage` (sources row) and find the faculty-hiring / open-positions page. Save it as `jobsUrl`.
2. List every open CS-relevant position. For each: add a new record (`source: "crawl"`, `verified: true`) or update the existing one.
3. For each existing record of this school not found any more: if the official page shows it filled/closed, or the
   position page is gone, set `closedAt` to today.
4. Update the sources row: `lastCheckedAt` (ISO time), `outcome` (`complete`, `incomplete`, `blocked`, `not_found`),
   `summary`, `checkedUrls`, `state` (USPS), and `deferredUntil` (+21 days when `not_found` or `blocked`, else `null`).

## Verification

```bash
npm test && npm run typecheck && npm run build && git diff --check
```

The unit test fails on a non-CSRankings school name, a duplicate id/URL, a bad date, or an invalid state. In the PR
description list each changed deadline and each `closedAt` with its official URL, and the schools whose pages were
blocked or unfindable.
