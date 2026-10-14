# Academic CS jobs (`public/jobs.json`)

> **`/goal TASKS/jobs.md`**: Work through `npm run maintain:jobs -- --limit 30`: crawl each school's official hiring pages, keep `lastSeenAt`/`closedAt` current, and record the crawl in `scripts/data/jobs-sources.json`. Work in bounded batches and open a PR on a
> topic branch for each; never push to `main`. Scheduled runs stop at the cap in
> [docs/AUTOMATION.md](../docs/AUTOMATION.md).

**Unknown beats wrong**: never fill a field from a prior year, a third-party tracker, or a guess.
Validate every batch with `npm test && npm run typecheck && npm run build && git diff --check`.

## Rules that matter most

1. **Official pages only.** The department's hiring page, the university HR posting, or the department's
   announcement is the source. AcademicJobsOnline, HigherEdJobs, Indeed, LinkedIn, X, and mailing lists are leads:
   follow them to the official posting. No official posting, no record.
2. **Never delete.** Closed postings are the archive; mark them with `closedAt`.
3. **Keep `lastSeenAt` honest.** Set it to today only for postings you saw live this run.
4. **Every US school is in scope**, CSRankings or not. `school` must match a row in `jobs-sources.json`; add a
   missing school with `npm run maintain:jobs -- --add` rather than rejecting the posting.
5. **One record per posting URL**; `id`s stay stable and unique.
6. In the PR description, list each changed deadline and each `closedAt` with its official URL, and the schools
   whose pages were blocked or unfindable.

`jobs.html` reads `public/jobs.json`: faculty, teaching-track, research, postdoc, visiting, and
chair/dean openings at US schools and verified international postings. CSRankings only seeds the US crawl list
and supplies optional rank chips; schools it does not list simply show no rank. **The main US source is crawling each school's own
department hiring page**, not third-party boards. People can also submit postings through
`jobs-submit.html`, but a submission is a lead, never a source.

Crawl state lives in `scripts/data/jobs-sources.json` (one row per US school: seeded from
CSRankings' `institutions.csv` with `npm run maintain:jobs -- --seed`, re-run when CSRankings adds US
schools; add any other US school, e.g. from a submission, with
`npm run maintain:jobs -- --add "School Name" --homepage <url> --state XX`, which marks the row `csrankings: false`). Each row holds the school's `homepage`, the discovered `jobsUrl`, `state`, and the last crawl's
`lastCheckedAt` / `outcome` / `summary` / `checkedUrls` / `deferredUntil`. `npm run maintain:jobs -- --limit N`
prints the queue: never-checked schools first (largest CSRankings faculty count first), then schools whose
recheck interval has elapsed. Fully read schools are season-aware: postings appear August to January, so those with open
postings are rechecked every 7 days in season (14 off-season) and others every 21 days (60 off-season).
Schools whose last crawl was unfinished come due much sooner: `incomplete` after 1 day, `not_found` after 10,
`blocked` after 14.
`npm run maintain:jobs -- --related N` lists schools whose non-CS units (IST, ECE/ECEC, data science) have never
been checked (no `relatedCheckedAt`); set `relatedCheckedAt` when you finish a school's other units. `--stats` shows coverage.

## The school record (`scripts/data/jobs-sources.json`) and rechecks

`jobs-sources.json` is the durable record of every university whose site we crawl: `homepage` (CS/department), `jobsUrl` (the
hiring page that actually works), `state`, `kind` (`R1`, `R2`, `liberal-arts`, `masters`, `teaching`, `community-college`; only
set for schools outside CSRankings), `lastCheckedAt`, `outcome`, `summary`, `checkedUrls`, `relatedUnits`. Treat it as the memory
between runs, so **always write a row back after visiting a school, including when nothing was open.** Many departments post late (hiring
season runs August to January), so a zero-posting school is "not yet", not "never": set `outcome: complete`, and put "no open CS
search on <date>; recheck <month>" in `summary`. The queue (`--limit N`) brings it back automatically (21 days in season).
`scripts/data/jobs-extra-schools.json` is the seed list of non-CSRankings schools (liberal arts, R2/R3, regional/teaching,
community colleges); register more with `npm run maintain:jobs -- --import <file.json>` (array of
`{ school, state, homepage, jobsUrl?, kind? }`; existing rows keep their crawl state). After CSRankings schools are all
checked, work the `csrankings: false` rows next, then import new ones.

