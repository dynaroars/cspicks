# Automated maintenance setup

This file describes the scheduled maintenance that keeps CS Picks current with little owner
involvement: what runs, when, and how the pieces hand work to each other. It is the source of truth
for routine behavior. Each cloud routine's prompt is a short pointer to its section below, so
behavior is changed by editing this file, not the routine.

## How it fits together

- **Producers** are cloud routines that each do one bounded maintenance task from a `TASKS/` playbook, then open a PR (data edits) or an Issue (anything needing a decision).
- **The auditor** is a separate cloud routine (Opus) that reviews those PRs and Issues after they
  have sat for at least 12 hours, plus any data the owner's local sessions pushed straight to
  `main`, re-verifies them against live sources, and merges, fixes, or closes them. A producer never reviews or merges its own work.
- **Model-free jobs** (GitHub Actions and the owner's crontab) do mechanical work and raise alarms.
- **The owner** is needed only for items an agent can't settle (see "Needs an owner decision") and
  for the watchdog Issue.

### Precedence for scheduled runs

`AGENTS.md` says to commit directly to `main`. For scheduled runs, this file overrides it: producers
open PRs and never push to `main`, and every run stops at its section's cap.

## Schedule

Cloud routines live at <https://claude.ai/code/routines> (environment: Default). Cron is UTC; ET is
shown for convenience (EDT; subtract an hour in winter).

Ordering rule: the auditor runs at 16:00 UTC and every producer starts between 19:00 and 01:30 UTC.
So an audit never runs while that day's producers are still working, and everything a producer creates
is at least ~14 hours old at the next audit, past the auditor's 12-hour minimum. Keep new routines
inside those windows.

Spread rule (token budget): the owner's other routines (VietProfs: audit 03:00, links 05:00, discover
08:00, portraits/honors 11:00, relationships 14:00 UTC, Mon-Sat) share the same usage limit that resets
every ~5 hours. So the CS Picks routines sit in the otherwise idle 16:00-02:00 UTC stretch: no more than
two routines of the three repos start within any 3 hours, and the two Opus audits are 13 hours apart.
The GMU CS directory (`../people`, TASKS/AUTOMATION.md) runs weekly in slots both repos leave free:
producers Sunday 05:00, 08:00, 11:00, 14:00 and an Opus audit Monday 10:30 UTC.
Check VietProfs' and People's times before moving anything here.

