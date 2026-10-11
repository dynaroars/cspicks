# Maintenance

Index of every data-refresh workflow. Each domain has one playbook in [`TASKS/`](TASKS/) with its commands,
schema, and source rules; [docs/AUTOMATION.md](docs/AUTOMATION.md) says which ones run on a schedule.

**Ground rule: unknown beats wrong.** Never fabricate a deadline, amount, chair, or figure. If an official source
doesn't confirm a fact, leave it `null`/`TBD` and say so.

| Cadence | Domain | What to run | Playbook |
| --- | --- | --- | --- |
| Daily (owner's cron) | OpenAlex affiliation history | `scripts/daily-openalex-sync.sh`; check `.openalex-cron.log` if stale | [affiliations.md](TASKS/affiliations.md) |
| Quarterly (scheduled) | Manual affiliation corrections | re-verify `public/manual_affiliations.csv` | [affiliations.md](TASKS/affiliations.md) |
| Every other day (scheduled) | CS Conference schedule | `npm run maintain:csconfs -- --dry-run --limit 12` lists what's due | [conferences.md](TASKS/conferences.md) |
| Twice weekly (scheduled) | Grants & awards | audit entries by deadline; monthly discovery pass | [grants.md](TASKS/grants.md) |
| Twice weekly (scheduled) | US jobs | `npm run maintain:jobs -- --limit 30` lists schools due | [jobs.md](TASKS/jobs.md) |
| Monthly (scheduled) | NSF name matching, CSRankings rules | `npm run sync:nsf:names`, `npm run sync:csrankings-rules` | [nsf.md](TASKS/nsf.md), [csrankings.md](TASKS/csrankings.md) |
| Quarterly (GitHub Action) | NSF full resync | `.github/workflows/nsf-full-sync.yml` (`npm run sync:nsf:all`) | [nsf.md](TASKS/nsf.md) |
| Quarterly (GitHub Action) | CORE A/A* extra publications | `.github/workflows/dblp-core-extra.yml` | [csrankings.md](TASKS/csrankings.md) |
| When submissions arrive | Jobs, grants, conferences | verify against the official page, then apply | the domain's playbook |
| Before a release | Sitemap, OG image | `npm run sitemap`, `npm run og:image` | [csrankings.md](TASKS/csrankings.md) |
| Never | CSRankings CSVs | fetched live at page load; nothing to refresh | [csrankings.md](TASKS/csrankings.md) |

Reviewing PRs and Issues: [TASKS/audit.md](TASKS/audit.md).

## Verification checklist (after any data change)

```bash
npm test && npm run typecheck && npm run build && git diff --check
```

Run the touched page's Playwright spec (`npx playwright test test/e2e/<page>.spec.js`) after schema changes.
Then inspect the diff:

- Generated files (`nsf-awards.json`, `professor_history_openalex.json`, `school-aliases.json`,
  `csrankings-rules.generated.js`): a near-total rewrite or a sudden drop in entries means upstream changed
  shape. Don't commit it; investigate.
- Researched files (`conferences.json`, `grants.json`, `jobs.json`, `manual_affiliations.csv`,
  `nsf-name-crosswalk.csv`): every changed fact traces to an official page you actually opened.

## Repo size guard

`npm run check:size` fails if a large generated data file exceeds 40 MiB. Run it after adding a large asset.
