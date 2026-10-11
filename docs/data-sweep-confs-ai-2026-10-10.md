# AI conference audit — 2026-10-10

Research only. Dataset not edited. Existing records inspected for 2026 and later. Schedule, event, venue, and chair facts checked independently against official pages. Older 2026 records were checked only for concrete mistakes/gaps found during current-year navigation.

## Audit log

- AAAI 2027: edition URL initially returns 403 to direct browsing; official domain search returns full author timetable and organizers. Dates, Montreal venue, abstract July 21, paper July 28, final notification November 30, Edith Elkind and Yan Liu/Balaraman Ravindran match. Newly found feedback October 19–25. Series lists only 2027; derived AAAI-28 route inaccessible. AAAI 2028 event, place, timeline and chairs NOT FOUND.
- IJCAI 2027: stored edition home and conference-committee page validate both event date ranges, Kyoto/Hengqin, January 4/11 deadlines, April 21 notification and Sarit Kraus/Bo An. Rebuttal NOT FOUND. IJCAI 2028 official society future page confirms existing Craig Boutilier/Michael Thielscher; its edition route inaccessible; host/date/deadlines NOT FOUND. Society also announces 2029 and 2030 chair appointments; chair-only records can be added without invented event or schedule fields.
- ICML 2026: existing homepage/CFP/Dates/Committees inspected. Event, Seoul, abstract and notification and chairs match. Existing full deadline wrongly uses UTC calendar date Jan 29; official AoE deadline is Jan 28. Newly found author response deadline March 30.
- ICML 2027/2028: series Future Meetings confirms South America and Eastern United States respectively. Derived 2027 edition route inaccessible, no year navigation beyond 2026. Event dates, city, chairs, submission timelines NOT FOUND. Retain estimated=true, verified=false for forecast January 16/22, 2027. Future region page is https://icml.cc/Conferences/FutureMeetings.
- ICLR 2027: existing homepage/CFP confirm April 26–30, 2027, September 18/25, November 5–18 discussion and December 16 decisions. San Francisco supported by homepage image alt and workshop CFP (that CFP contains a copied 2026 workshop year; do not use its dates). Committee route inaccessible and general chair NOT FOUND; program chairs confirmed on official blog. Derived 2028 edition route inaccessible; no 2028 announcement found.
- ICLR 2026: concrete stale notification and TBD chairs resolved from Dates and Committees. Its explanatory note is now obsolete. Existing discussion start November 11 stays supported; Dates table now says discussion ends December 3.
- NeurIPS 2026: existing home, CFP and Dates confirm all submission/review milestones and three venues. Clarify per-site event dates. General chairs match. Four regular program chairs match; senior chair is a separate role.
- NeurIPS 2027/2028: official Future Meetings still says Europe / Western United States. Derived 2027 edition route inaccessible. City/date/chairs/timeline NOT FOUND. Retain estimated=true, verified=false for forecast May 14/21, 2027. Future source https://neurips.cc/Conferences/FutureMeetings.
- AISTATS 2027: stored edition initially transient fetch failure, later validates through series year navigation. Home, CFP, Dates confirm all existing fields, with November 16 rebuttal beginning newly found. Derived 2028 edition route inaccessible, no announcement or 2028 navigation found.
- AISTATS 2026: missing entirely despite current-year official archive linked from 2027. Official page and CFP fully populate most ordinary fields. Rebuttal date NOT FOUND in inspected CFP/home; can remain null. New record can be verified=true, estimated=false given official event and submission timeline.

## Proposed field changes and additions

```text
CONF: AAAI
YEAR: 2027
EDITION_URL: https://aaai.org/conference/aaai/aaai-27/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2026-10-19
SOURCE: https://aaai.org/conference/aaai/aaai-27/
EVIDENCE: Main technical track timetable gives the author feedback window as October 19–25, 2026.
CONFIDENCE: confirmed
```

