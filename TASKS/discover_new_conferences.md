# Discover New CS Conferences & Venues (`discover_new_conferences.md`)

> **Autonomous Goal Directive (`/goal TASKS/discover_new_conferences.md`):**
> Execute the task workflow across **ALL BATCHES CONTINUOUSLY** until **100% of items in the repository are fully audited and processed**. Proactively search for emerging or unlisted computer science conferences, top-tier specialized workshops, and CORE/CSRankings venue additions to expand `csconfs/data/conferences.json`. Perform deep web research on official conference sites, ACM/IEEE/USENIX calendars, and WikiCFP to verify conference series metadata, research area tags, CORE ranks, and upcoming submission timelines. Submit proposed new venues as a GitHub PR. Never commit directly to `main`. Do NOT stop execution until ALL batches are completed!

---

## 🎯 Task Purpose & Scope

Expand conference coverage in the CS Conference Schedule tool (`csconfs.html`) across all computer science subfields.

---

## 🛠️ Verification & Data Rules

1. **Official Provenance**: Verify series title, area classification, CORE tier, and official conference site URL.
2. **Local Verification**:
   ```bash
   npm test && npm run typecheck && npm run build && git diff --check
   ```
3. **PR Submission**:
   - Submit new entries via GitHub Pull Request on a topic branch.
