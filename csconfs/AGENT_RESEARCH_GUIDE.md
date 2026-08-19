# Agent guide: discovering and auditing conference schedules

Use this guide when researching a new conference edition or auditing an
existing record in `csconfs/data/conferences.json`.

The core rule is **official URL graph first**. Most conference series have a
stable website, and each edition commonly lives in a year-specific directory,
subdomain, or route. Start from those known official pages and traverse their
links. Do not begin with an unrestricted search of random sites.

## Source priority

Use sources in this order:

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
aggregators may reveal a lead, but they are not evidence for changing a field.

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

Use the result only if it resolves to an official page. If an official edition
site moves to a new domain, verify the move through a link from the old series
site or sponsoring society.

## Evidence to capture

Every proposed field update must include its own supporting URL. One page may
support several fields, but do not cite a home page for details found only on a
different committee or CFP page.

Return findings in this exact structure:

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

Research agents do not edit `conferences.json`. They inspect a bounded group of
related conference series and return evidence blocks. The coordinating agent:

1. verifies the official sources;
2. resolves conflicting findings;
3. applies updates to every applicable cycle;
4. validates venue keys and date formats;
5. runs the tests and build.

Group roughly four to six related series per research agent. This gives each
agent enough context to recognize shared society sites and URL conventions
without making its scope too broad.

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