```text
CONF: ICLR
YEAR: 2027
EDITION_URL: https://iclr.cc/Conferences/2027
FIELD: programChair
CURRENT: MISSING
VALUE: Jacob Andreas, Guy Van den Broeck, Andrej Risteski, Stella Yu
SOURCE: https://blog.iclr.cc/2026/09/10/making-googles-paper-assistant-tool-pat-available-to-iclr-submitters/
EVIDENCE: Official September 10 article identifies its ICLR 2027 authors as these four ICLR Program Chairs.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2027
EDITION_URL: https://virtual.aistats.org/Conferences/2027
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2026-11-16
SOURCE: https://virtual.aistats.org/Conferences/2027/CallForPapers
EVIDENCE: CFP explicitly identifies November 16, 2026 as the beginning of the author rebuttal period. The separate author–reviewer discussion runs November 23–December 3; do not equate that with a stated rebuttal end date.
CONFIDENCE: confirmed
```

```text
CONF: NeurIPS
YEAR: 2026
EDITION_URL: https://neurips.cc/Conferences/2026
FIELD: date
CURRENT: December 6–13, 2026
VALUE: December 6–12, 2026 (Sydney); December 9–13, 2026 (Atlanta and Paris)
SOURCE: https://neurips.cc/Conferences/2026/Dates
EVIDENCE: Official dates distinguish Sydney December 6–12 from Atlanta and Paris December 9–13.
CONFIDENCE: confirmed
```

```text
CONF: ICML
YEAR: 2026
EDITION_URL: https://icml.cc/Conferences/2026
FIELD: deadline
CURRENT: 2026-01-29
VALUE: 2026-01-28
SOURCE: https://icml.cc/Conferences/2026/CallForPapers
EVIDENCE: CFP states January 28 AoE, and separately gives January 29 noon UTC. Calendar-date policy requires January 28. The Dates page independently agrees.
CONFIDENCE: confirmed
```

```text
CONF: ICML
YEAR: 2026
EDITION_URL: https://icml.cc/Conferences/2026
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2026-03-30
SOURCE: https://icml.cc/Conferences/2026/Dates
EVIDENCE: Dates table labels March 30, 2026 AoE as Author Response Deadline.
CONFIDENCE: confirmed
```

```text
CONF: ICLR
YEAR: 2026
EDITION_URL: https://iclr.cc/Conferences/2026
FIELD: notificationDate
CURRENT: MISSING
VALUE: 2026-01-25
SOURCE: https://iclr.cc/Conferences/2026/Dates
EVIDENCE: Paper Decision Notification is January 25, 2026 AoE. Remove obsolete note claiming notification is unconfirmed when applying this.
CONFIDENCE: confirmed
```

```text
CONF: ICLR
YEAR: 2026
EDITION_URL: https://iclr.cc/Conferences/2026
FIELD: generalChair
CURRENT: TBD
VALUE: Carl Vondrick
SOURCE: https://iclr.cc/Conferences/2026/Committees
EVIDENCE: The 2026 committee labels Carl Vondrick General Chair.
CONFIDENCE: confirmed
```

