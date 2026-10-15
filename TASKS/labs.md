# Industry & national labs directory (`public/labs.json`)

The Jobs page's "Industry & national labs" section is a curated directory of research labs and companies that
regularly hire CS PhDs as researchers, postdocs, and PhD interns. It links to each lab's **own careers,
internship, and postdoc pages**. Individual lab postings live in `public/jobs.json` (next section), and each lab
row in the directory links to its listed postings.

**Unknown beats wrong**: only add a link you opened and confirmed is the lab's official page today.

## Scope

- `industry`: corporate and nonprofit AI/CS research labs (Microsoft Research, Google Research, Google DeepMind,
  Meta FAIR, Ai2, …).
- `company`: R&D companies and research institutes that hire many CS PhDs (Galois, GrammaTech, Trail of Bits,
  SRI, Draper, …).
- `national`: DOE national labs, other federal labs (NIST, ARL), FFRDCs and UARCs (MITRE, MIT Lincoln Lab,
  JHU APL, CMU SEI).

Leave out general software employers whose PhD hiring isn't research (a product-engineering careers page is
not a lab), and staffing or job-board pages.

## Schema (`public/labs.json`, an array)

| Field | Notes |
| --- | --- |
| `id` | Stable kebab-case slug; never reused. |
| `name`, `org` | Lab name and parent (company, agency, or "Nonprofit …"). |
| `aka` | Optional former/informal names people search for (e.g. `Google Brain`, `NREL`). |
| `kind` | `industry`, `company`, or `national`. |
| `areas` | CSRankings area keys (`src/shared.ts` `areaLabels`) the lab is known for. |
| `broad` | `true` when it hires across most of CS; then every `area:` search matches it. |
| `locations` | Main US sites as `City, ST`; non-US sites as `City, Country`. |
| `summary` | One or two paraphrased sentences: what it researches and whom it hires. |
| `careersUrl` | Required. The lab's own research-careers page (or the company's careers page if the lab has none). |
| `internshipsUrl`, `postdocsUrl` | Optional official student/intern and postdoc/fellowship pages. |
| `checkedAt` | ISO date the links were last opened and confirmed. |

`npm run validate:jobs` checks this file too; `test/unit/labs.test.js` runs the same check.

## Lab postings in `public/jobs.json`

Individual openings at these labs go in the jobs roster with the [jobs.md](jobs.md) schema plus:

- `lab`: the `labs.json` id, and `school`: exactly that lab's `name` (`validate:jobs` enforces both; no
  `jobs-sources.json` row is needed). Add the lab to `labs.json` first if it is new.
- `track`: `industry` (research scientist/researcher/staff scientist roles), `internship` (PhD research
  internships), or `postdoc`. `level` is null. `department` is the team or division named on the posting.
- Only roles aimed at PhDs: the posting requires or prefers a PhD, or is a PhD internship or postdoc. Skip
  generic software engineering, product, and undergraduate internships.
- Official postings only (the employer's careers site, its own applicant-tracking board, or USAJOBS for
  federal labs), rendered live with `npm run render:jobs`. `visaSponsorship: "no"` when the posting requires
  US citizenship or a clearance.
- Most have no deadline: they stay active for 90 days after `lastSeenAt`, so recheck them monthly in season
  (set `lastSeenAt` to today, or `closedAt` when the posting is gone). Cap each lab at a few representative
  postings (about four) so big employers don't flood the list; the directory's careers links cover the rest.

## Refresh (twice a year: August, before the PhD-internship and faculty season, and February)

1. Open every link in a real browser (`npm run render:jobs -- --out /tmp/labs <urls>`). A redirect to a
   working page: update the URL. A 404 or a page that no longer hires: find the replacement from the lab's site
   or drop the optional link; never keep a dead link.
2. Watch for renames and mergers (Google Brain → Google DeepMind in 2023; NREL → National Laboratory of the
   Rockies in December 2025) and keep the old name in `aka`.
3. Set `checkedAt` on every lab you confirmed.

Sites that block scripted browsers (a 403 or challenge page) as of 2026-10-15: OpenAI, Argonne, Idaho National
Laboratory, PNNL, Salesforce. Their URLs were confirmed by plain `curl` or by search results; check them by
hand. Considered but not added because no official careers page could be confirmed: Nokia Bell Labs, RTX BBN
Technologies, AFRL, and NRL. Add them once a page is confirmed.
