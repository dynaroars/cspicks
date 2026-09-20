# CS Picks Maintenance Playbook

This is the **single entry point** for keeping CS Picks' data fresh. It consolidates
what used to be spread across `README.md`, `CLAUDE.md`, and four files under
`csconfs/` (`AGENTS.md`, `AGENT_RESEARCH_GUIDE.md`, `UPDATE_CONFERENCE_METADATA.md`,
`README.md`) — those files have been removed; this is the only place this
information lives now. Read this file in full before doing any data-refresh or
research work on this project.

**Ground rule for every domain below: unknown beats wrong.** Never fabricate a
deadline, amount, chair name, or funding figure to fill a gap. If an official
source doesn't confirm a fact, leave it `null`/`TBD`/unset and say so.

## How to use this file

1. Check the cadence table below for what's due.
2. Jump to that domain's section — it has the exact commands, schema, and
   research discipline.
3. Make the change.
4. Run the verification checklist near the end before committing.
5. Commit directly to `main` (per `AGENTS.md`) with a message describing what
   was refreshed and, for anything web-researched, why you believe it's
   correct (source, date checked).

## Cadence table

| Cadence | Domain | Action | Cost |
| --- | --- | --- | --- |
| **Daily (automated)** | OpenAlex affiliation history | `scripts/daily-openalex-sync.sh` via cron — already running, no action needed unless it stalls (check `.openalex-cron.log`) | Low, budget-capped |
| **Weekly** | CS Conference schedule | Scan series with deadlines in the next ~2 months for newly announced dates/venues/chairs | Medium (web research) |
| **Monthly** | NSF name matching | `npm run sync:nsf:names` | Low (2 CSV downloads) |
| **Monthly** | Grants/Awards | Scan for new call cycles, deadline updates, and expired entries | Medium (web research) |
| **Monthly** | CS Conference schedule | Full audit pass across all current/upcoming editions, not just near-term ones | Medium-high (web research) |
| **Quarterly** | NSF award data | `npm run sync:nsf:all` | High (thousands of API calls, hours) |
| **Quarterly, or when upstream changes** | CSRankings taxonomy/venue rules | `npm run sync:csrankings-rules` | Low |
| **Quarterly, or when DBLP publishes a new dump** | CORE A/A* extra publications | A human downloads a fresh `dblp.xml.gz` via their own browser (dblp.org blocks scripted downloads), then `npm run core-extra:build-pubs -- <path-to-dump>` | Medium (manual download + a few minutes of local parsing) |
| **On demand** | NSF award data (scoped) | `npm run sync:nsf -- --school "<name>"` or `--faculty "<name>"` | Low-medium |
| **On demand, after name-matching changes** | NSF award data (no API) | `npm run sync:nsf:rebuild` | Local cache only |
| **On demand, when reports look wrong** | OpenAlex history / school aliases full rebuild | `node scripts/build-openalex-history.js`, `node scripts/build-school-aliases.js` | High (large API usage) |
| **When submissions arrive** | Grants corrections/submissions | Review `grants-submit.html` output against the official URL, then update `public/grants.json` | Low-medium |
| **Before a release, or when the roster changes materially** | Sitemap, OG image | `npm run sitemap`, `npm run og:image` | Low |
| **Periodically, or when adding large files** | Repo size guard | `node scripts/check-project-size.mjs` | Low |
| **Never routine — CSRankings CSVs themselves** | Faculty roster & publications | Nothing to run: `loadData()` fetches these live from `raw.githubusercontent.com/emeryberger/CSrankings` on every page load. Only touch this if the live fetch itself breaks | — |

## 1. CSRankings roster & publications (no local maintenance)

`src/data.ts:loadData()` fetches `csrankings.csv`, `generated-author-info.csv`,
`institutions.csv`, plus optional honors/alias CSVs, directly from CSRankings'
`gh-pages` branch at page-load time. There is no local copy to refresh. If
users report load failures:

- Check whether the upstream CSVs actually load (`curl -sI <url>`).
- Check whether a local validator added for one of the runtime-fetched JSON/CSV
  files (`src/data.ts`, `src/types.d.ts`) is stricter than what the generator
  or upstream source actually produces. This has happened before: a strict
  validator required every value in `public/school-aliases.json` to be a
  `string`, but the generator intentionally emits `null` for excluded/unmatched
  institutions (~13% of entries), so every load broke. Cross-check a validator
  against the script that produces the file, not just against current
  consumers, before trusting it.

