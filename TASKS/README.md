# CS Picks Autonomous Task Suite (`TASKS/`)

This directory contains executable task playbooks for maintaining the **CS Picks** codebase and data files (`csconfs/data/conferences.json`, `public/grants.json`, `public/nsf-awards.json`, `public/nsf-name-crosswalk.csv`, `public/manual_affiliations.csv`, etc.).

---

## 🚀 One-Line Execution Model

Each playbook is pre-configured with an **Autonomous Goal Directive** header. You can trigger any workflow by typing `/goal TASKS/<filename>.md`:

```bash
/goal TASKS/discover_new_conferences.md
/goal TASKS/discover_new_grants.md
/goal TASKS/audit_cs_conferences.md
/goal TASKS/update_grants_and_awards.md
/goal TASKS/sync_nsf_funding.md
/goal TASKS/verify_manual_affiliations.md
/goal TASKS/sync_csrankings_rules.md
/goal TASKS/AUDIT_ISSUES_PRS.md
```

---

Scheduled cloud routines run these playbooks with batch caps, titles, and a review handoff defined in [`docs/AUTOMATION.md`](../docs/AUTOMATION.md), which takes precedence over the "continue until 100%" directives for unattended runs.

---

## 🔒 PR & Issue Submission Protocol (No Direct Commits to `main`)

To preserve git history and ensure multi-agent safety:

1. **Maintenance & Discovery Agents DO NOT commit directly to `main`**:
   - All maintenance updates, schema fixes, and verified data refreshes MUST be committed on a dedicated topic branch (e.g. `task/audit-csconfs-batch-1`) and submitted as a **GitHub Pull Request**.
   - If an update is ambiguous, unconfirmed by official sources, or requires maintainer decision, create a **GitHub Issue** detailing the finding instead of pushing a PR.

2. **Auditor Agent (`/goal TASKS/AUDIT_ISSUES_PRS.md`)**:
   - Reviews open Pull Requests and Issues.
   - Runs full verification (`npm test && npm run typecheck && npm run build && git diff --check`).
   - Squash-merges verified PRs into `main`, deletes topic branches, and closes resolved issues.

---

## 📋 Task Playbooks Overview

| Playbook | Purpose | Core Output |
| :--- | :--- | :--- |
| [`discover_new_conferences.md`](discover_new_conferences.md) | Search ACM/IEEE calendars and WikiCFP to discover new CS conferences and workshops. | `csconfs/data/conferences.json` PRs |
| [`discover_new_grants.md`](discover_new_grants.md) | Search funding agencies, foundations, and tech giants for new grant programs and fellowships. | `public/grants.json` PRs |
| [`audit_cs_conferences.md`](audit_cs_conferences.md) | Audit upcoming CS conference dates, submission deadlines, locations, PC chairs, and submission URLs. | `csconfs/data/conferences.json` PRs |
| [`update_grants_and_awards.md`](update_grants_and_awards.md) | Refresh grant opportunities, deadline dates, award sponsors, eligibility criteria, and topic tags. | `public/grants.json` PRs |
| [`sync_nsf_funding.md`](sync_nsf_funding.md) | Synchronize NSF awards data and verify author crosswalk name matching. | `public/nsf-awards.json`, `public/nsf-name-crosswalk.csv` PRs |
| [`verify_manual_affiliations.md`](verify_manual_affiliations.md) | Audit and correct manual OpenAlex affiliation overrides for professors and universities. | `public/manual_affiliations.csv` PRs |
| [`sync_csrankings_rules.md`](sync_csrankings_rules.md) | Update CSRankings taxonomy venue rules, rebuild sitemaps, OG images, and verify repo size limits. | Rules & generated static asset PRs |
| [`AUDIT_ISSUES_PRS.md`](AUDIT_ISSUES_PRS.md) | Autonomous auditor agent that tests, squash-merges clean PRs into `main`, and closes resolved GitHub Issues. | Repository merge & issue closure |
