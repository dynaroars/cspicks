# Industry & national labs directory (`public/labs.json`)

The Jobs page's "Industry & national labs" section is a curated directory of research labs and companies that
regularly hire CS PhDs as researchers, postdocs, and PhD interns. It links to each lab's **own careers,
internship, and postdoc pages**; it does not track individual postings. Lab openings ("Research Scientist,
ML") are evergreen and reposted, so they never fit the deadline/`lastSeenAt` model in [jobs.md](jobs.md). A lab
posting with a real deadline (a named postdoctoral fellowship, a dated internship call) can still go in
`public/jobs.json` later, but only after that file grows an employer field; until then, link the program page here.

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
