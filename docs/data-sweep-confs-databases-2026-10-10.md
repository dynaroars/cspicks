# Database conference audit — 2026-10-10

Read-only official research. The official-source pass is complete for the existing 2026+ rows, with extraction and statistics gaps documented below. No dataset or ledger edits. Structured field patches are in `/tmp/confs-databases-patches.json`.

## Confirmed corrections

- PODS 2027 Cycle 2 abstract/paper are December 3/10, 2026. The dataset mistakenly copied first-cycle May dates.
- ICDE 2026 lasts May 4–8, 2026, not just May 4.
- Rebuttal scalar values use the start date. Complete windows must also be preserved in cycle notes.
- Official PODS 2026 CFP has apparent year typos for second-cycle response and initial notification (2025 after December 2025). Do not silently claim corrected years as source-confirmed; corroboration needed.

## Per-field proposals

```text
CONF: PODS
YEAR: 2027
EDITION_URL: https://2027.sigmod.org/
FIELD: abstractDeadline
CURRENT: 2026-05-23
VALUE: 2026-12-03
SOURCE: https://2027.sigmod.org/calls_papers_pods_research.shtml
EVIDENCE: Second cycle abstract date is December 3, 2026, distinct from May first cycle. (Cycle 2/2)
CONFIDENCE: confirmed
```

```text
CONF: PODS
YEAR: 2027
EDITION_URL: https://2027.sigmod.org/
FIELD: deadline
CURRENT: 2026-05-30
VALUE: 2026-12-10
SOURCE: https://2027.sigmod.org/calls_papers_pods_research.shtml
EVIDENCE: Second cycle full paper date is December 10, 2026. (Cycle 2/2)
CONFIDENCE: confirmed
```

```text
CONF: PODS
YEAR: 2026
EDITION_URL: https://2026.sigmod.org/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2025-07-29
SOURCE: https://2026.sigmod.org/calls_papers_pods_research.shtml
EVIDENCE: Rebuttal phase is 2025-07-29 through 2025-08-01; scalar stores start. (Cycle 1/2)
CONFIDENCE: confirmed
```

```text
CONF: PODS
YEAR: 2027
EDITION_URL: https://2027.sigmod.org/
FIELD: rebuttalDate
CURRENT: 2026-07-29–2026-08-01
VALUE: 2026-07-29
SOURCE: https://2027.sigmod.org/calls_papers_pods_research.shtml
EVIDENCE: Rebuttal phase is 2026-07-29 through 2026-08-01; scalar stores start. (Cycle 1/2)
CONFIDENCE: confirmed
```

```text
CONF: PODS
YEAR: 2027
EDITION_URL: https://2027.sigmod.org/
FIELD: rebuttalDate
CURRENT: 2027-01-26–2027-01-29
VALUE: 2027-01-26
SOURCE: https://2027.sigmod.org/calls_papers_pods_research.shtml
EVIDENCE: Rebuttal phase is 2027-01-26 through 2027-01-29; scalar stores start. (Cycle 2/2)
CONFIDENCE: confirmed
```

```text
CONF: SIGMOD
YEAR: 2026
EDITION_URL: https://2026.sigmod.org/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2025-03-01
SOURCE: https://2026.sigmod.org/calls_papers_sigmod_research.shtml
EVIDENCE: Author feedback phase 2025-03-01 through 2025-03-08; scalar stores start. (Cycle 1/4)
CONFIDENCE: confirmed
```

```text
CONF: SIGMOD
YEAR: 2026
EDITION_URL: https://2026.sigmod.org/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2025-06-01
SOURCE: https://2026.sigmod.org/calls_papers_sigmod_research.shtml
EVIDENCE: Author feedback phase 2025-06-01 through 2025-06-08; scalar stores start. (Cycle 2/4)
CONFIDENCE: confirmed
```

```text
CONF: SIGMOD
YEAR: 2026
EDITION_URL: https://2026.sigmod.org/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2025-09-01
SOURCE: https://2026.sigmod.org/calls_papers_sigmod_research.shtml
EVIDENCE: Author feedback phase 2025-09-01 through 2025-09-08; scalar stores start. (Cycle 3/4)
CONFIDENCE: confirmed
```

```text
CONF: SIGMOD
YEAR: 2026
EDITION_URL: https://2026.sigmod.org/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2025-12-01
SOURCE: https://2026.sigmod.org/calls_papers_sigmod_research.shtml
EVIDENCE: Author feedback phase 2025-12-01 through 2025-12-08; scalar stores start. (Cycle 4/4)
CONFIDENCE: confirmed
```

