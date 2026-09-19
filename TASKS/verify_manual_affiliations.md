# Manual Affiliation Overrides Audit (`verify_manual_affiliations.md`)

> **Autonomous Goal Directive (`/goal TASKS/verify_manual_affiliations.md`):**  
> Audit and update manual affiliation overrides in `public/manual_affiliations.csv`. Research author movement history, faculty hires, transfers, and institutional renames to fix OpenAlex affiliation errors. Verify move dates against official faculty homepages, press releases, and CVs. Submit all edits as a GitHub PR. Never commit directly to `main`.

---

## 🎯 Task Goal

Maintain clean historical affiliation overrides so publication momentum and what-if ranking simulator calculations remain accurate.

---

## 🛠️ Research & Schema Rules

1. **File Format**: `public/manual_affiliations.csv` (`author_name,start_year,end_year,institution_name`).
2. **Verification Protocol**:
   - Cross-check author move years against official university appointments or personal CVs.
   - Do not guess start/end years; use `TBD` or official documentation if uncertain.
3. **Local Verification**:
   ```bash
   npm test && npm run typecheck && npm run build && git diff --check
   ```
4. **PR Submission**:
   - Submit changes via a GitHub PR with citations for each corrected override row.