## 2. CSRankings taxonomy / venue rules

```bash
npm run sync:csrankings-rules   # rebuilds src/csrankings-rules.generated.js from upstream CSRankings' Python rules
```

Run after CSRankings adds/renames a conference or changes CORE tier
membership. This is the fallback used until a client-side sync overrides it.

## 2.5. CORE A/A* extra publications (`public/core-extra-author-info.csv`)

CSRankings' own `generated-author-info.csv` only tracks its own venue set;
selecting the "CORE A*" or "CORE A*/A" conference-set filter also needs
publications in CORE A/A* venues CSRankings doesn't track (see
`EXPANSION_PLAN.md` for the full design). That data comes from a bulk DBLP
dump, not a live API — `dblp.org` runs an anti-bot wall (Anubis) that blocks
scripted downloads, so refreshing this is **manual, not automatable
end-to-end**:

1. A human downloads a fresh `dblp.xml.gz` (and its matching `.dtd`) from
   `https://dblp.org/xml/release/` via their own regular browser — Anubis's
   challenge resolves transparently for a real browser in a few seconds.
2. `npm run core-extra:build-pubs -- <path-to-dump.xml.gz>` re-parses it and
   overwrites `public/core-extra-author-info.csv` and
   `scripts/data/core-extra-pubs-report.json`.
3. Check the report's `rejected` section: a venue that drops out (implausible
   volume) or a previously-rejected one that now clears the bar changes the
   exact count `src/filters.ts`'s `CONF_SET_HELP` text cites — update that
   text's venue count/example if it drifts.
4. Re-run `npm test` (the CSV schema test in `test/unit/data.test.js` will
   catch a malformed regenerate) and commit the new CSV alongside the
   updated report.

`scripts/resolve-core-venue-keys.mjs` (Wikidata-based acronym→DBLP-key
resolution) can also be re-run independently if CORE's own venue list
changes (`npm run core-extra:resolve-keys`), but doesn't need to run every
quarter — the dump-based parse in `build-core-extra-pubs.js` re-validates and
guesses keys anyway.

## 3. NSF funding data

The browser does not query NSF directly. NSF rejects browser-origin requests,
and live per-user requests would make results dependent on API availability
and unstable name matching. Instead, `nsf.html` lazily loads a synchronized
static dataset (`public/nsf-awards.json`) only when someone opens it.

```bash
npm run sync:nsf:names            # monthly, or after any CSRankings roster update — 2 CSV downloads, seconds
npm run sync:nsf:all              # quarterly, or when data looks stale — thousands of NSF API queries, hours
npm run sync:nsf -- --school "X"  # scoped resync for one institution
npm run sync:nsf -- --faculty "X" # scoped resync for one person, useful while diagnosing a name variant
npm run sync:nsf:rebuild          # rebuild public/nsf-awards.json from the local cache, no API calls
```

**Run `sync:nsf:names` far more often than the others.** CSRankings spells
some faculty differently in `csrankings.csv` (what the award sync matched
against) than in `generated-author-info.csv` (what the site keys on); without
this refresh, anyone hired or renamed since the last award sync silently
shows no funding. It costs two CSV downloads and no NSF API access, so it's
safe to run any time. It rewrites `public/nsf-awards.json` and the reviewable
`public/nsf-name-crosswalk.csv` — commit both.

The crosswalk is meant to be read: each row records a name that needed
resolving. Correcting a wrong row by hand is a legitimate fix.

```bash
npm run sync:nsf:names   # then review the diff in public/nsf-name-crosswalk.csv
npm test && npm run build
```

**`sync:nsf:all`** (the full resync):

- queries the official NSF Award Search API for each unique faculty/institution pair;
- accepts awards only when the NSF recipient matches the current CSRankings institution;
- retains all listed PIs and co-PIs for fractional attribution;
- finds exact-title sibling awards for collaborative projects and deduplicates institution-transfer records;
- checkpoints progress in the ignored `.nsf-sync-cache.json` file so it can resume without repeating completed queries;
- writes the deployable dataset to `public/nsf-awards.json`, including explicit coverage totals.

