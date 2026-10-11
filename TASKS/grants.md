# Grants, fellowships & research awards (`public/grants.json`)

> **`/goal TASKS/grants.md`**: Keep deadlines, amounts, and eligibility current from official call pages, archive discontinued programs, and add new ones. Work in bounded batches and open a PR on a
> topic branch for each; never push to `main`. Scheduled runs stop at the cap in
> [docs/AUTOMATION.md](../docs/AUTOMATION.md).

**Unknown beats wrong**: never fill a field from a prior year, a third-party tracker, or a guess.
Validate every batch with `npm test && npm run typecheck && npm run build && git diff --check`.

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

## Targeted web search queries by category

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

## Standardized audience taxonomy

In `targetAudience`, always use these exact strings so dropdown filters work correctly:
- `"Faculty"`: Tenure-track, tenured, and research faculty.
- `"PhD Students"`: Doctoral candidates.
- `"Undergraduate Students"`: College undergraduates and rising seniors.
- `"Master's Students"`: MS / professional graduate students.
- `"Postdocs"`: Postdoctoral scholars and fellows.

## Schema specification for `public/grants.json`

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
another named jurisdiction. Whenever possible, save and show concrete calendar
dates (e.g., `October 20, 2026 (Annual Mid-October; reference letters October 16)`)
for historical reference, auditability, and automatic cycle projection. For an
annual program, preserve a dated prior cycle in `deadline` rather than
overwriting it with a vague guess: the grants UI automatically projects a passed
dated annual deadline to the next cycle and labels it **Estimated**, while
`deadlineMonth` keeps it discoverable in deadline filtering and sorting. Use
`"estimated": true` only when an explicitly labeled projection is needed but no
dated prior cycle can support the automatic projection. Set `status` to
`historical` only when a discontinued or inactive program is intentionally
retained for archival research; clearly state the historical date range in
`deadline` and do not present an old deadline as current.

*Note on `deadlineMonth`*: Set to `1..12` for the primary annual deadline
month, or `0` for rolling/year-round/open calls (used for chronological
sorting).

## Reviewing user submissions (`grants-submit.html`)

When a submission arrives:

1. The submission generates structured JSON with the official URL, name,
   sponsor, audience, and eligibility details.
2. Review the cited official program URL to verify legitimacy, deadline
   cycle, and funding terms.
3. Add or update the corresponding record in `public/grants.json`.
4. Run the validation commands below before committing.

## Verification

```bash
npm test                                            # Runs test/unit/*.test.js (asserts schema completeness, unique IDs, and filter integrity)
npm run build                                       # Verifies Vite multi-page bundle compilation
npx playwright test test/e2e/grants.spec.js test/e2e/grants-submit.spec.js  # Runs Playwright E2E verification
```

## Discovering new programs

Rotate through the query categories above, starting with the one least represented in recent PRs. Dedup against
every `id`, `name`, and `url` in `grants.json` and open PRs. Each entry needs an official call page; skip programs
known only from third-party lists.