| Key | Routine id | Model | Cron (UTC) | ET | Section |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `audit` | `trig_01RgGWz3Xjw6gXvqPYgixP7C` | Opus 5.5 | `0 16 * * *` | Daily 12 PM | [Auditor](#auditor-audit) |
| `confs` | `trig_018AYNAaQfwJC2rx8JX2zZKo` | Sonnet 5.5 | `0 20 * * 0,2,4,6` | Sun, Tue, Thu, Sat 4 PM | [Conference audit](#conference-audit-confs) |
| `grants` | `trig_01LuUf649h8NwKMEftjktkmS` | Sonnet 5.5 | `0 23 * * 3,6` | Wed and Sat 7 PM | [Grants audit](#grants-audit-grants) |
| `jobs` | `trig_01PkBRvYwVSWTCqsCtsNZpPg` | Sonnet 5.5 | `0 22 * * 1,5` | Mon and Fri 6 PM | [US jobs crawl](#us-jobs-crawl-jobs) |
| `jobs-intl` | `trig_0185iQdCfKfusPAN8DjkjSke` | Sonnet 5.5 | `0 23 * * 2` | Tue 7 PM | [International jobs crawl](#international-jobs-crawl-jobs-intl) |
| `labs` | `trig_01WxBbdGpCW3zoLamWKdXMHe` | Sonnet 5.5 | `0 19 * * 3` | Wed 3 PM | [Industry & national-lab postings](#industry--national-lab-postings-labs) |
| `data-sync` | `trig_014ksNYkkzyHVxS2Kub4LqsG` | Sonnet 5 | `30 0 3 * *` | 3rd of month, 8:30 PM (2nd) | [Mechanical data sync](#mechanical-data-sync-data-sync) |
| `confs-discover` | `trig_01LZM6T6zVarUND6Uvh6HUTh` | Sonnet 5 | `0 1 8 * *` | 8th of month, 9 PM (7th) | [Discover conferences](#discover-conferences-confs-discover) |
| `grants-discover` | `trig_01MKACYJ3eAKPAEWNJukaKJh` | Sonnet 5 | `0 1 22 * *` | 22nd of month, 9 PM (21st) | [Discover grants](#discover-grants-grants-discover) |
| `affiliations` | `trig_01Q8yhHMcPqZZJspxcr4iw7n` | Sonnet 5 | `30 1 10 1,4,7,10 *` | 10th of Jan/Apr/Jul/Oct, 9:30 PM (9th) | [Manual affiliations](#manual-affiliations-affiliations) |

One-time (done): `review` (`trig_01GJP3xjZBugMSfyEHkN5EBC`, Opus 5.5) ran once on 2026-10-26 at 20:00 UTC (4 PM ET), after the schedule
changed on 2026-10-02 (nightly audit, confs every other day, grants twice weekly); its findings are
[#70](https://github.com/dynaroars/cspicks/issues/70). It changed
nothing and filed one `[scheduled:review] Automation setup review (2026-10-26)` Issue with
per-routine results (PRs opened, facts changed, merge rate, `not_found` share, blocked sources,
backlog size from `npm run maintain:csconfs -- --dry-run --limit 400`) and a recommendation to
raise, keep, or lower each frequency.

Each routine attaches only the
`Claude_Docs` connector. Don't add `Claude_Code_Remote`: with it, a run that opens a PR schedules
hourly "Re-check PR" reminders until the PR is merged.

Outside the cloud:

| What | Where | When | Notes |
| :-- | :-- | :-- | :-- |
| OpenAlex affiliation history | Owner's crontab: `15 3 * * * …/scripts/daily-openalex-sync.sh` | Daily 3:15 AM local | Budget-capped, commits and pushes to `main` itself; log in `.openalex-cron.log`. It aborts (and reverts) on a script crash instead of logging "No changes". |
| Automation watchdog | GitHub Action `.github/workflows/automation-watchdog.yml` | Mondays 12:00 UTC; manual via `gh workflow run automation-watchdog.yml` | Opens or comments on one "Automation watchdog (automated)" Issue when a PR has been open more than 10 days or nothing `[scheduled:*]` appeared in 10 days; closes it when checks pass. No model involved. |
| Full NSF resync | GitHub Action `.github/workflows/nsf-full-sync.yml` | 2nd of Jan/Apr/Jul/Oct, 08:00 UTC; manual via `gh workflow run nsf-full-sync.yml` | Runs `sync:nsf:all` with its resume cache kept per quarter; an incomplete run re-dispatches itself (up to 6 attempts, then an Issue). Opens a `[scheduled:nsf-full]` PR, or an Issue if awards drop more than 3%. |
| CORE A/A* extra publications | GitHub Action `.github/workflows/dblp-core-extra.yml` | 6th of Jan/Apr/Jul/Oct, 08:30 UTC; manual via `gh workflow run dblp-core-extra.yml` | Downloads the newest DBLP release from the Dagstuhl mirror (dblp.org itself blocks scripts), verifies md5, skips if already built from it, rebuilds per `TASKS/csrankings.md`, and opens a `[scheduled:dblp]` PR (or an Issue if rows drop more than 10%). |

## Conventions for every scheduled run

Every routine prompt says: "Read docs/AUTOMATION.md and follow the section for `<key>`." All of
them share these rules:

1. **Setup.** Read `AGENTS.md`, this section, and the playbook your section names. Run `npm ci` (not `npm install`). Work sequentially; don't
   spawn subagents. Use the GitHub MCP tools when `gh` is missing.
2. **Caps.** Stay within the section's cap, then stop. Before starting, list open PRs and Issues
   titled `[scheduled:<key>]` and skip items they already touch.
3. **Titles and branches.** Every PR and Issue title starts with `[scheduled:<key>]`. Branches are
   `task/<key>-<YYYY-MM-DD>`, unless the session assigns its own branch (e.g. `claude/<name>`); then use that one,
   since the title already identifies the routine.
4. **Boundaries.** Producers never merge PRs and never push to `main`. Unknown beats wrong: never
   fill a field from a prior year, a third-party tracker, or a guess.
5. **Validate.** Before opening a PR: `npm test && npm run typecheck && npm run build &&
   git diff --check`. The data checks in `npm test` name each bad record and field (e.g.
   `Foo U: outcome (null or one of complete | incomplete | blocked | not_found)`); fix those records
   in your batch and re-run. If it fails for a reason you can't fix inside the batch, don't open the
   PR; open an Issue with the failure instead. CI also runs the e2e suite, which reads frozen fixtures
   (`test/fixtures/`), so data edits can't break it.
6. **Evidence.** Every changed fact in a PR lists the official URL it came from. If a site is
   blocked by the egress proxy or a bot check, don't accept the fact; list it in the PR as
   unverified so a later run retries it.
7. **Side findings.** Errors or leads you notice outside your task (a wrong link on another entry,
   a broken page, a stale chair) go in a separate `[scheduled:<key>] Side finding: …` Issue with
   the evidence, at most 3 per run, deduplicated against open Issues. Don't fix them in your PR.
8. **No follow-ups.** Once your PR/Issues are open, stop. Don't schedule check-ins, reminders,
   wakeups, or re-armed routines to watch CI or the PR; the auditor handles review. This includes
   the session's built-in PR-watching tools (`subscribe_pr_activity` and similar, from the
   `claude-code-remote` MCP server): never call them, even though they're offered after a PR is
   opened. Subscribing is what makes a run schedule hourly "Re-check PR" reminders.
9. **Summary.** End with items processed, changes made, PR/Issue links, side findings filed,
   items skipped with reasons, and any blocked sources.

## Routine sections

### Auditor (`audit`)

Follow `TASKS/audit.md`, with these rules taking precedence:

- Scope: open PRs and Issues created at least 12 hours ago, oldest first, skipping anything this
  session created. At most 5 PRs and 10 Issues per run. Then direct data commits to `main` since the
  sha in `scripts/data/audit-reviewed.txt` (TASKS/audit.md, "Direct commits to `main`"), at most 60 records per run.
- PRs: check out the PR, merge fresh `main` into it, and run the full validation from the
  conventions. Re-verify a sample of at least a third of the changed facts (and every changed
  deadline, plus every new or changed job's `track` and `level`) against the cited official URLs. Require green CI on the PR. Merge with
  `gh pr merge <n> --squash --delete-branch`. If any fact is wrong or unsupported, request changes
  (or close) with a comment naming each rejected item and why; never merge a partial subset
  silently.
- Several open PRs editing the same data file: merge the first, then rebase the others onto
  `main`, resolve conflicts, re-validate, and merge.
- Side-finding and correction Issues: verify live. If confirmed, fix on `main`, validate, push,
  and close with what changed and the source. If the evidence is wrong, close with the reason.
- Action PRs (`[scheduled:nsf-full]`, `[scheduled:dblp]`) are opened by the workflow's
  `GITHUB_TOKEN`, so GitHub doesn't link their CI to the PR: `gh pr checks` shows nothing and the
  `pull_request` run sits at "action_required". The workflow dispatches the build on the branch
  instead; treat CI as green when
  `gh api repos/dynaroars/cspicks/commits/<head sha>/check-runs` shows `build` = `success`. They
  contain generated data, not researched facts: check the diff shape per MAINTENANCE.md's verification checklist (no near-total rewrite,
  no unexplained drop) and spot-check a few rows instead of re-verifying every fact. For `dblp`,
  update the venue count in `CONF_SET_HELP` (src/filters.ts) if the accepted count changed.
- Submission Issues (from `grants-submit.html`, `csconfs-submit.html`, or `jobs-submit.html`): a submission is a lead,
  not a source. Verify the official URL, then apply it per the domain's `TASKS/` playbook, or close with the
  reason.
- Needs an owner decision (conflicting official sources, a policy question, anything that would
  delete data): comment with findings and a recommendation, and leave it open.
- Automation health, every run after the normal work. Check:
  1. PRs open more than 7 days, and why (red CI, conflict, rejected but still open).
  2. Each routine in the Schedule table: no `[scheduled:<key>]` PR, Issue, or commit within two
     of its cron cycles means it has likely stopped.
  3. Issues left open for an owner decision for more than 21 days.
  4. Data warnings: `npm run lint:data` (TASKS/audit.md, "Data warnings"), at most 10 per run.

  Fix what you can within the caps. Report the rest in one open Issue titled
  `[scheduled:audit] Automation health`: comment when something is wrong, close it when a check
  comes back clean, and never open a second one. When everything is healthy and no such Issue
  is open, do nothing.

### Conference audit (`confs`)

Playbook: `TASKS/conferences.md`. Cap: 12 conference series.

1. Pick the queue with `npm run maintain:csconfs -- --dry-run --limit 12`. It orders series by
   near-term deadlines and gaps, skips recently checked and deferred ones, reserves half the batch for
   never-checked series, and prints why each is due. Don't run the controller without `--dry-run`; this routine is the researcher.
2. Research each series on its official site (Workflows A/B in the playbook). Update
   `csconfs/data/conferences.json` only with facts an official page states.
3. For every series you researched, record the result in `csconfs/maintenance/checks.json` under
   `series.<name>`, in the controller's format: `lastCheckedAt` (ISO time), `outcome`
   (`complete`, `incomplete`, or `not_found`), `summary`, `checkedUrls`, `deferredUntil`
   (`lastCheckedAt` + 21 days when `not_found`, + 7 days when `incomplete`, `null` when `complete`), and `proposals` (a list of
   `{ action, year, sources }` for the edits you made). This is what keeps the next run from
   repeating the same series.
4. Open one PR even if only `checks.json` changed.

Owner-curated "other venues" (`"other": true`, empty `venueKeys`) are audited
like any other series, so the queue will include them. Keep `venueKeys: []`, `other`, and `area`
exactly as they are.

### Grants audit (`grants`)

Playbook: `TASKS/grants.md`. Cap: 20 entries in `public/grants.json`.

Skip every entry whose `lastVerifiedAt` is within the last 30 days. Among the rest, pick entries in this
order: deadline already passed (the next cycle may be posted), then deadline within the next 90 days,
then entries with no concrete date in `deadline`. Within each group, entries with no `lastVerifiedAt`
come first. Break ties by rotating
`sponsorCategory`, taking the category that appears least among the last few `[scheduled:grants]`
PRs. For each entry, confirm the official page, update the deadline/amount/eligibility, keep
concrete historical dates as the playbook describes, and set `"status": "historical"` for discontinued
programs rather than deleting them. Keep `id`s stable. Set `lastVerifiedAt` (today, `YYYY-MM-DD`) on
every entry you confirmed against its official page, including ones where nothing changed; an entry you
couldn't verify (blocked site, missing page) keeps its old value so a later run retries it. If an `amount`
looks corrupted (a bare number or leading comma with no currency sign, as in Issue #13), re-derive it from
the official call page or set it to `Amount varies; see the official call page`; never guess.

### US jobs crawl (`jobs`)

Playbook: `TASKS/jobs.md`. Cap: 30 schools, worked sequentially by this one agent (never spawn subagents). Runs
Monday and Friday, the two weekdays with no other routine.

0. **Browser check (every run that has schools due).** Run `npx playwright install --with-deps chromium` and then
   `npm run render:jobs -- https://apply.interfolio.com/194231`; the output should contain
   `Tenure-Track Faculty 2026-2027`. State the result in the PR description ("render step: works" or the exact
   error). If it fails, continue with WebFetch only and open one Issue titled `[scheduled:jobs] Render step
   unavailable` with the exact error (skip if one is already open).
1. Pick the queue with `npm run maintain:jobs -- --country US --limit 30` (run `--seed` first if CSRankings added US
   schools). International schools and labs have their own routines below.
2. Crawl each school per the playbook and record its result in `scripts/data/jobs-sources.json`. Open one PR
   even if only the sources file changed.
3. Every new or changed deadline and every `closedAt` goes in the PR description with its official URL; the
   auditor re-verifies all of them.

### International jobs crawl (`jobs-intl`)

Playbook: `TASKS/jobs.md`, section "International posting research". Cap: 25 schools, worked sequentially (never
spawn subagents). Runs Tuesday.

0. Same browser check as `jobs` (step 0 above); reuse its Issue title if the render step fails.
1. Pick the queue with `npm run maintain:jobs -- --country intl --limit 25`: non-US schools from
   `scripts/data/jobs-sources.json` (CSRankings' non-US institutions plus any added with `--add ... --country XX`),
   never-checked first.
2. Crawl each school's official vacancy portal and CS/computing department pages, plus related units (ECE,
   informatics, data science). Add verified postings with the international fields (`country` ISO code, `city`,
   `state` as province/region or empty). Record every school's result in its sources row, including "no open CS
   post on <date>". Read postings in the language they are published in; summarize in English.
3. Open one PR, listing each new posting and every changed deadline or `closedAt` with its official URL.

### Industry & national-lab postings (`labs`)

Playbook: `TASKS/labs.md`. Cap: 12 labs, worked sequentially (never spawn subagents). Runs Wednesday.

0. Same browser check as `jobs` (step 0 above).
1. Pick the queue with `npm run maintain:labs -- --limit 12` (least recently checked labs first).
2. For each lab, recheck its existing `lab` postings in `public/jobs.json` on the rendered page: set `lastSeenAt`
   to today when live, `closedAt` when gone or closed. Then add new PhD-level postings from the lab's own careers
   site or ATS until the lab has about four open ones, per the playbook's rules. Set the lab's
   `postingsCheckedAt` to today in `public/labs.json`, even when nothing was found or the site was blocked (say
   which in the PR).
3. In February and August, also do the directory link refresh from `TASKS/labs.md` for the labs in this run.
4. Open one PR listing each added posting, each `closedAt`, and blocked labs.

### Mechanical data sync (`data-sync`)

Playbooks: `TASKS/nsf.md` (name matching only) and `TASKS/csrankings.md`.
No web research.

1. `npm run sync:nsf:names`, then `npm run sync:csrankings-rules`, then `npm run check:size`.
2. Inspect each diff against MAINTENANCE.md's "Verification checklist": a near-total rewrite or a
   sudden drop in entry count means upstream changed shape. In that case, don't open a PR; open an
   Issue with the diff stats instead.
3. If nothing changed, open nothing and say so in the summary. Otherwise, one PR with all changed
   generated files and the diff stats in the description.
4. Never run `sync:nsf:all` (hours of API calls) or the OpenAlex rebuild.

### Discover conferences (`confs-discover`)

Playbook: `TASKS/conferences.md` ("Discovering new series"). Cap: 5 new conference series. Dedup against every
`name` and `venueKeys` value already in `csconfs/data/conferences.json` and against open PRs.
`venueKeys` must be keys `src/data.ts` already recognizes; if a strong candidate has no
recognized key, file it as an Issue instead of adding it. Never add an `"other": true` record: the
owner curates that list; suggest candidates in the same Issue. New records use `estimated`/`verified`
honestly and leave unknown fields `null`.

### Discover grants (`grants-discover`)

Playbook: `TASKS/grants.md` ("Discovering new programs"). Always run the "AI Tool Access &
Compute Credits for Scientists" queries, then rotate: start with the query category least
represented in recent `[scheduled:grants-discover]` PRs. Cap: 5 new entries. Dedup
against every `id`, `name`, and `url` in `public/grants.json` and against open PRs. Each entry
needs an official call page; skip programs known only from third-party lists.

### Manual affiliations (`affiliations`)

Playbook: `TASKS/affiliations.md`. Re-check every row in
`public/manual_affiliations.csv` against official appointment pages or CVs. Correct only what an
official source contradicts, citing it per row. Rows you can't confirm stay as they are, listed in
the PR description.

## Changing the setup

- **Behavior:** edit the routine's section here. The routine prompt only points to this file.
- **Schedule, model, or on/off:** change the routine at <https://claude.ai/code/routines>, then
  update the Schedule table to match, keeping the ordering rule.
- **New routine:** add a section and a table row here. Its prompt should be the same pointer the
  others use: `You are the scheduled CS Picks agent for routine key "<key>"
  (github.com/dynaroars/cspicks). Read docs/AUTOMATION.md and follow "Conventions for every
  scheduled run" and the "<section>" section.`

## Troubleshooting

- **What did a run do?** Open the run's session from the routine page, or read its PR/Issue
  summary.
- **OpenAlex data stale:** check the end of `.openalex-cron.log` for `ABORT` lines.