NSF records awards under legal names (`Regents of the University of Michigan
- Flint`), informal ones (`Georgia Tech Research Corporation`), and expansions
of names CSRankings abbreviates (`Massachusetts Institute of Technology` vs
`Massachusetts Inst. of Technology`). The synchronizer normalizes those forms,
keeps an alias list for names it cannot derive, and assigns each awardee to
the *most specific* matching institution so a flagship never claims its
branch campus's awards.

Run the nationwide `sync:nsf:all` command again before a deploy when you want
fresh NSF data — deploying does not contact NSF automatically.

**Funding interpretation:** an award's estimated total amount is divided
equally among every listed PI and co-PI. University totals sum the shares
assigned to matched current CSRankings faculty. These are matched-faculty
statistics — not complete university NSF portfolios, annual expenditures,
fiscal-year obligation totals, or measures of research quality. Awards made
to a professor's former institution are intentionally excluded. Name
variants, missing co-PIs, transfers, supplements, and NSF data changes can
still cause omissions.

## 4. OpenAlex affiliation history & school aliases

`scripts/daily-openalex-sync.sh` runs unattended via cron: budget-capped,
self-checking before it commits (professor count can't shrink, `npm test`
must pass), auto-pushing on success, and leaving a local commit if the push
fails. Check `.openalex-cron.log` if Historical Mode data looks stale.

Manual full rebuilds are rare and expensive:

```bash
node scripts/build-openalex-history.js [--test --limit=10]   # full OpenAlex history rebuild
node scripts/build-school-aliases.js                          # rebuild the OpenAlex → CSRankings name mapping
node scripts/compact-openalex-history.mjs                     # re-compact the history file's on-disk format
```

Community corrections to bad OpenAlex data go in `public/manual_affiliations.csv`
(merged via `mergeAffiliationHistory()` in `src/data.ts`), not by hand-editing
the generated JSON.

## 5. CS Conference schedule (`csconfs/data/conferences.json`)

`csconfs/data/conferences.json` is maintained as part of this repository and
is the page's source of truth. Building and deploying CS Picks does not
require another checkout, a synchronization step, or a runtime data service.
There is intentionally no sync with any upstream schedule service — updates
come only from research agents citing an official page, reviewed and applied
centrally, following the process below.

Cadence in practice: a **weekly** shallow pass on series with deadlines in
the next ~2 months (these change most and matter most to visitors), plus a
**monthly** full audit across all current/upcoming editions.

### Scope

By default, update current and upcoming editions only. Older entries are
historical backfill and should be changed only when specifically needed.

Tracked venues cover every CORE A* and CORE A conference referenced by
`src/data/conference-sets.ts` (`coreAStarMap` / `coreAMap`), not just
CSRankings' own default/next-tier set. 89 CORE A/A* series were added as
skeleton records (`verified: false`, only `name`/`venueKeys`/`description`
populated, `year: 2026` placeholder) without researched dates — prioritize
these in upcoming passes over re-verifying already-populated entries.

Search records by `name` and `year`. Conferences with multiple submission
cycles have several objects with the same name and year. Research the shared
conference details once, then update every cycle for that edition.

### Source priority — official URL graph first

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

### Recognizing edition URL patterns

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

### Workflow A: discover a new edition

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

### Workflow B: audit an existing edition

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

### Staying on the official site

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

### Evidence format

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

### Agent boundaries

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
exact evidence-block format from MAINTENANCE.md's "CS Conference schedule"
section.

Start from these local official URLs:
- <CONF YEAR>: edition=<link>, series=<seriesLink>

Audit these fields:
- <CONF YEAR>: <missing, estimated, or suspect fields>

