# Software conference audit — 2026-10-10

Research only; dataset and ledger untouched. Scope: all local ICSE, FSE, ASE, ISSTA, CAV and TACAS records for 2026 onward, including both ICSE 2026 cycles. Read MAINTENANCE §5. Dates remain official calendar days; response fields use start ISO plus full windows in notes. Machine proposals: `/tmp/confs-software-patches.json`. Announced partial future editions remain estimated/unverified. No tests run.

## Audit log and remaining gaps

- **ICSE 2026:** both abstract/full deadlines, conference dates/place and chairs confirmed by research/organizing pages. Cycle 1 notification corrected June 20 (local July 20); both responses added. Official linked [research portal](https://icse2026.hotcrp.com/) confirms 1469 total and 321 accepted across both cycles; local combined statistics retained. Cycle-specific totals are 660/161 (24.4%) and 809/160 (19.8%); do not silently interpret combined stats as cycle rates.
- **ICSE 2027:** single cycle, dates/place, abstract/full deadlines, initial notification and chairs confirmed; missing response added; revised decision in note. **2028:** [steering series](https://www.icse-conferences.org/) confirms April/Hawaii only. Derived edition page is inaccessible. Local April 30, Waikoloa, Rick Kazman and 2027 submission dates remain unsupported estimates, NOT FOUND as official exact facts. **2029:** newly announced Tokyo/April added as partial edition; derived edition URL inaccessible. No 2030 announcement found in steering series.
- **FSE 2026:** dates/place/chairs, abstract/full deadlines and initial notification confirmed; missing response and official portal stats added. Sponsorship deck's 920 submissions conflicts with portal's 799 and likely includes unreviewed/withdrawn submissions; use labeled portal denominator. Final major-revision decision not independently recovered. **2027:** full submission Oct 2, response Dec 14–18, initial Jan 22 and final Mar 31, existing dates/place/chairs confirmed; no abstract deadline found. **2028:** [official future list](https://www.esec-fse.org/upcoming_events) confirms Milan/2028; linked destination explicitly says website not up yet. Local Monday12–Friday16 July copied weekdays are unsupported: remove exact date and dead edition URL. Local deadline/review dates remain labeled estimates. No 2029 announcement found.
- **ASE 2026:** date/place, paper deadline and PC confirmed. Correct GC Stefan Winter, initial notification June18; May25 is early rejection. Missing response May25–27; revision/final decision in note. Abstract submission is mentioned but separate deadline NOT FOUND. Official [portal](https://ase26.hotcrp.com/) exposes no count; third-party 263/1304 not adopted. **2027:** series [ASE conferences](https://www.ase-conferences.org/) has no 2027 announcement and derived Researchr page inaccessible; all date/deadline/notification estimates remain unsupported. Next edition stop reached; no addition.
- **ISSTA 2026:** conference umbrella date/place, paper deadline, response, initial decision and chairs confirmed. No separate abstract deadline found. Final revised decision Jun25 added to note. [Portal](https://issta2026.hotcrp.com/) no count; acceptance stats NOT FOUND. **2027:** dates/place, abstract Jan8/fullJan11, responseMar22–25, initialApr20, chairs confirmed; finalJun17 noted. **2028:** [official series](https://www.issta.org/) announces Shanghai and names Shaoying Liu, Cristian Cadar and Maria Christakis as “Chairs” without role labels. Existing role allocation not independently confirmed; derived edition URL inaccessible; dates/deadlines/statistics NOT FOUND. No2029 announcement found; derived route inaccessible.
- **CAV 2026:** homepage confirms all dates/place; proceedings confirms existing PC and combined Conference Co-chairs plus new stats. No distinct general chair found; GC stays null because “Conference Co-chairs” does not explicitly distinguish general/program roles. **2027:** homepage/CFP/organization confirm dates/place/deadline/response/notification and combined general/program chairs. No separate abstract deadline found. **2028:** official series/adjacent routes yield no announcement, dates/place/chairs/deadlines NOT FOUND. 2029 derived route also inaccessible. Correct all three `seriesLink` values: cav.org is a real estate site; official series is i-cav.org (redirects to CloudFront).
- **TACAS 2026:** single cycle and existing dates/place/deadline/notification confirmed; missing response and PC added. Official proceedings search extraction reports190 submissions including13desk rejects; browser could not load full18.5MB PDF and shell network fetch failed. Acceptance rate NOT FOUND; do not use ETAPS aggregate30%. **2027:** single cycle, dates/place/deadline/notification/PC confirmed, response added; no abstract deadline. Umbrella general organizers not repurposed as TACAS GC. **2028:** newly discovered ETAPS April2–7 Karlsruhe; TACAS specific days/chairs/timeline NOT FOUND. NoETAPS2029 announcement found.

## Field evidence

```text
CONF: ICSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/icse-2026
FIELD: notificationDate
CURRENT: "2025-07-20"
VALUE: "2025-06-20"
SOURCE: https://conf.researchr.org/track/icse-2026/icse-2026-research-track
EVIDENCE: Cycle 1 timetable lists response May 27–29 and notification June 20; revised decisions October 17.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/icse-2026
FIELD: rebuttalDate
CURRENT: null
VALUE: "2025-05-27"
SOURCE: https://conf.researchr.org/track/icse-2026/icse-2026-research-track
EVIDENCE: Cycle 1 timetable lists response May 27–29 and notification June 20; revised decisions October 17.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/icse-2026
FIELD: note
CURRENT: "Cycle 1/2"
VALUE: "Cycle 1/2. Author response May 27–29, 2025. Initial notification June 20; final decision for revised papers October 17, 2025. Statistics cover both cycles combined (321/1469)."
SOURCE: https://conf.researchr.org/track/icse-2026/icse-2026-research-track
EVIDENCE: Cycle 1 timetable lists response May 27–29 and notification June 20; revised decisions October 17.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/icse-2026
FIELD: rebuttalDate
CURRENT: null
VALUE: "2025-09-23"
SOURCE: https://conf.researchr.org/track/icse-2026/icse-2026-research-track
EVIDENCE: Cycle 2 timetable marks abstract optional, response September 23–25, notification October 17 and revised decision December 19.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/icse-2026
FIELD: note
CURRENT: "Cycle 2/2"
VALUE: "Cycle 2/2. Abstract deadline July 11, 2025 is optional. Author response September 23–25, 2025. Initial notification October 17; final decision for revised papers December 19, 2025. Statistics cover both cycles combined (321/1469)."
SOURCE: https://conf.researchr.org/track/icse-2026/icse-2026-research-track
EVIDENCE: Cycle 2 timetable marks abstract optional, response September 23–25, notification October 17 and revised decision December 19.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/icse-2026
FIELD: seriesLink
CURRENT: "https://icse.org/"
VALUE: "https://www.icse-conferences.org/"
SOURCE: https://conf.researchr.org/series/icse
EVIDENCE: Researchr series identifies the Steering Committee maintained series site.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2027
EDITION_URL: https://conf.researchr.org/home/icse-2027
FIELD: rebuttalDate
CURRENT: null
VALUE: "2026-09-23"
SOURCE: https://conf.researchr.org/track/icse-2027/icse-2027-research-track
EVIDENCE: Research call announces single cycle and response September 23–25 with initial and revised-paper decisions.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2027
EDITION_URL: https://conf.researchr.org/home/icse-2027
FIELD: note
CURRENT: null
VALUE: "Single research submission cycle. Author response September 23–25, 2026; initial notification October 20; major revision due November 17; final revised-paper decision December 18, 2026."
SOURCE: https://conf.researchr.org/track/icse-2027/icse-2027-research-track
EVIDENCE: Research call announces single cycle and response September 23–25 with initial and revised-paper decisions.
CONFIDENCE: confirmed
```

```text
CONF: FSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/fse-2026
FIELD: rebuttalDate
CURRENT: null
VALUE: "2025-11-21"
SOURCE: https://conf.researchr.org/track/fse-2026/fse-2026-research-papers
EVIDENCE: CFP timetable gives author response November 21–25.
CONFIDENCE: confirmed
```

```text
CONF: FSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/fse-2026
FIELD: submissions
CURRENT: null
VALUE: 799
SOURCE: https://fse2026.hotcrp.com/
EVIDENCE: Official linked research portal displays 211 of 799 accepted.
CONFIDENCE: confirmed
```

```text
CONF: FSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/fse-2026
FIELD: acceptanceRate
CURRENT: null
VALUE: 26.41
SOURCE: https://fse2026.hotcrp.com/
EVIDENCE: Calculated 100 × 211 / 799 = 26.408%, rounded to two decimal places.
CONFIDENCE: confirmed
```

```text
CONF: FSE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/fse-2026
FIELD: note
CURRENT: null
VALUE: "Author response November 21–25, 2025. December 22 notification is initial. Official research HotCRP reports 211 accepted of 799 submissions; 26.41% is calculated from those counts."
SOURCE: https://conf.researchr.org/track/fse-2026/fse-2026-research-papers; https://fse2026.hotcrp.com/
EVIDENCE: CFP calls December 22 initial notification; portal provides acceptance counts.
CONFIDENCE: confirmed
```

```text
CONF: FSE
YEAR: 2027
EDITION_URL: https://conf.researchr.org/home/fse-2027
FIELD: note
CURRENT: null
VALUE: "Author response December 14–18, 2026. January 22, 2027 is initial notification; major revisions due March 5 and final notification March 31, 2027."
SOURCE: https://conf.researchr.org/track/fse-2027/fse-2027-papers
EVIDENCE: Timetable explicitly distinguishes initial January 22 and final March 31 notification.
CONFIDENCE: confirmed
```

```text
CONF: FSE
YEAR: 2028
EDITION_URL: https://www.esec-fse.org/upcoming_events
FIELD: link
CURRENT: "https://conf.researchr.org/home/fse-2028"
VALUE: null
SOURCE: https://www.esec-fse.org/upcoming_events
EVIDENCE: Series lists Milan, Italy, 2028; edition link resolves to a website-not-up-yet placeholder. No calendar dates are stated.
CONFIDENCE: confirmed
```

```text
CONF: FSE
YEAR: 2028
EDITION_URL: https://www.esec-fse.org/upcoming_events
FIELD: date
CURRENT: "Mon 12 - Fri 16 July 2028"
VALUE: null
SOURCE: https://www.esec-fse.org/upcoming_events
EVIDENCE: Series lists Milan, Italy, 2028; edition link resolves to a website-not-up-yet placeholder. No calendar dates are stated.
CONFIDENCE: confirmed
```

```text
CONF: FSE
YEAR: 2028
EDITION_URL: https://www.esec-fse.org/upcoming_events
FIELD: note
CURRENT: null
VALUE: "Milan, Italy confirmed by official series. Edition website is not up yet; exact event dates, submission and review dates are not announced. Stored deadline and review dates are estimates."
SOURCE: https://www.esec-fse.org/upcoming_events
EVIDENCE: Series lists Milan, Italy, 2028; edition link resolves to a website-not-up-yet placeholder. No calendar dates are stated.
CONFIDENCE: confirmed
```

```text
CONF: ASE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/ase-2026
FIELD: notificationDate
CURRENT: "2026-05-25"
VALUE: "2026-06-18"
SOURCE: https://conf.researchr.org/track/ase-2026/ase-2026-research-track
EVIDENCE: Timetable labels June 18 Initial Notification and May 25 Early Rejection Notification.
CONFIDENCE: confirmed
```

```text
CONF: ASE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/ase-2026
FIELD: rebuttalDate
CURRENT: null
VALUE: "2026-05-25"
SOURCE: https://conf.researchr.org/track/ase-2026/ase-2026-research-track
EVIDENCE: Timetable lists Author Response May 25–27.
CONFIDENCE: confirmed
```

```text
CONF: ASE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/ase-2026
FIELD: generalChair
CURRENT: "Dirk Beyer"
VALUE: "Stefan Winter"
SOURCE: https://conf.researchr.org/committee/ase-2026/ase-2026-organizing-committee
EVIDENCE: Organizing committee labels Stefan Winter General Chair.
CONFIDENCE: confirmed
```

```text
CONF: ASE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/ase-2026
FIELD: programChair
CURRENT: "J. Petke, S. Nejati"
VALUE: "Justyna Petke, Shiva Nejati"
SOURCE: https://conf.researchr.org/track/ase-2026/ase-2026-research-track
EVIDENCE: Research committee labels Justyna Petke and Shiva Nejati Program Co-Chair.
CONFIDENCE: confirmed
```

```text
CONF: ASE
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/ase-2026
FIELD: note
CURRENT: null
VALUE: "Author response May 25–27, 2026. May 25 is early rejection notification; June 18 is initial notification. Major revisions due July 16; revised-paper notification July 29, 2026."
SOURCE: https://conf.researchr.org/track/ase-2026/ase-2026-research-track
EVIDENCE: Timetable distinguishes response, early rejection, initial decision and major revision decision.
CONFIDENCE: confirmed
```

```text
CONF: CAV
YEAR: 2026
EDITION_URL: https://conferences.i-cav.org/2026/
FIELD: seriesLink
CURRENT: "https://cav.org/"
VALUE: "https://i-cav.org/"
SOURCE: https://i-cav.org/
EVIDENCE: Official CAV series identifies the conference and its steering committee; cav.org is an unrelated real estate site.
CONFIDENCE: confirmed
```

```text
CONF: CAV
YEAR: 2027
EDITION_URL: https://conferences.i-cav.org/2027/
FIELD: seriesLink
CURRENT: "https://cav.org/"
VALUE: "https://i-cav.org/"
SOURCE: https://i-cav.org/
EVIDENCE: Official CAV series identifies the conference and its steering committee; cav.org is an unrelated real estate site.
CONFIDENCE: confirmed
```

```text
CONF: CAV
YEAR: 2028
EDITION_URL: https://cav.org/
FIELD: seriesLink
CURRENT: "https://cav.org/"
VALUE: "https://i-cav.org/"
SOURCE: https://i-cav.org/
EVIDENCE: Official CAV series identifies the conference and its steering committee; cav.org is an unrelated real estate site.
CONFIDENCE: confirmed
```

```text
CONF: CAV
YEAR: 2026
EDITION_URL: https://conferences.i-cav.org/2026/
FIELD: submissions
CURRENT: null
VALUE: 319
SOURCE: https://link.springer.com/content/pdf/bfm:978-3-032-32519-8/1
EVIDENCE: Preface p. v gives 319 submissions and 81 accepted.
CONFIDENCE: confirmed
```

```text
CONF: CAV
YEAR: 2026
EDITION_URL: https://conferences.i-cav.org/2026/
FIELD: acceptanceRate
CURRENT: null
VALUE: 25.4
SOURCE: https://link.springer.com/content/pdf/bfm:978-3-032-32519-8/1
EVIDENCE: Preface p. v reports approximately 25.4% overall.
CONFIDENCE: confirmed
```

```text
CONF: CAV
YEAR: 2026
EDITION_URL: https://conferences.i-cav.org/2026/
FIELD: rebuttalDate
CURRENT: "2026-03-30–2026-04-02"
VALUE: "2026-03-30"
SOURCE: https://conferences.i-cav.org/2026/
EVIDENCE: Homepage response window starts March 30 and ends April 2.
CONFIDENCE: confirmed
```

```text
CONF: CAV
YEAR: 2026
EDITION_URL: https://conferences.i-cav.org/2026/
FIELD: note
CURRENT: null
VALUE: "Author response March 30–April 2, 2026. Proceedings report 81 accepted of 319 submissions (25.4% overall), comprising 54 regular, 21 short tool and 6 industrial experience/case study papers. Organization labels Darulova, Lin and Rümmer Conference Co-chairs; no distinct general chair is given."
SOURCE: https://link.springer.com/content/pdf/bfm:978-3-032-32519-8/1; https://conferences.i-cav.org/2026/
EVIDENCE: Preface provides category breakdown and organization roles; homepage gives response window.
CONFIDENCE: confirmed
```

```text
CONF: CAV
YEAR: 2027
EDITION_URL: https://conferences.i-cav.org/2027/
FIELD: rebuttalDate
CURRENT: "2027-04-05–2027-04-08"
VALUE: "2027-04-05"
SOURCE: https://conferences.i-cav.org/2027/; https://conferences.i-cav.org/2027/organization/
EVIDENCE: Homepage gives response April 5–8; organization page confirms combined general/program chairs.
CONFIDENCE: confirmed
```

```text
CONF: CAV
YEAR: 2027
EDITION_URL: https://conferences.i-cav.org/2027/
FIELD: note
CURRENT: null
VALUE: "Author response April 5–8, 2027. General and Program Chairs are Marieke Huisman and Joost-Pieter Katoen."
SOURCE: https://conferences.i-cav.org/2027/; https://conferences.i-cav.org/2027/organization/
EVIDENCE: Homepage gives response April 5–8; organization page confirms combined general/program chairs.
CONFIDENCE: confirmed
```

```text
CONF: ISSTA
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/issta-2026
FIELD: programChair
CURRENT: "Marcel Böhme, Cindy Rubio González"
VALUE: "Marcel Böhme, Cindy Rubio-González"
SOURCE: https://conf.researchr.org/track/issta-2026/issta-2026-research-papers
EVIDENCE: Research track uses Rubio-González; timetable distinguishes initial and final decisions and response March 24–26.
CONFIDENCE: confirmed
```

```text
CONF: ISSTA
YEAR: 2026
EDITION_URL: https://conf.researchr.org/home/issta-2026
FIELD: note
CURRENT: null
VALUE: "Co-located SPLASH/ISSTA event October 3–9, 2026. Author response March 24–26; April 16 is initial notification; major revision due May 21 and final notification June 25, 2026."
SOURCE: https://conf.researchr.org/track/issta-2026/issta-2026-research-papers
EVIDENCE: Research track uses Rubio-González; timetable distinguishes initial and final decisions and response March 24–26.
CONFIDENCE: confirmed
```

```text
CONF: ISSTA
YEAR: 2027
EDITION_URL: https://conf.researchr.org/home/issta-2027
FIELD: rebuttalDate
CURRENT: "2027-03-22–2027-03-25"
VALUE: "2027-03-22"
SOURCE: https://conf.researchr.org/track/issta-2027/issta-2027-research-papers
EVIDENCE: Research track timetable explicitly lists response window, initial decision and final revised-paper decision.
CONFIDENCE: confirmed
```

```text
CONF: ISSTA
YEAR: 2027
EDITION_URL: https://conf.researchr.org/home/issta-2027
FIELD: note
CURRENT: null
VALUE: "Author response March 22–25, 2027. April 20 initial notification (including early rejects); major revision May 20; final notification June 17, 2027."
SOURCE: https://conf.researchr.org/track/issta-2027/issta-2027-research-papers
EVIDENCE: Research track timetable explicitly lists response window, initial decision and final revised-paper decision.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2026
EDITION_URL: https://etaps.org/2026/conferences/tacas/
FIELD: rebuttalDate
CURRENT: null
VALUE: "2025-12-08"
SOURCE: https://etaps.org/2026/cfp/
EVIDENCE: Joint call lists rebuttal December 8–10 and PC chairs Sebastian Junges and Guy Katz.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2026
EDITION_URL: https://etaps.org/2026/conferences/tacas/
FIELD: programChair
CURRENT: null
VALUE: "Sebastian Junges, Guy Katz"
SOURCE: https://etaps.org/2026/cfp/
EVIDENCE: Joint call lists rebuttal December 8–10 and PC chairs Sebastian Junges and Guy Katz.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2026
EDITION_URL: https://etaps.org/2026/conferences/tacas/
FIELD: submissions
CURRENT: null
VALUE: 190
SOURCE: https://etaps.org/files/2026/tacas-ii-2026.pdf
EVIDENCE: Proceedings preface states 190 submissions, including 13 desk rejects; category totals of reviewed papers sum to 177.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2026
EDITION_URL: https://etaps.org/2026/conferences/tacas/
FIELD: note
CURRENT: null
VALUE: "Author rebuttal December 8–10, 2025. Mandatory artifacts October 30, 2025; voluntary artifacts January 8, 2026. Proceedings report 190 submissions including 13 desk rejects."
SOURCE: https://etaps.org/2026/cfp/
EVIDENCE: Joint call lists rebuttal December 8–10 and PC chairs Sebastian Junges and Guy Katz.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2027
EDITION_URL: https://etaps.org/2027/conferences/tacas/
FIELD: rebuttalDate
CURRENT: null
VALUE: "2026-12-07"
SOURCE: https://etaps.org/2027/cfp/
EVIDENCE: Joint call lists TACAS rebuttal December 7–9 and mandatory artifacts October 29.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2027
EDITION_URL: https://etaps.org/2027/conferences/tacas/
FIELD: note
CURRENT: "Mandatory artifact submission deadline 2026-10-29 (2 weeks after paper deadline). No abstract-only deadline or multi-round structure."
VALUE: "Mandatory artifact submission October 29, 2026. Author rebuttal December 7–9, 2026. Single submission cycle; no separate abstract deadline."
SOURCE: https://etaps.org/2027/cfp/
EVIDENCE: Joint call lists TACAS rebuttal December 7–9 and mandatory artifacts October 29.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2029
EDITION_URL: https://www.icse-conferences.org/
FIELD: link
CURRENT: MISSING
VALUE: null
SOURCE: https://www.icse-conferences.org/
EVIDENCE: Steering Committee homepage future-conferences list announces ICSE 2029, April 2029, Tokyo, Japan.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2029
EDITION_URL: https://www.icse-conferences.org/
FIELD: seriesLink
CURRENT: MISSING
VALUE: "https://www.icse-conferences.org/"
SOURCE: https://www.icse-conferences.org/
EVIDENCE: Steering Committee homepage future-conferences list announces ICSE 2029, April 2029, Tokyo, Japan.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2029
EDITION_URL: https://www.icse-conferences.org/
FIELD: date
CURRENT: MISSING
VALUE: "April 2029 (exact dates not yet announced)"
SOURCE: https://www.icse-conferences.org/
EVIDENCE: Steering Committee homepage future-conferences list announces ICSE 2029, April 2029, Tokyo, Japan.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2029
EDITION_URL: https://www.icse-conferences.org/
FIELD: place
CURRENT: MISSING
VALUE: "Tokyo, Japan"
SOURCE: https://www.icse-conferences.org/
EVIDENCE: Steering Committee homepage future-conferences list announces ICSE 2029, April 2029, Tokyo, Japan.
CONFIDENCE: confirmed
```

```text
CONF: ICSE
YEAR: 2029
EDITION_URL: https://www.icse-conferences.org/
FIELD: note
CURRENT: MISSING
VALUE: "Official ICSE Steering Committee announces Tokyo in April 2029. Edition site, exact dates, chairs and submission timeline not yet validated."
SOURCE: https://www.icse-conferences.org/
EVIDENCE: Steering Committee homepage future-conferences list announces ICSE 2029, April 2029, Tokyo, Japan.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2028
EDITION_URL: https://etaps.org/2028/
FIELD: link
CURRENT: MISSING
VALUE: "https://etaps.org/2028/"
SOURCE: https://etaps.org/2028/
EVIDENCE: ETAPS 2028 homepage gives April 2–7 in Karlsruhe and lists TACAS among constituent conferences.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2028
EDITION_URL: https://etaps.org/2028/
FIELD: seriesLink
CURRENT: MISSING
VALUE: "https://etaps.org/about/tacas/"
SOURCE: https://etaps.org/2028/
EVIDENCE: ETAPS 2028 homepage gives April 2–7 in Karlsruhe and lists TACAS among constituent conferences.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2028
EDITION_URL: https://etaps.org/2028/
FIELD: date
CURRENT: MISSING
VALUE: "April 2–7, 2028 (ETAPS umbrella; TACAS dates TBA)"
SOURCE: https://etaps.org/2028/
EVIDENCE: ETAPS 2028 homepage gives April 2–7 in Karlsruhe and lists TACAS among constituent conferences.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2028
EDITION_URL: https://etaps.org/2028/
FIELD: place
CURRENT: MISSING
VALUE: "Karlsruhe, Germany"
SOURCE: https://etaps.org/2028/
EVIDENCE: ETAPS 2028 homepage gives April 2–7 in Karlsruhe and lists TACAS among constituent conferences.
CONFIDENCE: confirmed
```

```text
CONF: TACAS
YEAR: 2028
EDITION_URL: https://etaps.org/2028/
FIELD: note
CURRENT: MISSING
VALUE: "ETAPS umbrella edition announced; TACAS-specific main conference dates, chairs and submission timetable TBA."
SOURCE: https://etaps.org/2028/
EVIDENCE: ETAPS 2028 homepage gives April 2–7 in Karlsruhe and lists TACAS among constituent conferences.
CONFIDENCE: confirmed
```

