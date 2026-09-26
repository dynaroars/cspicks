# CS Picks PR & Issue Audit Agent (`AUDIT_ISSUES_PRS.md`)

> **Autonomous Goal Directive (`/goal TASKS/AUDIT_ISSUES_PRS.md`):**
> Execute the task workflow across **ALL BATCHES CONTINUOUSLY** until **100% of items in the repository are fully audited and processed**. Inspect all open GitHub Pull Requests, PR topic branches, and open GitHub Issues in the `cspicks` repository (`../cspicks`). Validate all proposed changes against live evidence, schema contracts, and local tests (`npm test && npm run typecheck && npm run build && git diff --check`). Squash-merge clean, verified PRs into `main`, delete merged topic branches, and post detailed comment updates or close resolved issues. Iterate in bounded batches until all open PRs and issues are completely audited. Do NOT stop execution until ALL batches are completed!

---

## 🎯 Purpose & Scope

This task playbook instructs an autonomous audit agent to act as the primary review gate for all maintenance proposals, conference schedule updates, grant additions, NSF crosswalk corrections, and manual affiliation overrides in `cspicks`.

---

## 🛠️ Step-by-Step Execution Workflow

### 1. Survey Open Pull Requests & Issues
Execute git and GitHub CLI commands to audit active branches, PRs, and issues:
```bash
git fetch origin
git branch -r
gh pr list --state open
gh issue list --state open
```

### 2. Audit & Verify Pull Requests
For each open Pull Request:
1. **Checkout & Inspect**:
   ```bash
   git checkout <branch-name>
   git diff main...<branch-name>
   ```
2. **Data & Schema Verification**:
   - For `csconfs/data/conferences.json`: Verify that dates, submission URLs, locations, and conference year ranges follow `MAINTENANCE.md` standards.
   - For `public/grants.json`: Verify sponsor, deadline ISO strings, topic tags, and URL provenance.
   - For `public/nsf-name-crosswalk.csv`: Confirm faculty name matching against CSRankings and NSF recipient records.
   - For `public/manual_affiliations.csv`: Confirm start/end years and institutional affiliation names.
3. **Run Local Test & Build Suite**:
   ```bash
   npm test && npm run typecheck && npm run build && git diff --check
   ```
4. **Merge or Request Revision**:
   - If tests pass and data edits are fully verified:
     ```bash
     git checkout main
     git merge --squash <branch-name>
     git commit -m "fix/data: squash merge PR #<num> - <summary>"
     git push origin main
     git branch -d <branch-name>
     git push origin --delete <branch-name>
     gh pr close <num> --comment "Verified and squash-merged into main."
     ```
   - If changes fail tests or contain unverified claims, leave a detailed review comment on the PR explaining the exact failure or missing proof.

### 3. Process & Resolve Open Issues
For each open GitHub Issue:
1. Review the reported data error, conference date discrepancy, or broken link.
2. Search official web sources to verify the claim.
3. If verified, create a fix PR or apply the fix on a topic branch, run local verification suite (`npm test && npm run typecheck && npm run build && git diff --check`), submit/merge, and close the issue with a link to the fix commit.

---

## 🏁 Verification Checklist

- [ ] All open PRs audited and tested against `npm test && npm run typecheck && npm run build && git diff --check`.
- [ ] Approved PRs squash-merged into `main` and branch names cleaned up.
- [ ] No direct unverified commits pushed to `main`.