Do not infer unpublished facts from prior years. Return NOT FOUND when an
official source does not establish a field.
```

### Stop conditions

Report `NOT FOUND` and stop instead of guessing when:

- the next edition has not been announced;
- only a third-party listing contains the claimed fact;
- a derived URL does not identify the intended year;
- official pages disagree and the conflict cannot be resolved;
- a role is ambiguous;
- a date appears to be copied from a prior edition.

Unknown is valid data. A visible gap is safer than a confident-looking but
unsupported schedule.

### Local schema

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

### Editing rules

- Apply a shared place or chair to every cycle for the same conference year.
- Never replace a known value with an estimate.
- Never invent a general chair from a program-chair listing, or vice versa.
- Keep external links on `http` or `https`.
- Preserve `estimated` when only the location or chairs have been confirmed.
- Keep the JSON valid and do not remove old editions during routine updates.

### Verification

After editing, run:

```bash
npm test
npm run build
npx playwright test test/e2e/core-flows.spec.js --grep "CS Confs"
```

Also inspect the diff to ensure changes are limited to the intended
conference editions and all cycles received the same shared metadata.

### Data credits

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

## 6. Grants, fellowships & research awards (`public/grants.json`)

`grants.html` reads from `public/grants.json` and supports user
submissions/corrections via `grants-submit.html`. Discover, verify, and
update funding opportunities using this standardized workflow.

Practical cadence:

- **Monthly**, run a subset of the query categories below (rotate through
  federal agencies, industry programs, fellowships, and foundations over a
  few months rather than all at once) looking for: newly opened call cycles,
  changed deadlines/amounts on existing entries, and programs that have
  quietly closed or gone dormant.
- **On submission**, review `grants-submit.html` output: verify the cited
  official URL before writing anything to `public/grants.json`. A submission
  is a lead, not a source — confirm the program actually exists and the
  claimed terms match the official page, exactly like conference research
  requires an official edition URL rather than a third-party tracker.
- When a program is discontinued but worth keeping for archival/research
  value, set `"status": "historical"` and state the historical date range in
  `deadline` — never leave an old deadline looking current.
- Keep `id`s stable and unique; `deadlineMonth` drives chronological sorting
  (`0` for rolling/open calls).

### Targeted web search queries by category

- **Federal Agencies (Faculty & Lab Solicitations)**:
  - NSF: `"NSF CAREER solicitation computer science"`, `"NSF CRII solicitation CISE"`, `"NSF CISE Core programs medium small"`, `"NSF SaTC Secure and Trustworthy Cyberspace"`, `"NSF AI Institutes"`, `"NSF FRR Foundational Research in Robotics"`, `"NSF SHF Software Hardware Foundations"`, `"NSF CPS Cyber-Physical Systems"`, `"NSF POSE Open-Source Ecosystems"`
  - DARPA: `"DARPA Young Faculty Award YFA solicitation"`, `"DARPA I2O open BAA HR001126S0001"`, `"DARPA Disruptioneering Disruption Opportunities"`, `"DARPA MTO open BAA"`
  - DOE: `"DOE Early Career Research Program FOA computer science"`, `"DOE ASCR open FOA"`, `"DOE SciDAC partnerships institutes"`, `"DOE Quantum Information Science Centers"`, `"DOE ARPA-E open energy computing"`
  - DoD / Service Labs: `"ONR Young Investigator Program YIP"`, `"AFOSR Young Investigator Program BAA"`, `"ARO Early Career Program Scientists Engineers"`
  - NIH & NASA: `"NIH R01 computer science biomedical AI"`, `"NASA Early Career Faculty CS robotics"`

- **Student Fellowships & Early-Career Grants (Undergrad, Master's, PhD)**:
  - Federal / National: `"NSF Graduate Research Fellowship Program GRFP"`, `"DoD NDSEG Fellowship National Defense Science Engineering"`, `"DOE CSGF Computational Science Graduate Fellowship"`, `"DOE NNSA SSGF Stewardship Science"`, `"DOE NNSA LRGF Laboratory Residency"`, `"NSF CyberCorps Scholarship for Service SFS"`, `"DoD SMART Scholarship"`, `"NASA Space Technology Graduate Research Opportunities NSTGRO"`, `"NSF REU Sites Computer Science"`
  - Industry PhD Fellowships: `"Google PhD Fellowship computer science"`, `"Meta Research PhD Fellowship"`, `"Microsoft Research PhD Fellowship"`, `"Microsoft Research Ada Lovelace Fellowship"`, `"Apple Scholars in AI/ML PhD Fellowship"`, `"NVIDIA Graduate Fellowship Program"`, `"Amazon PhD Fellowship"`, `"Jane Street Graduate Research Fellowship"`, `"Two Sigma PhD Fellowship"`, `"IBM PhD Fellowship Program"`, `"Qualcomm Innovation Fellowship QInF"`, `"Adobe Research Fellowship"`, `"Bloomberg Data Science PhD Fellowship"`, `"Snap Research Fellowship"`, `"Gen Digital Symantec Graduate Fellowship"`
  - Foundations & Societies: `"Hertz Foundation Graduate Fellowship computing"`, `"National GEM Consortium Graduate Fellowship"`, `"Ford Foundation Predoctoral Fellowship"`, `"CRA Outstanding Undergraduate Researcher Award"`, `"CRA-WP Graduate Research Fellowship"`, `"ACM Doctoral Dissertation Award"`, `"NCWIT Collegiate Award"`

- **Tech Industry Faculty Awards & Academic RFPs**:
  - Google: `"Google Research Scholar Program faculty"`, `"Google Academic Research Awards"`
  - Microsoft: `"Microsoft Research Faculty Fellowship"`, `"Microsoft Accelerate Foundation Models"`
  - Meta: `"Meta Research RFP grants AI systems security"`
  - Amazon: `"Amazon Research Awards ARA call for proposals"`
  - NVIDIA: `"NVIDIA Academic Hardware Grant"`, `"NVIDIA Applied Research Accelerator"`
  - Frontier AI Labs: `"OpenAI Researcher Access Program academic"`, `"OpenAI academic frontier model grants"`, `"Anthropic researcher access program"`
  - Other Industry: `"<Company> Research Award OR Faculty Fellowship computer science"` (Adobe, Qualcomm, IBM, Sony Research Award, Samsung GRO, Bloomberg, Cisco, Snap, Broadcom)

- **Prestigious Foundations & Non-Profits**:
  - `"Alfred P. Sloan Research Fellowships Computer Science"`, `"David and Lucile Packard Fellowships Science Engineering"`, `"Simons Investigators Theoretical Computer Science"`, `"Schmidt Sciences AI2050 Fellowships"`, `"Burroughs Wellcome Fund Career Awards at the Scientific Interface CASI"`

### Standardized audience taxonomy

In `targetAudience`, always use these exact strings so dropdown filters work correctly:
- `"Faculty"`: Tenure-track, tenured, and research faculty.
- `"PhD Students"`: Doctoral candidates.
- `"Undergraduate Students"`: College undergraduates and rising seniors.
- `"Master's Students"`: MS / professional graduate students.
- `"Postdocs"`: Postdoctoral scholars and fellows.

### Schema specification for `public/grants.json`

Every entry MUST adhere to this structure:

```json
{
  "id": "unique-kebab-case-id",
  "name": "Full Formal Name of Award or Solicitation",
  "shortName": "Concise Short Name",
  "sponsor": "Sponsoring Agency or Company (e.g. NSF, Google Research, DARPA, DOE)",
  "sponsorCategory": "Government | Industry | Non-Profit / Foundation | Professional Society",
  "targetAudience": ["Faculty", "PhD Students", "Undergraduate Students", "Postdocs"],
  "whoFor": "Clear, human-readable audience description (e.g., 1st/2nd-year PhD students, Untenured Assistant Professors)",
  "deadline": "Clear description of deadline / cycle (e.g., Annual (Late October), Rolling / Open)",
  "deadlineMonth": 10,
  "amount": "Funding amount and perks (e.g., $37,000/yr stipend + tuition, $500,000+ over 5 years)",
  "summary": "1-2 sentence description of scope, purpose, and research goals.",
  "eligibility": [
    "Key eligibility rule 1 (e.g. US citizenship / international eligibility)",
    "Key eligibility rule 2 (e.g. university enrollment or tenure-track status)"
  ],
  "topics": ["AI/ML", "Systems", "Security", "Theory", "Robotics", "HPC", "Quantum"],
  "locations": ["State or jurisdiction names when eligibility is geographically limited"],
  "locationLabel": "Optional concise display label such as 28 EPSCoR jurisdictions",
  "status": "historical",
  "url": "https://official-program-or-rfp-url.org",
  "featured": true
}
```

`locations`, `locationLabel`, `estimated`, and `status` are optional. Add the geographic
fields when eligibility is limited by state, territory, commonwealth, or
another named jurisdiction. For an annual program, preserve a dated prior
cycle in `deadline` rather than overwriting it with a guess: the grants UI
automatically projects a passed dated annual deadline to the next cycle and
labels it **Estimated**, while `deadlineMonth` keeps it discoverable in
deadline filtering and sorting. Use `"estimated": true` only when an
explicitly labeled projection is needed but no dated prior cycle can support
the automatic projection. Set `status` to `historical` only when a
discontinued or inactive program is intentionally retained for archival
research; clearly state the historical date range in `deadline` and do not
present an old deadline as current.

*Note on `deadlineMonth`*: Set to `1..12` for the primary annual deadline
month, or `0` for rolling/year-round/open calls (used for chronological
sorting).

### Reviewing user submissions (`grants-submit.html`)

When a submission arrives:

1. The submission generates structured JSON with the official URL, name,
   sponsor, audience, and eligibility details.
2. Review the cited official program URL to verify legitimacy, deadline
   cycle, and funding terms.
3. Add or update the corresponding record in `public/grants.json`.
4. Run the validation commands below before committing.

### Verification

```bash
npm test                                            # Runs test/unit/*.test.js (asserts schema completeness, unique IDs, and filter integrity)
npm run build                                       # Verifies Vite multi-page bundle compilation
npx playwright test test/e2e/grants.spec.js test/e2e/grants-submit.spec.js  # Runs Playwright E2E verification
```

## 7. Sitemap & OG image

```bash
npm run sitemap    # regenerates public/sitemap.xml from the current roster
npm run og:image   # regenerates public/og-image.png via Playwright/Chromium
```

Regenerate before a release or whenever the roster/page set has changed
enough that either would visibly drift (new pages, materially different
school/professor counts). Not needed for routine data-only refreshes like
NSF or grants updates.

## 8. Repo size guard

```bash
node scripts/check-project-size.mjs
```

Fails if any tracked source file exceeds 600 lines or any of the three large
generated data files (`professor_history_openalex.json`, `nsf-awards.json`,
`school-aliases.json`) exceeds 40 MiB. Not wired into `npm test`
automatically — run it after adding a large generated asset or a large new
source file.

## Verification checklist (run after any data change, before committing)

```bash
npm test           # test/unit/*.test.js via node --test
npm run typecheck  # tsc --noEmit
npm run build      # verifies the Vite multi-page bundle still compiles
```

Then, only for the domain you touched, run its targeted Playwright spec (see
each domain's section above for the exact invocation — full-suite
`npm run test:e2e` is not required for every small data update but is a good
idea after a schema change).

Finally, inspect the diff before committing:

- For generated files (`nsf-awards.json`, `professor_history_openalex.json`,
  `school-aliases.json`, `csrankings-rules.generated.js`), confirm the diff
  shape matches what the script is supposed to produce — a near-total rewrite
  or a suspicious drop in entry count is a sign something upstream changed
  shape and silently broke matching, not a sign to force-commit anyway.
- For hand-edited/researched files (`conferences.json`, `grants.json`,
  `manual_affiliations.csv`, `nsf-name-crosswalk.csv`), confirm every changed
  fact traces back to a specific official source you actually opened.

## Automation notes for agents running this on a loop/cron

- Only the OpenAlex daily sync (`scripts/daily-openalex-sync.sh`) is currently
  safe to run fully unattended, because it's a mechanical API sync with a
  built-in revert-on-regression guard and no research judgment involved.
- CS Confs and Grants updates require reading and evaluating external web
  pages, which is exactly the kind of judgment call that shouldn't be
  auto-committed without review — use `/loop` or a scheduled agent to
  *surface* candidate updates (as evidence blocks, per the "Evidence format"
  section above, or an equivalent source-cited list for grants), then have a
  reviewing pass apply and commit them, rather than having the research agent
  commit directly.
- NSF's `sync:nsf:all` is expensive (hours, thousands of API calls) — don't
  schedule it more often than quarterly, and prefer the cheap `sync:nsf:names`
  refresh for routine upkeep.
