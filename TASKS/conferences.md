# CS Conference schedule (`csconfs/data/conferences.json`)

> **`/goal TASKS/conferences.md`**: Audit current and upcoming conference editions on official sites, and add new series. Work in bounded batches and open a PR on a
> topic branch for each; never push to `main`. Scheduled runs stop at the cap in
> [docs/AUTOMATION.md](../docs/AUTOMATION.md).

**Unknown beats wrong**: never fill a field from a prior year, a third-party tracker, or a guess.
Validate every batch with `npm test && npm run typecheck && npm run build && git diff --check`.

`csconfs/data/conferences.json` is maintained as part of this repository and
is the page's source of truth. Building and deploying CS Picks does not
require another checkout, a synchronization step, or a runtime data service.
There is intentionally no sync with any upstream schedule service — updates
come only from research agents citing an official page, reviewed and applied
centrally, following the process below.

Cadence in practice: a **weekly** shallow pass on series with deadlines in
the next ~2 months (these change most and matter most to visitors), plus a
**monthly** full audit across all current/upcoming editions.

## Scope

By default, update current and upcoming editions only. Older entries are
historical backfill and should be changed only when specifically needed.

Tracked venues cover every CORE A* and CORE A conference referenced by
`src/data/conference-sets.ts` (`coreAStarMap` / `coreAMap`), not just
CSRankings' own default/next-tier set. 89 CORE A/A* series were added as
skeleton records (`verified: false`, only `name`/`venueKeys`/`description`
populated, `year: 2026` placeholder) without researched dates — prioritize
these in upcoming passes over re-verifying already-populated entries.

