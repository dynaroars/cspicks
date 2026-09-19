# Grants & Fellowships Audit (`update_grants_and_awards.md`)

> **Autonomous Goal Directive (`/goal TASKS/update_grants_and_awards.md`):**  
> Audit and update research grant opportunities and fellowship listings in `public/grants.json`. Perform thorough web research across funding agency portals (NSF, DARPA, NIH, Sloan Foundation, Google Research Grants, Amazon Research Awards, etc.) to discover new call cycles, verify upcoming submission deadlines, update eligibility criteria and sponsor tags, and archive expired opportunities. Submit updates as a GitHub PR. Never commit directly to `main`. Iterate in bounded batches until all grant entries are verified.

---

## 🎯 Task Goal

Ensure the Grants & Awards tool (`grants.html`) displays current, authoritative funding opportunities for CS faculty, postdocs, and graduate students.

---

## 🛠️ Research & Data Rules

1. **Authoritative Provenance**: Only add or update grants with verified official call-for-proposal URLs.
2. **Schema Integrity**:
   - `public/grants.json` array of objects.
   - Required fields: `id`, `name`, `sponsor`, `amount`, `deadline`, `url`, `audience`, `topic`, `status`.
   - Deadline strings MUST use ISO format (`YYYY-MM-DD`).
3. **Local Verification**:
   - Every batch MUST run and pass:
     ```bash
     npm test && npm run typecheck && npm run build && git diff --check
     ```
4. **PR Submission**:
   - Commit changes to a topic branch (e.g. `task/update-grants-2026`).
   - Open a Pull Request detailing added/updated grant programs and official source links.