```text
CONF: SIGMOD
YEAR: 2027
EDITION_URL: https://2027.sigmod.org/
FIELD: rebuttalDate
CURRENT: 2026-03-10–2026-03-17
VALUE: 2026-03-10
SOURCE: https://2027.sigmod.org/calls_papers_sigmod_research.shtml
EVIDENCE: Author feedback phase 2026-03-10 through 2026-03-17; scalar stores start. (Cycle 1/4)
CONFIDENCE: confirmed
```

```text
CONF: SIGMOD
YEAR: 2027
EDITION_URL: https://2027.sigmod.org/
FIELD: rebuttalDate
CURRENT: 2026-06-10–2026-06-17
VALUE: 2026-06-10
SOURCE: https://2027.sigmod.org/calls_papers_sigmod_research.shtml
EVIDENCE: Author feedback phase 2026-06-10 through 2026-06-17; scalar stores start. (Cycle 2/4)
CONFIDENCE: confirmed
```

```text
CONF: SIGMOD
YEAR: 2027
EDITION_URL: https://2027.sigmod.org/
FIELD: rebuttalDate
CURRENT: 2026-09-10–2026-09-17
VALUE: 2026-09-10
SOURCE: https://2027.sigmod.org/calls_papers_sigmod_research.shtml
EVIDENCE: Author feedback phase 2026-09-10 through 2026-09-17; scalar stores start. (Cycle 3/4)
CONFIDENCE: confirmed
```

```text
CONF: SIGMOD
YEAR: 2027
EDITION_URL: https://2027.sigmod.org/
FIELD: rebuttalDate
CURRENT: 2026-12-10–2026-12-17
VALUE: 2026-12-10
SOURCE: https://2027.sigmod.org/calls_papers_sigmod_research.shtml
EVIDENCE: Author feedback phase 2026-12-10 through 2026-12-17; scalar stores start. (Cycle 4/4)
CONFIDENCE: confirmed
```

```text
CONF: ICDE
YEAR: 2027
EDITION_URL: https://icde2027.github.io/
FIELD: rebuttalDate
CURRENT: 2026-08-08–2026-08-15
VALUE: 2026-08-08
SOURCE: https://icde2027.github.io/cf-research-papers.html
EVIDENCE: Author rebuttal period 2026-08-08 through 2026-08-15; scalar stores start. (Cycle 1/2)
CONFIDENCE: confirmed
```

```text
CONF: ICDE
YEAR: 2027
EDITION_URL: https://icde2027.github.io/
FIELD: rebuttalDate
CURRENT: 2027-01-08–2027-01-15
VALUE: 2027-01-08
SOURCE: https://icde2027.github.io/cf-research-papers.html
EVIDENCE: Author rebuttal period 2027-01-08 through 2027-01-15; scalar stores start. (Cycle 2/2)
CONFIDENCE: confirmed
```

```text
CONF: ICDE
YEAR: 2026
EDITION_URL: https://icde2026.github.io
FIELD: date
CURRENT: 2026-05-04
VALUE: May 4–8, 2026
SOURCE: https://icde2026.github.io/
EVIDENCE: Edition home explicitly announces full May 4–8 range, rather than local single start day. (Cycle 1/2)
CONFIDENCE: confirmed
```

```text
CONF: ICDE
YEAR: 2026
EDITION_URL: https://icde2026.github.io
FIELD: date
CURRENT: 2026-05-04
VALUE: May 4–8, 2026
SOURCE: https://icde2026.github.io/
EVIDENCE: Edition home explicitly announces full May 4–8 range, rather than local single start day. (Cycle 2/2)
CONFIDENCE: confirmed
```


## Coverage and retained fields

All 2026+ rows for these six names were inspected: SIGMOD 2026/2027 four cycles each plus 2028 placeholder; PODS 2026/2027 two each; ICDE 2026/2027 two each; VLDB 2026/2027 twelve monthly cycles each; ICDT 2027 one combined row. EDBT is absent from the dataset and conference taxonomy. No data or ledger mutations were made.

