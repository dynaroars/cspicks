# CS Conference Schedule Audit (`audit_cs_conferences.md`)

> **Autonomous Goal Directive (`/goal TASKS/audit_cs_conferences.md`):**
> Execute the task workflow across **ALL BATCHES CONTINUOUSLY** until **100% of items in the repository are fully audited and processed**. Systematically audit and update Computer Science conference schedules in `csconfs/data/conferences.json` and `csconfs/data/deadlines.json`. Execute the audit and update workflow across **ALL CONFERENCES AND BATCHES CONTINUOUSLY** until **100% of tracked conference series are fully verified**. Perform multi-query deep web research on official conference websites for upcoming conference editions, submission deadlines, locations, PC chairs, and submission portal links. Submit all updates as a GitHub PR (or GitHub Issue for unconfirmed dates). Return to `main` and **IMMEDIATELY PROCEED TO THE NEXT BATCH**. Do NOT stop execution after a single batch — continue looping until ALL conferences are completely audited. Do NOT stop execution until ALL batches are completed!

---

## 🎯 Task Goal

Keep the CS Conference schedule (`csconfs.html`) accurate and up-to-date across all tracked venues (CSRankings, CORE, and specialized CS tracks).

---

## 🛠️ Research & Data Rules

1. **Continuous Execution Mandate:** Do NOT stop after a single conference or batch. Iterate through **all remaining conference series** until the entire dataset is verified.
2. **Ground Rule**: Unknown beats wrong. Never invent a deadline, timezone, or venue location.
3. **Official Provenance**: Verify dates directly on official conference websites (e.g., `acm.org`, `ieee.org`, `usenix.org`, `pldi26.sigplan.org`, `neurips.cc`).
4. **Data Files**:
   - `csconfs/data/conferences.json`: Series metadata (title, area, CORE rank, website URL).
   - `csconfs/data/deadlines.json`: Edition deadlines, Abstract/Paper deadline timestamps (ISO with UTC timezone offset), timezone, submission URL, location, and chairs.
5. **Local Verification**:
   - Every batch MUST run and pass:
     ```bash
     npm test && npm run typecheck && npm run build && git diff --check
     ```
6. **PR Submission**:
   - Create a topic branch (e.g. `task/audit-csconfs-2026-batch-1`).
   - Submit a GitHub Pull Request with clear links to official conference sites.
   - Do NOT commit directly to `main`.
