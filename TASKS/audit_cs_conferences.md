# CS Conference Schedule Audit (`audit_cs_conferences.md`)

> **Autonomous Goal Directive (`/goal TASKS/audit_cs_conferences.md`):**  
> Systematically audit and update Computer Science conference schedules in `csconfs/data/conferences.json` and `csconfs/data/deadlines.json`. Perform multi-query deep web research on official conference websites for upcoming conference editions, submission deadlines, locations, PC chairs, and submission portal links. Submit all updates as a GitHub PR (or GitHub Issue for unconfirmed dates). Never commit directly to `main`. Iterate in bounded batches until all conference series are verified.

---

## 🎯 Task Goal

Keep the CS Conference schedule (`csconfs.html`) accurate and up-to-date across all tracked venues (CSRankings, CORE, and specialized CS tracks).

---

## 🛠️ Research & Data Rules

1. **Ground Rule**: Unknown beats wrong. Never invent a deadline, timezone, or venue location.
2. **Official Provenance**: Verify dates directly on official conference websites (e.g., `acm.org`, `ieee.org`, `usenix.org`, `pldi26.sigplan.org`, `neurips.cc`).
3. **Data Files**:
   - `csconfs/data/conferences.json`: Series metadata (title, area, CORE rank, website URL).
   - `csconfs/data/deadlines.json`: Edition deadlines, Abstract/Paper deadline timestamps (ISO with UTC timezone offset), timezone, submission URL, location, and chairs.
4. **Local Verification**:
   - Every batch MUST run and pass:
     ```bash
     npm test && npm run typecheck && npm run build && git diff --check
     ```
5. **PR Submission**:
   - Create a topic branch (e.g. `task/audit-csconfs-2026-q3`).
   - Submit a GitHub Pull Request with clear links to official conference sites.
   - Do NOT commit directly to `main`.