```text
CONF: ICLR
YEAR: 2026
EDITION_URL: https://iclr.cc/Conferences/2026
FIELD: programChair
CURRENT: TBD
VALUE: Colin Raffel, Lerrel Pinto, Diyi Yang, Aleksandra Faust
SOURCE: https://iclr.cc/Conferences/2026/Committees
EVIDENCE: The four are explicitly labeled Program Chair; Bharath Hariharan is the separately labeled Senior Program Chair.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2026
EDITION_URL: https://virtual.aistats.org/Conferences/2026
FIELD: link
CURRENT: MISSING
VALUE: https://virtual.aistats.org/Conferences/2026
SOURCE: https://virtual.aistats.org/Conferences/2026
EVIDENCE: Official series year navigation resolves to the identified AISTATS 2026 edition.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2026
EDITION_URL: https://virtual.aistats.org/Conferences/2026
FIELD: seriesLink
CURRENT: MISSING
VALUE: https://virtual.aistats.org/
SOURCE: https://virtual.aistats.org/Conferences/2026
EVIDENCE: Edition uses the same official series root and navigation.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2026
EDITION_URL: https://virtual.aistats.org/Conferences/2026
FIELD: date
CURRENT: MISSING
VALUE: May 2–5, 2026
SOURCE: https://virtual.aistats.org/Conferences/2026
EVIDENCE: Edition heading states May 2–5, 2026.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2026
EDITION_URL: https://virtual.aistats.org/Conferences/2026
FIELD: place
CURRENT: MISSING
VALUE: Tangier, Morocco
SOURCE: https://virtual.aistats.org/Conferences/2026
EVIDENCE: Edition heading states Tangier, Morocco.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2026
EDITION_URL: https://virtual.aistats.org/Conferences/2026
FIELD: generalChair
CURRENT: MISSING
VALUE: Emtiyaz Khan, Yingzhen Li
SOURCE: https://virtual.aistats.org/Conferences/2026
EVIDENCE: Official organizing committee lists these General Chairs.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2026
EDITION_URL: https://virtual.aistats.org/Conferences/2026
FIELD: programChair
CURRENT: MISSING
VALUE: Arno Solin, Aaditya Ramdas
SOURCE: https://virtual.aistats.org/Conferences/2026
EVIDENCE: Official organizing committee lists these Program Chairs.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2026
EDITION_URL: https://virtual.aistats.org/Conferences/2026
FIELD: abstractDeadline
CURRENT: MISSING
VALUE: 2025-09-25
SOURCE: https://virtual.aistats.org/Conferences/2026/CallForPapers
EVIDENCE: CFP lists September 25, 2025 AoE.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2026
EDITION_URL: https://virtual.aistats.org/Conferences/2026
FIELD: deadline
CURRENT: MISSING
VALUE: 2025-10-02
SOURCE: https://virtual.aistats.org/Conferences/2026/CallForPapers
EVIDENCE: CFP lists October 2, 2025 AoE.
CONFIDENCE: confirmed
```

```text
CONF: AISTATS
YEAR: 2026
EDITION_URL: https://virtual.aistats.org/Conferences/2026
FIELD: notificationDate
CURRENT: MISSING
VALUE: 2026-01-22
SOURCE: https://virtual.aistats.org/Conferences/2026
EVIDENCE: Home important dates label January 22, 2026 Paper Decision Notifications.
CONFIDENCE: confirmed
```

```text
CONF: IJCAI
YEAR: 2029
EDITION_URL: NOT FOUND (official society announcement only)
FIELD: generalChair
CURRENT: MISSING
VALUE: Ronen Brafman
SOURCE: https://www.ijcai.org/future_conferences
EVIDENCE: Society Future Conferences explicitly assigns this role to IJCAI-2029. Host and dates remain unannounced.
CONFIDENCE: confirmed
```

```text
CONF: IJCAI
YEAR: 2029
EDITION_URL: NOT FOUND (official society announcement only)
FIELD: programChair
CURRENT: MISSING
VALUE: Pascal Van Hentenryck
SOURCE: https://www.ijcai.org/future_conferences
EVIDENCE: Society Future Conferences explicitly assigns this role to IJCAI-2029. Host and dates remain unannounced.
CONFIDENCE: confirmed
```

```text
CONF: IJCAI
YEAR: 2030
EDITION_URL: NOT FOUND (official society announcement only)
FIELD: generalChair
CURRENT: MISSING
VALUE: Ana Paiva
SOURCE: https://www.ijcai.org/future_conferences
EVIDENCE: Society Future Conferences explicitly assigns this role to IJCAI-2030. Host and dates remain unannounced.
CONFIDENCE: confirmed
```

```text
CONF: IJCAI
YEAR: 2030
EDITION_URL: NOT FOUND (official society announcement only)
FIELD: programChair
CURRENT: MISSING
VALUE: Min-Ling Zhang
SOURCE: https://www.ijcai.org/future_conferences
EVIDENCE: Society Future Conferences explicitly assigns this role to IJCAI-2030. Host and dates remain unannounced.
CONFIDENCE: confirmed
```

Coordinator review (October 10): Six confirmed edition patches and three additions were applied; AAAI feedback uses its ISO start date and a note for the full window.
