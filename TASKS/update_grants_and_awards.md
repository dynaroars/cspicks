# Grants & Fellowships Audit (`update_grants_and_awards.md`)

> **Autonomous Goal Directive (`/goal TASKS/update_grants_and_awards.md`):**  
> Audit and update research grant opportunities and fellowship listings in `public/grants.json`. Execute the audit workflow across **ALL GRANT CATEGORIES AND BATCHES CONTINUOUSLY** until **100% of listed grant entries are fully verified**. Perform thorough web research across funding agency portals (NSF, DARPA, NIH, Sloan Foundation, Google Research Grants, Amazon Research Awards, etc.) to discover new call cycles, verify upcoming submission deadlines, update eligibility criteria and sponsor tags, and archive expired opportunities. Submit updates as a GitHub PR. Return to `main` and **IMMEDIATELY PROCEED TO THE NEXT BATCH**. Do NOT stop execution until ALL grants are verified!

---

## 🎯 Task Goal

Ensure the Grants & Awards tool (`grants.html`) displays current, authoritative funding opportunities for CS faculty, postdocs, and graduate students.

---

## 🛠️ Research & Data Rules

1. **Continuous Execution Mandate:** Do NOT stop after a single batch. Iterate through **all grant entries** until the full dataset is complete.
2. **Authoritative Provenance**: Only add or update grants with verified official call-for-proposal URLs.
3. **Schema Integrity**:
   - `public/grants.json` array of objects (`id`, `name`, `sponsor`, `amount`, `deadline`, `url`, `audience`, `topic`, `status`).
   - Deadline strings MUST use ISO format (`YYYY-MM-DD`).
4. **Local Verification**:
   - Every batch MUST run and pass:
     ```bash
     npm test && npm run typecheck && npm run build && git diff --check
     ```
5. **PR Submission**:
   - Commit changes to a topic branch (e.g. `task/update-grants-batch-1`).
   - Open a Pull Request detailing added/updated grant programs and official source links.