| Edition | Fields verified and official source |
| --- | --- |
| SIGMOD 2026 | Home confirms May 31–June 5 Bengaluru. Research CFP confirms four quarterly abstract/paper dates (10th/17th), feedback windows and initial/final decisions. [Home](https://2026.sigmod.org/), [CFP](https://2026.sigmod.org/calls_papers_sigmod_research.shtml). General Jayant Haritsa/S. Sudarshan, program Carsten Binnig/Sudeepa Roy: [General](https://2026.sigmod.org/org_conference.shtml), [PC](https://2026.sigmod.org/org_sigmod.shtml). |
| SIGMOD 2027 | June 13–19 Huntington Beach; quarterly 2026 abstracts 10th/papers 17th retained. Initial notifications April/July/October 19, 2026 and January 19, 2027; final June/September/December 12, 2026 and March 12, 2027. Local notifications use final stage. [Home](https://2027.sigmod.org/), [CFP](https://2027.sigmod.org/calls_papers_sigmod_research.shtml). General Chen Li/Cyrus Shahabi; program Sourav Bhowmick/Yuanyuan Tian [Officers](https://2027.sigmod.org/org_conference_officers.shtml). |
| PODS 2026 | Joint date/place confirmed by SIGMOD home. General Floris Geerts [Officers](https://2026.sigmod.org/org_conference.shtml), program Ke Yi [PC](https://2026.sigmod.org/org_pods.shtml). Abstract/paper June 3/10 and December 3/10, 2025. First initial August 11/final September 1, 2025. Second final March 1, 2026. [CFP](https://2026.sigmod.org/calls_papers_pods_research.shtml) has 2025 year typos for second initial decision and response; no factual corrected response patch. |
| PODS 2027 | First abstract/paper May 23/30, 2026; second December 3/10, 2026. Initial decisions August 11, 2026 / February 8, 2027, final September 1, 2026 / March 1, 2027. [CFP](https://2027.sigmod.org/calls_papers_pods_research.shtml). General Yufei Tao/program Dan Olteanu [Officers](https://2027.sigmod.org/org_conference_officers.shtml). |
| ICDE 2026 | May 4–8 Montreal, paper June 18/October 27, 2025; initial August 18/December 22, final October 20, 2025/February 23, 2026. No abstract or rebuttal dates announced in [research CFP](https://icde2026.github.io/cf-research-papers.html). General Fei Chiang/Essam Mansour; program Khuzaima Daudjee/Qiong Luo/Alkis Simitsis [Officers](https://icde2026.github.io/officers.html). [Home](https://icde2026.github.io/). |
| ICDE 2027 | May 17–21 Copenhagen; paper June 11/November 11, 2026; notifications September 10, 2026/February 10, 2027. [CFP](https://icde2027.github.io/cf-research-papers.html). General Yongluan Zhou; program Christian S. Jensen/Guoliang Li/Li Xiong [Officers](https://icde2027.github.io/officers.html). [Home](https://icde2027.github.io/). |
| VLDB 2026 | August 31–September 4 Boston. Monthly paper deadlines April 1, 2025–March 1, 2026, approximate notification following month 15th; no abstract deadline announced. [Dates](https://vldb.org/2026/important-dates.html). General Angela Bonifati/Mirek Riedewald and program Yanlei Diao/Xiaokui Xiao confirmed by official search extraction of [Officers](https://www.vldb.org/2026/officers.html), direct open failed. |
| VLDB 2027 | August 23–27 Athens; twelve paper deadlines April 1, 2026–March 1, 2027, abstracts prior month 25th, approximate notification following month 15th. [Guidelines](https://www.vldb.org/2027/submission-guidelines.html), [Dates](https://www.vldb.org/2027/important-dates.html). General Georgia Koutrika/Alkis Simitsis; program Katja Hose/Matthias Boehm [Officers](https://www.vldb.org/2027/officers.html). |
| ICDT 2027 | Existing cycle 1 dates/place/program chair match [series CFP](https://databasetheory.org/node/154). Missing cycle 2 in structured data. Edition CFP additionally announces November 3–7 rebuttal [edition CFP](https://edbticdt2027.github.io/?contents=ICDT_CFP.html); official indexed text extracted although direct open shows shell. Joint home/series says April 6–9; edition CFP says ICDT April 6–8, so preserve joint scope in date. |

No unsourced replacements proposed for description, venueKeys, unknown optional dates, or estimated future dates. Edition links above opened successfully except specifically marked official indexed extraction. Existing SIGMOD 2028 has no edition link; sponsor PC-chair evidence does not establish dates, place, or a working edition URL.

## Additional proposals and missing rows

Structured artifact also includes a note update for each response window, using the complete start–end range and preserving cycle label. The response scalar always stores the ISO start date.

```text
CONF: SIGMOD
YEAR: 2028
EDITION_URL: MISSING (no confirmed edition URL)
FIELD: programChair
CURRENT: MISSING
VALUE: Yannis Velegrakis; Rachel Pottinger
SOURCE: https://sigmod.org/about-sigmod/
EVIDENCE: Sponsor PC Chair Board explicitly assigns both to 2028.
CONFIDENCE: confirmed (chairs only)
```

```text
CONF: ICDT
YEAR: 2027
EDITION_URL: https://edbticdt2027.github.io/
FIELD: generalChair
CURRENT: MISSING
VALUE: Pierre Bourhis (CNRS, Inria); Nofar Carmeli (Inria, University of Montpellier)
SOURCE: https://edbticdt2027.github.io/?contents=conference_officers.html
EVIDENCE: Official joint-conference committee, General Chairs heading.
CONFIDENCE: confirmed
```

```text
CONF: ICDT
YEAR: 2027
EDITION_URL: https://edbticdt2027.github.io/
FIELD: second cycle record; first-row note
CURRENT: one combined-cycle row
VALUE: Cycle 1/2 note on existing; new Cycle 2/2 abstract 2026-09-03, paper 2026-09-10, response start 2026-11-03, notification 2026-12-01
SOURCE: https://databasetheory.org/node/154 ; https://edbticdt2027.github.io/?contents=ICDT_CFP.html
EVIDENCE: Two explicit research cycles; November 3–7 response appears on current edition CFP. Full range goes in note.
CONFIDENCE: confirmed
```

```text
CONF: ICDT
YEAR: 2026
EDITION_URL: https://edbticdt2026.github.io/
FIELD: missing edition (two cycle rows)
CURRENT: MISSING
VALUE: March 24–27, Tampere; abstract/paper/notification cycle1 2025-03-13/2025-03-20/2025-06-01; cycle2 2025-09-03/2025-09-10/2025-12-01
SOURCE: https://databasetheory.org/node/152 ; https://edbticdt2026.github.io/
EVIDENCE: Official series CFP lists two cycles and PC Balder ten Cate. Joint home supplies date/place. Unknown rebuttal stays null.
CONFIDENCE: confirmed
```

```text
CONF: ICDT
YEAR: 2026
EDITION_URL: https://edbticdt2026.github.io/
FIELD: generalChair; submissions; acceptanceRate
CURRENT: edition MISSING
VALUE: Kostas Stefanidis; Zheying Zhang; 73; 27.4
SOURCE: https://drops.dagstuhl.de/storage/00lipics/lipics-vol365-icdt2026/LIPIcs.ICDT.2026.0/LIPIcs.ICDT.2026.0.pdf
EVIDENCE: PDF page 10 committee; page 6 preface reports 20 accepted regular papers from 73 full submissions. Rate derived as 20/73, rounded one decimal. Separate Database Theory in Action accepted 5/6; excluded from regular denominator.
CONFIDENCE: confirmed counts; derived rate
```

## EDBT research lead (outside current taxonomy)

[Official association](https://www.edbt.org/) confirms 2026 Tampere March 24–27, program Wolfgang Lehner/Vanessa Braganholo, and 2027 Lille April 6–9. [2026 edition CFP](https://edbticdt2026.github.io/?contents=EDBT_CFP.html) indexed official extraction confirms three papers February 5, June 4, October 8, 2025; initial March 27, July 31, November 27, 2025; final May 25/October 1, 2025/February 3, 2026. It contains a third revision year typo; do not propagate. EDBT 2027 association confirms papers February 4, June 10, October 7, 2026. [2027 officers](https://edbticdt2027.github.io/?contents=conference_officers.html) confirms Felix Naumann/Senjuti Basu Roy program chairs and joint general chairs above. Full 2027 response/decision schedule not verified from official table; third-party mirror not used. No automatic EDBT dataset or taxonomy addition.

## Discovery and completeness gaps

- [VLDB series conference archive](https://www.vldb.org/conference.html) lists editions through 2027 only. Adjacent 2028 URL attempts yielded retrieval errors, not proven HTTP 404. No later announced schedule found.
- SIGMOD sponsor announces 2028 PC chairs; adjacent edition URL did not retrieve. PODS has no separately confirmed 2028 CFP. Preserve unknown date/place/deadline.
- ICDE adjacent 2028 URL did not retrieve; no 2028 sponsor announcement found in this pass.
- [ICDT series archive](https://databasetheory.org/ICDT/what-is-icdt) and EDBT association list through 2027; restricted searches did not locate 2028 announcements.
- No official current 2026 acceptance totals found for SIGMOD, PODS, ICDE, VLDB or EDBT after research CFP/program/official proceedings and restricted official-domain searches. [VLDB legacy statistics](https://www.vldb.org/archives/statistics.html) concerns historical editions; guessed volume19 front-matter URL did not retrieve. [EDBT proceedings](https://openproceedings.org/html/pages/2026_edbt.html) has research papers but no extracted aggregate statement; guessed front matter did not retrieve. Do not derive acceptance rates from program counts alone.
- Source-year errors and notification-stage differences above remain documented gaps. Dataset retains unknown statistics and uncorroborated response dates; future placeholder status remains legitimate where explicit estimates are used.

Audit artifacts contain review proposals only. No tests run; no implementation or dataset was changed.
