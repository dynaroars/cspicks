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

Local sessions commit data straight to `main`, so PR review alone misses them. The `audit-reviewed` tag marks the
last `main` commit whose data changes were audited. Do this after the PRs and Issues; it never holds up a merge, and it
only corrects records (never deletes one or reverts a commit).

1. `git fetch origin --tags && git log --reverse --format='%h %an %s' audit-reviewed..origin/main -- public/jobs.json public/grants.json public/labs.json csconfs/data/conferences.json public/manual_affiliations.csv public/nsf-name-crosswalk.csv`.
   Skip squash merges of audited PRs (`(#n)` subjects), the auditor's own fix commits, and model-free Action commits.
2. Oldest first, `git diff <sha>^ <sha> -- <file>` and re-verify the new or changed records exactly as for a PR
   (for jobs: every record's `track`, `level`, `deadline`, `closedAt`; a third of the other facts).
3. Fix confirmed errors on `main` with a commit naming each corrected record and its official URL; validate, push.
4. `git tag -f audit-reviewed <last fully audited sha> && git push -f origin audit-reviewed`. Never move the tag past
   a commit you did not finish; the next run resumes there. If the tag push is refused, report the last audited sha in
   the automation-health Issue and carry on.

## Issues

- Data errors and side findings: verify live; if confirmed, fix, validate, push, and close with what changed and
  the source. If the evidence is wrong, close with the reason.
- Submissions (`*-submit.html`): a lead, not a source. Verify the official URL, apply per the domain playbook, or
  close with the reason.
- Policy questions, conflicting official sources, or anything that would delete data: comment with findings and a
  recommendation, and leave it open for the owner.
