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
npx playwright test test/e2e/core-flows.spec.js --grep "CS Confs"
```

Also inspect the diff to ensure changes are limited to the intended conference
editions and all cycles received the same shared metadata.
