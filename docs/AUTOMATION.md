# Automated maintenance setup

This file describes the scheduled maintenance that keeps CS Picks current with little owner
involvement: what runs, when, and how the pieces hand work to each other. It is the source of truth
for routine behavior. Each cloud routine's prompt is a short pointer to its section below, so
behavior is changed by editing this file, not the routine.

## How it fits together

- **Producers** are cloud routines that each do one bounded maintenance task from `TASKS/` and
  `MAINTENANCE.md`, then open a PR (data edits) or an Issue (anything needing a decision).
- **The auditor** is a separate cloud routine (Opus) that reviews those PRs and Issues after they
  have sat for at least 12 hours, re-verifies them against live sources, and merges, fixes, or
  closes them. A producer never reviews or merges its own work.
- **Model-free jobs** (GitHub Actions and the owner's crontab) do mechanical work and raise alarms.
- **The owner** is needed only for items an agent can't settle (see "Needs an owner decision") and
  for the watchdog Issue.

### Precedence for scheduled runs

`AGENTS.md` and `MAINTENANCE.md` say to commit directly to `main`, and several playbooks say to
"continue until 100% complete" or "do NOT stop". For scheduled runs, this file overrides both:
producers open PRs and never push to `main`, and every run stops at its section's cap. The "100%"
goal is reached across runs, not within one.

## Schedule

Cloud routines live at <https://claude.ai/code/routines> (environment: Default). Cron is UTC; ET is
shown for convenience (EDT; subtract an hour in winter).

Ordering rule: the auditor runs at 04:00 UTC and every producer starts between 08:00 and
09:30 UTC. So an audit never runs while that day's producers are still working, and everything
a producer creates is at least ~17 hours old at the next audit, past the auditor's 12-hour
minimum. Keep new routines inside those windows.

| Key | Routine id | Model | Cron (UTC) | ET | Section |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `audit` | `trig_01RgGWz3Xjw6gXvqPYgixP7C` | Opus 5.5 | `0 4 * * *` | Daily 12 AM | [Auditor](#auditor-audit) |
| `confs` | `trig_018AYNAaQfwJC2rx8JX2zZKo` | Sonnet 5.5 | `0 8 * * 0,2,4,6` | Sun, Tue, Thu, Sat 4 AM | [Conference audit](#conference-audit-confs) |
| `grants` | `trig_01LuUf649h8NwKMEftjktkmS` | Sonnet 5.5 | `30 8 * * 3,6` | Wed and Sat 4:30 AM | [Grants audit](#grants-audit-grants) |
| `data-sync` | `trig_014ksNYkkzyHVxS2Kub4LqsG` | Sonnet 5 | `30 8 3 * *` | 3rd of month, 4:30 AM | [Mechanical data sync](#mechanical-data-sync-data-sync) |
| `confs-discover` | `trig_01LZM6T6zVarUND6Uvh6HUTh` | Sonnet 5 | `0 9 8 * *` | 8th of month, 5 AM | [Discover conferences](#discover-conferences-confs-discover) |
| `grants-discover` | `trig_01MKACYJ3eAKPAEWNJukaKJh` | Sonnet 5 | `0 9 22 * *` | 22nd of month, 5 AM | [Discover grants](#discover-grants-grants-discover) |
| `affiliations` | `trig_01Q8yhHMcPqZZJspxcr4iw7n` | Sonnet 5 | `30 9 10 1,4,7,10 *` | 10th of Jan/Apr/Jul/Oct, 5:30 AM | [Manual affiliations](#manual-affiliations-affiliations) |

One-time: `review` (`trig_01GJP3xjZBugMSfyEHkN5EBC`, Opus 5.5) runs once on 2026-10-26 at 14:00 UTC (10 AM ET), after the schedule
changed on 2026-10-02 (nightly audit, confs every other day, grants twice weekly). It changes
nothing and files one `[scheduled:review] Automation setup review (2026-10-26)` Issue with
per-routine results (PRs opened, facts changed, merge rate, `not_found` share, blocked sources,
backlog size from `npm run maintain:csconfs -- --dry-run --limit 400`) and a recommendation to
raise, keep, or lower each frequency. Until then, leave the setup alone unless something is broken.

Each routine attaches only the
`Claude_Docs` connector. Don't add `Claude_Code_Remote`: with it, a run that opens a PR schedules
hourly "Re-check PR" reminders until the PR is merged.

Outside the cloud:

| What | Where | When | Notes |
| :-- | :-- | :-- | :-- |
| OpenAlex affiliation history | Owner's crontab: `15 3 * * * …/scripts/daily-openalex-sync.sh` | Daily 3:15 AM local | Budget-capped, commits and pushes to `main` itself; log in `.openalex-cron.log`. It aborts (and reverts) on a script crash instead of logging "No changes". |
| Automation watchdog | GitHub Action `.github/workflows/automation-watchdog.yml` | Mondays 12:00 UTC; manual via `gh workflow run automation-watchdog.yml` | Opens or comments on one "Automation watchdog (automated)" Issue when a PR has been open more than 10 days or nothing `[scheduled:*]` appeared in 10 days; closes it when checks pass. No model involved. |
| Full NSF resync | GitHub Action `.github/workflows/nsf-full-sync.yml` | 2nd of Jan/Apr/Jul/Oct, 08:00 UTC; manual via `gh workflow run nsf-full-sync.yml` | Runs `sync:nsf:all` with its resume cache kept per quarter; an incomplete run re-dispatches itself (up to 6 attempts, then an Issue). Opens a `[scheduled:nsf-full]` PR, or an Issue if awards drop more than 3%. |
| CORE A/A* extra publications | GitHub Action `.github/workflows/dblp-core-extra.yml` | 6th of Jan/Apr/Jul/Oct, 08:30 UTC; manual via `gh workflow run dblp-core-extra.yml` | Downloads the newest DBLP release from the Dagstuhl mirror (dblp.org itself blocks scripts), verifies md5, skips if already built from it, rebuilds per MAINTENANCE.md §2.5, and opens a `[scheduled:dblp]` PR (or an Issue if rows drop more than 10%). |

## Conventions for every scheduled run

Every routine prompt says: "Read docs/AUTOMATION.md and follow the section for `<key>`." All of
them share these rules:

1. **Setup.** Read `AGENTS.md`, this section, the playbook your section names, and the
   `MAINTENANCE.md` section it cites. Run `npm ci` (not `npm install`). Work sequentially; don't
   spawn subagents. Use the GitHub MCP tools when `gh` is missing.
2. **Caps.** Stay within the section's cap, then stop. Before starting, list open PRs and Issues
   titled `[scheduled:<key>]` and skip items they already touch.
3. **Titles and branches.** Every PR and Issue title starts with `[scheduled:<key>]`. Branches are
   `task/<key>-<YYYY-MM-DD>`.
4. **Boundaries.** Producers never merge PRs and never push to `main`. Unknown beats wrong: never
   fill a field from a prior year, a third-party tracker, or a guess.
5. **Validate.** Before opening a PR: `npm test && npm run typecheck && npm run build &&
   git diff --check`. If it fails for a reason you can't fix inside the batch, don't open the PR;
   open an Issue with the failure instead.
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

Follow `TASKS/AUDIT_ISSUES_PRS.md`, with these rules taking precedence:

- Scope: open PRs and Issues created at least 12 hours ago, oldest first, skipping anything this
  session created. At most 5 PRs and 10 Issues per run.
- PRs: check out the PR, merge fresh `main` into it, and run the full validation from the
  conventions. Re-verify a sample of at least a third of the changed facts (and every changed
  deadline) against the cited official URLs. Require green CI on the PR. Merge with
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
- Submission Issues (from `grants-submit.html` or `csconfs-submit.html`): a submission is a lead,
  not a source. Verify the official URL, then apply it per MAINTENANCE.md §5/§6, or close with the
  reason.
- Needs an owner decision (conflicting official sources, a policy question, anything that would
  delete data): comment with findings and a recommendation, and leave it open.
- Automation health, every run after the normal work. Check:
  1. PRs open more than 7 days, and why (red CI, conflict, rejected but still open).
  2. Each routine in the Schedule table: no `[scheduled:<key>]` PR, Issue, or commit within two
     of its cron cycles means it has likely stopped.
  3. Issues left open for an owner decision for more than 21 days.

  Fix what you can within the caps. Report the rest in one open Issue titled
  `[scheduled:audit] Automation health`: comment when something is wrong, close it when a check
  comes back clean, and never open a second one. When everything is healthy and no such Issue
  is open, do nothing.

### Conference audit (`confs`)

Playbook: `TASKS/audit_cs_conferences.md` and MAINTENANCE.md §5 (source priority, edition URL
patterns, stop conditions, schema, editing rules). Cap: 12 conference series.

1. Pick the queue with `npm run maintain:csconfs -- --dry-run --limit 12`. It orders series by
   near-term deadlines and gaps, skips recently checked and deferred ones, and prints why each is
   due. Don't run the controller without `--dry-run`; this routine is the researcher.
2. Research each series on its official site (Workflows A/B in §5). Update
   `csconfs/data/conferences.json` only with facts an official page states.
3. For every series you researched, record the result in `csconfs/maintenance/checks.json` under
   `series.<name>`, in the controller's format: `lastCheckedAt` (ISO time), `outcome`
   (`complete`, `incomplete`, or `not_found`), `summary`, `checkedUrls`, `deferredUntil`
   (`lastCheckedAt` + 21 days when `not_found`, otherwise `null`), and `proposals` (a list of
   `{ action, year, sources }` for the edits you made). This is what keeps the next run from
   repeating the same series.
4. Open one PR even if only `checks.json` changed.

### Grants audit (`grants`)

Playbook: `TASKS/update_grants_and_awards.md` and MAINTENANCE.md §6 (schema, audience taxonomy,
historical status). Cap: 20 entries in `public/grants.json`.

First, fix corrupted `amount` strings (Issue #13: a past automated edit stripped `$` plus the digit
after it, leaving text like `Small (00,000), Medium (,200,000)`). List them with
`node -e "for (const e of require('./public/grants.json')) if (/(^|[ (+])(,\d{3}|\d{2},\d{3})/.test(e.amount||'') && !/[$€£]/.test(e.amount)) console.log(e.id, e.amount)"`
(The pattern is a heuristic: also eyeball every `amount` that starts with a bare number or comma.)
and re-derive each amount from the official solicitation or call page (the entry's landing page often
omits dollar figures; follow it to the solicitation). Never guess the lost digit. If no official page
states the amount, set `amount` to `Amount varies; see the official call page` and list the entry in
the PR. Take these before anything else, up to the cap, until none remain.

Then pick entries in this order: deadline already passed (the next cycle may be posted), then deadline
within the next 90 days, then entries with no concrete date in `deadline`. Break ties by rotating
`sponsorCategory`, taking the category that appears least among the last few `[scheduled:grants]`
PRs. For each entry, confirm the official page, update the deadline/amount/eligibility, keep
concrete historical dates as §6 describes, and set `"status": "historical"` for discontinued
programs rather than deleting them. Keep `id`s stable.

### Mechanical data sync (`data-sync`)

Playbooks: `TASKS/sync_nsf_funding.md` (name matching only) and `TASKS/sync_csrankings_rules.md`.
No web research.

1. `npm run sync:nsf:names`, then `npm run sync:csrankings-rules`, then `npm run check:size`.
2. Inspect each diff against MAINTENANCE.md's "Verification checklist": a near-total rewrite or a
   sudden drop in entry count means upstream changed shape. In that case, don't open a PR; open an
   Issue with the diff stats instead.
3. If nothing changed, open nothing and say so in the summary. Otherwise, one PR with all changed
   generated files and the diff stats in the description.
4. Never run `sync:nsf:all` (hours of API calls) or the OpenAlex rebuild.

### Discover conferences (`confs-discover`)

Playbook: `TASKS/discover_new_conferences.md`. Cap: 5 new conference series. Dedup against every
`name` and `venueKeys` value already in `csconfs/data/conferences.json` and against open PRs.
`venueKeys` must be keys `src/data.ts` already recognizes; if a strong candidate has no
recognized key, file it as an Issue instead of adding it. New records use `estimated`/`verified`
honestly and leave unknown fields `null`.

### Discover grants (`grants-discover`)

Playbook: `TASKS/discover_new_grants.md` and the §6 search queries. Rotate: start with the query
category least represented in recent `[scheduled:grants-discover]` PRs. Cap: 5 new entries. Dedup
against every `id`, `name`, and `url` in `public/grants.json` and against open PRs. Each entry
needs an official call page; skip programs known only from third-party lists.

### Manual affiliations (`affiliations`)

Playbook: `TASKS/verify_manual_affiliations.md`. Re-check every row in
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
