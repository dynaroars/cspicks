# Auditor: review PRs and Issues

> **`/goal TASKS/audit.md`**: Review open PRs and Issues, re-verify them against live official sources, then
> merge, fix, or close them. Scheduled runs follow the caps and extra rules in
> [docs/AUTOMATION.md](../docs/AUTOMATION.md) (`audit`).

## Pull requests

1. `git fetch origin && gh pr list --state open`, then check out the PR and merge fresh `main` into it.
2. Validate: `npm test && npm run typecheck && npm run build && git diff --check`.
3. Re-verify changed facts against the cited official URLs, using each domain's playbook:
   - `csconfs/data/conferences.json`: [conferences.md](conferences.md) (dates, place format, chairs, all cycles share metadata).
   - `public/grants.json`: [grants.md](grants.md) (schema, audience taxonomy, URL provenance).
   - `public/jobs.json`: [jobs.md](jobs.md): for **every** new or changed record, `track`, `level`, `deadline`, and
     `closedAt` against the official posting (read the employment terms; see jobs.md "Non-US appointment terms"), no
     record deleted, `school` matches a row in `scripts/data/jobs-sources.json`. Any US school is in scope; add a
     missing one with `npm run maintain:jobs -- --add`, never reject a posting because the school isn't in CSRankings.
   - `public/nsf-name-crosswalk.csv`: [nsf.md](nsf.md). `public/manual_affiliations.csv`: [affiliations.md](affiliations.md).
4. Clean and verified: `gh pr merge <n> --squash --delete-branch`. A wrong `track`, `level`, deadline, or other field
   on a posting that does exist is not a reason to reject: fix it on the PR branch, list the corrections in a PR
   comment, and merge. Reject (comment naming each item and why) only postings or facts with no official support;
   never merge a partial subset silently.

## Direct commits to `main`

Local sessions commit data straight to `main`, so PR review alone misses them. `scripts/data/audit-reviewed.txt`
holds the full sha of the last `main` commit whose data changes were audited. (It replaced the `audit-reviewed` tag,
which cloud sessions can't push.) Do this after the PRs and Issues; it never holds up a merge, and it
only corrects records (never deletes one or reverts a commit).

1. `git fetch origin && git log --reverse --format='%h %an %s' "$(cat scripts/data/audit-reviewed.txt)"..origin/main -- public/jobs.json public/grants.json public/labs.json csconfs/data/conferences.json public/manual_affiliations.csv public/nsf-name-crosswalk.csv`.
   Skip squash merges of audited PRs (`(#n)` subjects), the auditor's own fix commits, and model-free Action commits.
2. Oldest first, `git diff <sha>^ <sha> -- <file>` and re-verify the new or changed records exactly as for a PR
   (for jobs: every record's `track`, `level`, `deadline`, `closedAt`; a third of the other facts).
3. Fix confirmed errors on `main` with a commit naming each corrected record and its official URL; validate, push.
4. Write the last fully audited sha to `scripts/data/audit-reviewed.txt`, commit it on `main` as
   `[scheduled:audit] Data audited through <short sha>`, and push. Never move the marker past a commit you did not
   finish; the next run resumes there. The marker commit touches no data file, so the next run's log skips it.

## Data warnings

`npm run lint:data` prints suspects that a script can flag but not settle: a jobs page on another country's domain
(wrong school?), two open postings with the same department, title, and deadline, dates out of order in an upcoming
conference edition, an `http://` link, a grant whose newest date is years old or whose text says it is not offered.
Hard errors (malformed dates, unknown fields, bad enums, duplicates) are not here: `npm test` already rejects them.

Take up to 10 warnings per run, oldest-looking first. For each, open the official page and either fix the record on
`main` (commit naming the record and its official URL), or, if the page doesn't settle it, file one
`[scheduled:audit] Data warning: <record>` Issue with what you checked (deduplicate against open Issues). A warning
that turns out fine stays as it is; note it in the automation-health comment so the next run skips it.

## Issues

- Data errors and side findings: verify live; if confirmed, fix, validate, push, and close with what changed and
  the source. If the evidence is wrong, close with the reason.
- Submissions (`*-submit.html`): a lead, not a source. Verify the official URL, apply per the domain playbook, or
  close with the reason.
- Policy questions, conflicting official sources, or anything that would delete data: comment with findings and a
  recommendation, and leave it open for the owner.