**Other venues.** A small owner-curated set of standing conferences outside the CSRankings and CORE A/A*
sets (currently VMCAI, CPP, FormaliSE, NFM — Issue #24) is tracked with `"other": true`, an empty
`venueKeys`, and a manual `area` (an `areaLabels` key such as `soft`, `plan`, `log`). They show an
"Other venue" badge and appear only under the **All (Union)** conference set; every CSRankings/CORE set
ignores them. They are audited by the same routine and workflows as every other series (the controller
queues them by `name`). Never add one on your own: only the owner adds to this list (typically by
approving an Issue), only standing conferences qualify (not workshops, which come and go), and the
routine never changes `other` or `area` on an existing record.

Search records by `name` and `year`. Conferences with multiple submission
cycles have several objects with the same name and year. Research the shared
conference details once, then update every cycle for that edition.

## Source priority — official URL graph first

Most conference series have a stable website, and each edition commonly
lives in a year-specific directory, subdomain, or route. Start from those
known official pages and traverse their links. Do not begin with an
unrestricted search of random sites. Use sources in this order:

1. The record's existing official `link` for that edition.
2. Its official `seriesLink` and the series site's edition/year navigation.
3. An adjacent edition's official URL with the year changed using the site's
   established pattern.
4. Official sponsor pages: ACM SIGs, IEEE, USENIX, IACR, or another organizing
   society.
5. Official proceedings front matter or the official digital-library record.
6. A domain-restricted search of the known official domain.
7. General web search only to locate a missing official site.

Third-party calendars, deadline trackers, social posts, personal CVs, and
aggregators may reveal a lead, but they are not evidence for changing a
field, and no tracker is privileged.

## Recognizing edition URL patterns

Inspect at least two known editions when possible. Common official patterns
include:

```text
https://example.org/2026/             → https://example.org/2027/
https://2026.example.org/             → https://2027.example.org/
https://conf.researchr.org/home/x-2026 → https://conf.researchr.org/home/x-2027
https://www.usenix.org/conference/x26 → https://www.usenix.org/conference/x27
https://example.org/x2026/            → https://example.org/x2027/
```

A derived URL is only a discovery attempt. Before using it, confirm that:

- the page loads rather than presenting a generic 404 or parked domain;
- its title and body name the intended conference and year;
- it is on the same official domain or is linked from the official series site;
- it has not silently redirected to a different edition;
- dates are announcements for that edition, not an archived prior-year block.

Do not infer facts merely because a plausible year-modified URL exists.

## Workflow A: discover a new edition

1. Find the latest local record for the conference series.
2. Open its `seriesLink`, or its edition `link` when no series URL exists.
3. Look for navigation labeled Upcoming, Next edition, Conferences, Archive,
   Events, or the target year.
4. Inspect the latest and previous edition URLs to identify the year pattern.
5. Try the next-year official URL and validate it using the checks above.
6. Crawl the official edition site in this order:
   - Call for Papers / Important Dates;
   - Organizing or Program Committee;
   - Venue / Attend / Travel;
   - Home page and News.
7. Record only fields explicitly announced for the target edition.
8. When an edition is confirmed but a field is unannounced, report `NOT FOUND`;
   do not carry a prior-year chair, place, or deadline forward as fact.
9. If dates are intentionally projected for planning, mark the record
   `estimated: true` and keep it distinct from verified information.

## Workflow B: audit an existing edition

Audit the exact official edition URL stored in the record before looking
elsewhere. Check every field independently:

- `name` and `year` match the page;
- `link` points to the correct edition and `seriesLink` to the series;
- `date` and `place` match the event information;
- abstract, submission, rebuttal, and notification dates match the CFP;
- chair names come from the correct role, without confusing general chairs,
  program chairs, track chairs, or proceedings editors;
- `estimated` remains true unless the submission timeline is confirmed;
- `verified` is true only when the important schedule facts have official
  support;
- all submission cycles for the same conference year share the same event,
  venue, and chair metadata.

Dates are calendar dates. Preserve them as `YYYY-MM-DD` without timezone
conversion. A submission deadline is interpreted by the site as Anywhere on
Earth unless the official page explicitly states another timezone.

## Staying on the official site

Once an official domain is known, prefer its internal navigation and a
domain-restricted query such as:

```text
site:official-domain.example 2027 "important dates"
site:official-domain.example 2027 "program chairs"
site:official-domain.example 2027 venue
```

Use the result only if it resolves to an official page. If an official
edition site moves to a new domain, verify the move through a link from the
old series site or sponsoring society.

## Evidence format

Every proposed field update must include its own supporting URL. One page may
support several fields, but do not cite a home page for details found only on
a different committee or CFP page. Return findings in this exact structure:

```text
CONF: <conference name>
YEAR: <edition year>
EDITION_URL: <validated official edition URL>
FIELD: <date|place|abstractDeadline|deadline|rebuttalDate|notificationDate|generalChair|programChair|link|seriesLink>
CURRENT: <current local value or MISSING>
VALUE: <confirmed value or NOT FOUND>
SOURCE: <official page containing the value>
EVIDENCE: <short paraphrase of what the page establishes>
CONFIDENCE: <confirmed|needs-review>
```

Use one block per field. Keep quotes short; paraphrase whenever possible.

## Agent boundaries

Research agents are read-only: they inspect a bounded group of related
conference series and return structured evidence blocks. They do not edit
`conferences.json`. The coordinating agent:

1. verifies the official sources;
2. resolves conflicting findings;
3. applies updates to every applicable cycle;
4. validates venue keys and date formats;
5. runs the tests and build.

Group roughly four to six related series per research agent — enough context
to recognize shared society sites and URL conventions without making scope
too broad. Run independent groups in parallel when capacity allows.

A suitable research brief:

```text
Research the listed conference editions without editing files. Follow the
official URL graph source order, edition-URL validation, stop conditions, and
exact evidence-block format from TASKS/conferences.md.

Start from these local official URLs:
- <CONF YEAR>: edition=<link>, series=<seriesLink>

Audit these fields:
- <CONF YEAR>: <missing, estimated, or suspect fields>

Do not infer unpublished facts from prior years. Return NOT FOUND when an
official source does not establish a field.
```

## Stop conditions

Report `NOT FOUND` and stop instead of guessing when:

- the next edition has not been announced;
- only a third-party listing contains the claimed fact;
- a derived URL does not identify the intended year;
- official pages disagree and the conflict cannot be resolved;
- a role is ambiguous;
- a date appears to be copied from a prior edition.

Unknown is valid data. A visible gap is safer than a confident-looking but
unsupported schedule.

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
`src/data.ts`, because they drive the shared conference-set and research-area
filters. Compound events may have more than one key.

## Editing rules

- Apply a shared place or chair to every cycle for the same conference year.
- Never replace a known value with an estimate.
- Never invent a general chair from a program-chair listing, or vice versa.
- Keep external links on `http` or `https`.
- Preserve `estimated` when only the location or chairs have been confirmed.
- Keep the JSON valid and do not remove old editions during routine updates.
- `place` should be just `City, Country` (e.g. `"Kyoto, Japan"`) — for the US,
  `City, ST, US` (e.g. `"Austin, TX, US"`), using the two-letter state code.
  Do not include the venue/hotel/convention-center name. For a virtual or
  hybrid edition, use `"Virtual"`/`"Virtual Conference"`/`"Hybrid"` rather than
  encoding the origin city in parentheses — `src/csconfs/place.ts` (`parsePlace`)
  renders this field and derives the country flag shown next to the
  conference name from the trailing country/state token, so an unrecognized
  or non-conforming value just won't get a flag (harmless, but worth fixing
  when you're already touching that record). Extend `COUNTRY_CODES` in
  `src/csconfs/place.ts` when a genuinely new country shows up.

## Verification

After editing, run:

```bash
npm test
npm run build
npx playwright test test/e2e/csconfs.spec.js
```

Also inspect the diff to ensure changes are limited to the intended
conference editions and all cycles received the same shared metadata.

## Data credits

`csconfs/data/conferences.json` is versioned and deployed with CS Picks; the
page never fetches schedule data from another repository or service. The
records were assembled through official conference-site research and
contributor corrections, preserving the final unpublished metadata work from
the retired schedule project (dates, places, chairs, verification status,
expanded rolling-deadline cycles). [CSRankings](https://csrankings.org/) and
[CORE](https://portal.core.edu.au/conf-ranks/) define the venue sets and
research-area mappings referenced by each record's `venueKeys`. Historical
acceptance and submission totals came from
[emeryberger/csconferences](https://github.com/emeryberger/csconferences).
These are credits, not runtime or maintenance dependencies.

## Discovering new series

Look for CORE A/A* or CSRankings venues not yet in `conferences.json` (dedup against every `name` and
`venueKeys`). `venueKeys` must be keys `src/data.ts` already recognizes; if a strong candidate has none, open an
Issue instead. Never add an `"other": true` record (owner-curated, see "Other venues" above). New records set
`estimated`/`verified` honestly and leave unknown fields `null`.
