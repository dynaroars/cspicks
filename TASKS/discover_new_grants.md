# Discover New Grants & Research Awards (`discover_new_grants.md`)

> **Autonomous Goal Directive (`/goal TASKS/discover_new_grants.md`):**
> Execute the task workflow across **ALL BATCHES CONTINUOUSLY** until **100% of items in the repository are fully audited and processed**. Systematically discover new research grant opportunities, young investigator awards, CAREER grants, foundation fellowships (Sloan, Packard, Guggenheim, Simons, MacArthur), and industry research award programs (Google Research Scholar, Meta Research Awards, Amazon Research Awards, Microsoft Research Fellows, IBM Academic Awards) to expand `public/grants.json`. Conduct deep web searches across sponsor portals to verify eligibility criteria, award amounts, deadlines, and application links. Submit new grant entries as a GitHub PR. Never commit directly to `main`. Iterate in bounded batches. Do NOT stop execution until ALL batches are completed!

---

## 🎯 Task Purpose & Scope

Proactively expand the Grants & Fellowships directory (`grants.html`) with new computer science and cross-disciplinary funding opportunities.

---

## 🛠️ Schema & Verification Rules

1. **Required Schema**:
   - `id`, `name`, `sponsor`, `amount`, `deadline`, `url`, `audience`, `topic`, `status`.
2. **ISO Date Format**:
   - Deadline strings MUST use ISO format (`YYYY-MM-DD`).
3. **Local Verification**:
   ```bash
   npm test && npm run typecheck && npm run build && git diff --check
   ```
4. **PR Submission**:
   - Submit new entries via GitHub Pull Request on a topic branch (e.g. `task/discover-grants-2026`).