## International posting research

For the ongoing international collection, check non-US CSRankings schools first; move to smaller
universities after that list has been checked. Work in batches of multiple verified postings and add them
directly to `public/jobs.json`; do not create a GitHub Issue per posting (or issue batches) unless the user
explicitly asks for that workflow. Keep a durable record in the matching school's row in
`scripts/data/jobs-sources.json`: set `jobsUrl` to the official hiring page (and add official adjacent-unit
pages to `relatedUnits`), record the pages actually reviewed in `checkedUrls`, and update
`lastCheckedAt` / `outcome` / `summary`. Record official hiring pages even when they show no current CS
opening, since early-season pages may add roles later; a future pass should revisit those URLs. Mark a
school `incomplete` if only selected postings or units were reviewed. Keep blocked or unfindable pages
explicitly identified rather than treating them as checked. Use official university sources for posting
details. Keep the university website record updated even when a school has no leads, so later passes can revisit it as
its hiring page changes. Add each verified live international posting directly to `public/jobs.json`, following
the schema below and using one record per official posting URL. For international jobs, `country` is the ISO
country code, `city` is the posted location, and `state` may hold a province/region or an empty string when
the posting does not specify one. Set `lastSeenAt` only after confirming the official posting is live. Do not
create a GitHub Issue for these entries unless the user asks for that workflow.

## Reading JavaScript pages (`npm run render:jobs`)

Plain fetch tools return only the app shell for Interfolio, Workday, PeopleAdmin, PeopleSoft, NEOGOV and many department sites. `scripts/jobs-render.mjs` renders a page in headless Chromium (Playwright, already a devDependency; install the browser once with `npx playwright install --with-deps chromium`):

```bash
npm run render:jobs -- https://apply.interfolio.com/194231          # visible text of a posting
npm run render:jobs -- --links https://www.cs.example.edu/           # likely hiring page and posting links on a homepage
npm run render:jobs -- --out /tmp/pages url1 url2 ...                # one file per URL
```

It is an ordinary browser session with no user-agent spoofing. A 403 or challenge page still means the site is `blocked`: record that and move on. Typical flow: render the homepage with `--links` to find the hiring page, render that page, then render each posting URL to read its deadline, review date, and posted date.

## Crawling a school

1. Find the department's own faculty-hiring or "open positions" page, starting from the `homepage` in the
   sources row (look for Employment / Careers / Open Positions / Join Us links). University HR portals and
   the department page both count as official. AcademicJobsOnline, HigherEdJobs, Indeed, LinkedIn, and
   social posts are leads only: follow them to the official posting, never copy facts from them. Record the
   page in `jobsUrl`.
2. **Look beyond the CS department.** Many schools hire CS PhDs into other units, so a CS department-only
   search is incomplete. In particular, explicitly check Information Science and Technology (IST) units and
   Electrical and Computer Engineering (ECE/ECEC) units; these units often advertise faculty roles suitable for CS
   researchers. Also check information schools (iSchool, Informatics), EECS, data science, cybersecurity, and
   college-of-computing or engineering-wide searches. After the CS page, find the school's other computing-adjacent
   units (from the university's college/department directory or the engineering/information school site), read
   their hiring pages, and list them in the sources row's `relatedUnits` (`[{ "name", "url" }]`) so later crawls
   revisit them. Include a posting from such a unit when a CS PhD is plainly a target: it names computing, AI, ML,
   data, security, networks, systems, or software, or it is an open or cluster search a CS PhD would apply to.
   Skip positions plainly outside computing. Record the unit in `department` as it appears on the posting
   (e.g. "College of Information Sciences and Technology"); `school` stays the name in the sources row.
3. For every CS-relevant opening in the CS department itself (computer science, computer engineering, AI, data
   science, cybersecurity, or school/college-of-computing units), add or update one record.
4. For records already in `jobs.json` for this school: if the posting is still listed, set `lastSeenAt` to today
   and refresh changed facts (and set `visaSponsorship` if the record has none yet); if it is gone or marked filled/closed on the official page, set `closedAt` to today.
   **Never delete records**: closed postings are the "older postings" archive.
5. Record the result in the school's sources row (`lastCheckedAt`, `outcome` = `complete` | `incomplete` |
   `blocked` | `not_found`, `summary`, `checkedUrls`, `relatedUnits`). If no hiring page can be found or the site blocks the
   crawler, set `outcome` and `deferredUntil` (+21 days) and add no postings. **Unknown beats wrong**: never guess a
   deadline, rank, or area.

