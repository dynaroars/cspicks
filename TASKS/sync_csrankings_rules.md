# CSRankings Rules & Static Assets Sync (`sync_csrankings_rules.md`)

> **Autonomous Goal Directive (`/goal TASKS/sync_csrankings_rules.md`):**
> Execute the task workflow across **ALL BATCHES CONTINUOUSLY** until **100% of items in the repository are fully audited and processed**. Audit and synchronize CSRankings taxonomy rules, venue mappings, sitemaps, and social preview cards. Execute `npm run sync:csrankings-rules`, `npm run sitemap`, `npm run og:image`, and `npm run check:size` to verify static asset integrity. Submit updates as a GitHub PR. Never commit directly to `main`. Do NOT stop execution until ALL batches are completed!

---

## 🎯 Task Goal

Keep CS Picks aligned with upstream CSRankings taxonomy definitions and ensure SEO sitemaps, social cards, and project file size bounds remain compliant.

---

## 🛠️ Execution Commands

```bash
npm run sync:csrankings-rules
npm run sitemap
npm run check:size
npm test && npm run typecheck && npm run build && git diff --check
```

Submit all modified generated files as a GitHub PR.
