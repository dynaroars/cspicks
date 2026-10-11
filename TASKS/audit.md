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
   - `public/jobs.json`: [jobs.md](jobs.md): every changed deadline and `closedAt` against the official posting, no
     record deleted, `school` matches a row in `scripts/data/jobs-sources.json`. Any US school is in scope; add a
     missing one with `npm run maintain:jobs -- --add`, never reject a posting because the school isn't in CSRankings.
   - `public/nsf-name-crosswalk.csv`: [nsf.md](nsf.md). `public/manual_affiliations.csv`: [affiliations.md](affiliations.md).
4. Clean and verified: `gh pr merge <n> --squash --delete-branch`. Otherwise comment naming each rejected item and
   why; never merge a partial subset silently.

## Issues

- Data errors and side findings: verify live; if confirmed, fix, validate, push, and close with what changed and
  the source. If the evidence is wrong, close with the reason.
- Submissions (`*-submit.html`): a lead, not a source. Verify the official URL, apply per the domain playbook, or
  close with the reason.
- Policy questions, conflicting official sources, or anything that would delete data: comment with findings and a
  recommendation, and leave it open for the owner.
