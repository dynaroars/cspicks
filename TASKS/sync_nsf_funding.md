# NSF Funding & Name Crosswalk Sync (`sync_nsf_funding.md`)

> **Autonomous Goal Directive (`/goal TASKS/sync_nsf_funding.md`):**
> Execute the task workflow across **ALL BATCHES CONTINUOUSLY** until **100% of items in the repository are fully audited and processed**. Synchronize NSF award funding data and maintain the faculty name crosswalk mapping in `public/nsf-name-crosswalk.csv` and `public/nsf-awards.json`. Audit unmatched faculty between CSRankings rosters and NSF award records, run `npm run sync:nsf:names` and local rebuild commands, and verify institutional attribution rules. Submit all data updates as a GitHub PR. Never commit directly to `main`. Do NOT stop execution until ALL batches are completed!

---

## 🎯 Task Goal

Ensure NSF award tracking (`nsf.html`) accurately matches CSRankings faculty names and institution affiliations without missing active funding or misattributing awards.

---

## 🛠️ Execution & Verification Commands

1. **Name Matching Sync**:
   ```bash
   npm run sync:nsf:names
   ```
2. **Review Crosswalk Diff**:
   - Inspect changes in `public/nsf-name-crosswalk.csv`. Verify that crosswalk additions correctly map author aliases.
3. **Rebuild Static Awards Dataset**:
   ```bash
   npm run sync:nsf:rebuild
   ```
4. **Local Verification**:
   ```bash
   npm test && npm run typecheck && npm run build && git diff --check
   ```
5. **PR Submission**:
   - Submit crosswalk and dataset updates via GitHub PR.