## Schema (`public/jobs.json`, an array)

| Field | Notes |
| --- | --- |
| `id` | Stable kebab-case slug: `<school-short>-<role-slug>-<yyyy>`; never reused, never changed. |
| `school` | The exact institution name in `jobs-sources.json` (the CSRankings name when CSRankings lists the school); a unit test enforces it. |
| `department`, `title` | As on the posting. |
| `track` | `tenure-track`, `teaching`, `research`, `postdoc`, `visiting`, `leadership`. |
| `level` | `assistant`, `associate`, `full`, `open`, or null when the posting has no rank (postdocs, lecturers). |
| `areas` | CSRankings area keys (`src/shared.ts` `areaLabels`: `ai`, `sec`, `plan`, …) for every area the posting specifically names ("security, systems, and AI" → `sec`, `ops`/`comm`/`arch` as named, `ai`). Empty when it names none; never infer an area from the department or the ad's tone. |
| `anyArea` | `true` only when the posting explicitly says it is open to all / any areas of computer science ("all areas", "open to any area", "applicants in any area of CS"). Omit otherwise. A posting can have both named `areas` (e.g. "all areas, with emphasis on AI") and `anyArea`. |
| `state`, `city` | USPS state code for US postings; province/region or empty when unspecified internationally. City as stated in the posting. |
| `deadline` | ISO `YYYY-MM-DD`, or null when none is stated. Interpreted as Anywhere on Earth. |
| `rolling` | `true` when the posting reviews until filled; `deadline` is then a priority date or null. |
| `reviewBegins`, `startDate`, `postedDate` | ISO dates, only when the posting states them. |
| `lastSeenAt` | ISO date the posting was last confirmed live. Required. |
| `closedAt` | ISO date the posting was seen closed/filled; omit while open. |
| `visaSponsorship` | What the official posting itself says about visa / work-authorization sponsorship for international candidates: `yes` (it will sponsor, e.g. "H-1B sponsorship available"), `no` ("no visa sponsorship", "must be authorized to work in the US without sponsorship"), `case-by-case` ("may be considered", "eligible for sponsorship"), or `not-stated` (read it; it says nothing). Omit until someone has read the posting for it. Never infer from a university-wide HR policy, the school's reputation, or a third-party board; "sponsored research" is not visa sponsorship. |
| `url` | The official posting URL (https). One record per URL. |
| `summary` | At most two sentences, paraphrased; never paste a posting. |
| `source` | `crawl` or `submission`. |
| `verified` | `true` once checked against the official page. |

## How "active" works

The page shows active postings by default. A posting is active unless `closedAt` is set, or its deadline
has passed, or (when it has no deadline, or is rolling) it has not been confirmed (`lastSeenAt`) in 90
days. The status select ("Closed / older postings", "All postings") and the `status:` keyword reveal the
rest. This is why crawls must keep `lastSeenAt` current for postings with no deadline.

## Reviewing user submissions (`jobs-submit.html`)

A submission arrives as a GitHub Issue or email with a JSON payload. Open the official URL, confirm the
position exists and the facts match, then add or update the record (`source: "submission"`, `verified: true`),
or close the Issue with the reason. If the school has no sources row yet, add it with `--add`; a school's absence
from CSRankings is never a reason to reject. For "closed or filled" reports, confirm on the official page before
setting `closedAt`.

## Verification

```bash
npm test                                   # test/unit/jobs.test.js: schema, unique ids/URLs, school names in jobs-sources.json
npm run build
npx playwright test test/e2e/jobs.spec.js
```
