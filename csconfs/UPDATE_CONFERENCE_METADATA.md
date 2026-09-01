# Updating conference metadata

The conference schedule is maintained locally in
`csconfs/data/conferences.json`. There is no upstream synchronization step.
This runbook preserves the useful maintenance process from the retired
schedule project while using the standalone CS Picks schema.

Research agents must also follow
[AGENT_RESEARCH_GUIDE.md](AGENT_RESEARCH_GUIDE.md), which defines the official
edition-URL-first discovery and audit process, evidence format, and stop rules.

## Scope

By default, update current and upcoming editions only. Older entries are
historical backfill and should be changed only when specifically needed.

Search records by `name` and `year`. Conferences with multiple submission
cycles have several objects with the same name and year. Research the shared
conference details once, then update every cycle for that edition.

## Sources

Updates are primarily gathered by sending research agents to inspect known
official conference sites for newly announced editions and missing fields.
Agents begin with each record's edition and series URLs, follow year navigation
or validated adjacent-year URL patterns, and use broad web search only to find
a missing official site. Every fact applied to the dataset must be supported by
a primary source:

- the official conference or committee page;
- the sponsoring society, ACM, IEEE, USENIX, IACR, or SIG page;
- official proceedings front matter.

Third-party deadline lists and search indexes may help an agent discover a
candidate update, but no tracker is privileged and none is sufficient evidence
on its own. Do not turn an aggregator, personal CV, or inferred prior-year
pattern into a verified fact. Leave an unknown field as `null`. Dates projected
from an earlier edition must retain `estimated: true` until the submission
timeline itself is officially confirmed.

## Agent research workflow

1. Inspect the local JSON and collect missing or estimated fields for current
   and upcoming conference years.
2. Group four to six related conference series per research agent. Agents are
   research-only and must not edit the shared data file.
3. Run independent groups in parallel when capacity allows.
4. Require one structured result per fact: conference, year, field, value, and
   official source URL. Agents must explicitly report `NOT FOUND` rather than
   guess.
5. Review the cited official pages, then apply confirmed results centrally to
   every cycle of the corresponding conference edition.

## Automated weekly maintenance

The repository includes a resumable controller that turns this workflow into
a bounded weekly job:

```bash
npm run maintain:csconfs -- run
```

The default run selects six high-priority conference series, researches each
series in a separate LLM invocation, applies the completed batch, runs the
required checks, commits directly to `main`, and pushes. Use `--no-push` to
leave the successful commit local.

Useful commands include:

```bash
# Inspect the next batch without agents, state changes, Git operations, or writes.
npm run maintain:csconfs -- run --dry-run

# Research one series or choose Claude instead of the default Codex provider.
npm run maintain:csconfs -- run --conference PLDI
npm run maintain:csconfs -- run --agent claude

# Process a capped sweep in restartable six-series batches.
npm run maintain:csconfs -- run --total 30 --limit 6

# Force a complete sweep, including recently checked series.
npm run maintain:csconfs -- run --all

# Inspect, stop, and later resume the saved run.
npm run maintain:csconfs -- status
npm run maintain:csconfs -- stop
npm run maintain:csconfs -- run

# Abandon a stopped checkpoint while preserving its logs.
npm run maintain:csconfs -- reset
```

The default queue prioritizes missing or `TBD` deadlines, estimated or
unverified editions, suspicious year-specific URLs, inconsistent cycles,
impossible date ordering, missing next editions, and finally records whose
official-site check is older than 30 days. `--stale-days N` changes that final
interval. A `NOT FOUND` result is deferred for 21 days so a weekly run does not
spend tokens repeatedly checking an unannounced edition.

### Resumption and state

Operational state and full agent logs live outside the checkout under
`~/.local/state/cspicks-csconfs-maintenance` by default. Override that location
with `CSCONFS_MAINTENANCE_STATE_DIR`. The controller checkpoints after every
structured research result and before each apply, check, commit, and push
stage.

Research is collected before the repository is changed. If an agent reaches a
token or rate limit, the controller pauses with the accepted proposals still
saved and normally leaves the checkout clean. Running the same command later
resumes automatically. An explicitly supplied `--agent codex|claude` may be
used to switch providers when resuming.

The controller also records the latest outcome, directly supporting official
URLs, and field-level evidence in `csconfs/maintenance/checks.json`. That file
is maintenance provenance; `data/conferences.json` remains the only runtime
schedule source.

For a weekly cron entry, use an explicit repository path and capture output:

```cron
17 6 * * 1 cd /path/to/cspicks && npm run maintain:csconfs -- run >> "$HOME/.local/state/cspicks-csconfs-maintenance/cron.log" 2>&1
```

### Agent configuration and safety

Codex must be authenticated and is invoked with live search in a read-only
sandbox. Claude is limited to read/search/fetch tools. The controller alone
writes JSON and runs Git. Provider defaults may be overridden with:

```text
CSCONFS_CODEX_MODEL
CSCONFS_CODEX_REASONING_EFFORT
CSCONFS_CLAUDE_MODEL
CSCONFS_AGENT_TIMEOUT_MINUTES
```

A new run requires a clean `main` checkout and begins with a fast-forward-only
pull. The controller refuses unrelated working-tree changes, never deletes
historical editions, rejects estimates presented as verified facts, prevents
known dates from being erased, and requires official source evidence for every
changed factual field. New editions require explicit official proof of the
edition and year. If validation or tests fail, the checkpoint is retained for
inspection rather than silently publishing partial work.

A suitable research brief is:

```text
Research the listed conference editions without editing files. Follow
csconfs/AGENT_RESEARCH_GUIDE.md, including its official URL graph source order,
edition-URL validation, stop conditions, and exact evidence-block format.

Start from these local official URLs:
- <CONF YEAR>: edition=<link>, series=<seriesLink>

Audit these fields:
- <CONF YEAR>: <missing, estimated, or suspect fields>

Do not infer unpublished facts from prior years. Return NOT FOUND when an
official source does not establish a field.
```

## Local schema

The principal fields are:

```json
{
  "name": "PLDI",
  "venueKeys": ["pldi"],
  "year": 2027,
  "description": "Programming Language Design and Implementation",
  "link": "https://example.org/",
  "seriesLink": "https://example.org/series",
  "date": "June 2027",
  "place": "Example City",
  "abstractDeadline": "2026-11-01",
  "deadline": "2026-11-08",
  "rebuttalDate": null,
  "notificationDate": "2027-02-01",
  "note": null,
  "generalChair": null,
  "programChair": null,
  "acceptanceRate": null,
  "submissions": null,
  "estimated": false,
  "verified": true
}
```

Calendar deadlines should use `YYYY-MM-DD`; `"TBD"` and `null` are supported
for unknown deadlines. Event `date` may retain the human-readable range shown
by the official site. `venueKeys` must use identifiers already recognized by
`src/data.js`, because they drive the shared conference-set and research-area
filters. Compound events may have more than one key.

## Editing rules

- Apply a shared place or chair to every cycle for the same conference year.
- Never replace a known value with an estimate.
- Never invent a general chair from a program-chair listing, or vice versa.
- Keep external links on `http` or `https`.
- Preserve `estimated` when only the location or chairs have been confirmed.
- Keep the JSON valid and do not remove old editions during routine updates.

## Verification

After editing, run:

```bash
npm test
npm run build
npx playwright test test/e2e/csconfs.spec.js
```

Also inspect the diff to ensure changes are limited to the intended conference
editions and all cycles received the same shared metadata.
