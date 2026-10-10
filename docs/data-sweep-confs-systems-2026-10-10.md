# Systems conferences audit — checked 2026-10-10

Read-only audit of 19 records across six series. Dataset was not edited. The proposed field patches are in `/tmp/confs-systems-patches.json`. Response dates use the last day of the announced response/revision period. Cosmetic event-date strings are preserved.

## Edition completeness

| Series | Edition/cycles | Findings |
| --- | --- | --- |
| ASPLOS | 2028  | No validated edition website or schedule found; retain estimated=true and verified=false. |
| ASPLOS | 2027 Cycle 1/2 | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| ASPLOS | 2027 Cycle 2/2 | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| ASPLOS | 2026 Cycle 2/2 | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| ASPLOS | 2026 Cycle 1/2 | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| EuroSys | 2028  | No validated edition website or schedule found; retain estimated=true and verified=false. |
| EuroSys | 2027 Cycle 1/2 | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| EuroSys | 2027 Cycle 2/2 | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| EuroSys | 2026 Cycle 1/2 | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| EuroSys | 2026 Cycle 2/2 | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| ISCA | 2027  | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| ISCA | 2026  | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| OSDI | 2027  | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| OSDI | 2026  | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| SOSP | 2028  | No validated edition website or schedule found; retain estimated=true and verified=false. |
| SOSP | 2027  | No validated edition website or schedule found; retain estimated=true and verified=false. |
| SOSP | 2026  | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |
| USENIX ATC | 2027 No official 2027 edition announced: usenix.org/conference/atc27 is 404 and USENIX's conference list has no ATC '27 (its July 7–9, 2027 Baltimore listing is OSDI '27). The 2026 edition was run by ACM SIGOPS. | No validated edition website or schedule found; retain estimated=true and verified=false. |
| USENIX ATC | 2026  | All ten schedule/link/chair fields inspected. Nulls mean no general chair announcement, no separate abstract deadline, or no response period as appropriate. |

## Discovery and unresolved facts

- SOSP 2027: official SIGOPS newsletter confirms Vancouver, Canada. The local derived `/sosp/2027/` URL was not retrievable. Dates, deadlines, chairs, acceptance rate, and submissions: NOT FOUND. SOSP 2028 is soliciting hosts; site-selection deadlines are not paper deadlines. [Sponsor evidence](https://www.sigops.org/newsletter-issue/3938/).
- ASPLOS 2028 and EuroSys 2028: series navigation, adjacent edition URL patterns, and official-domain searches produced no validated edition announcement. All event/schedule/chair fields: NOT FOUND. Existing skeletons remain unverified.
- ISCA 2028 and OSDI 2028: next-year URLs were not retrievable; series archive/calendar and domain searches produced no announced edition. No new record proposed. The USENIX calendar was read through both pages.
- USENIX ATC ended after July 2025. [USENIX announcement](https://www.usenix.org/blog/usenix-atc-announcement) confirms discontinuation. The [ACM ATC 2026 CFP](https://sigops.org/s/conferences/atc/2026/cfp.html) confirms an ACM conference serving the same community and scope. Keep the taxonomy key if needed, but explicitly label the sponsor change; do not present 2026 as sponsored by USENIX.
- ATC 2027: derived ACM and USENIX next-edition URLs did not load; sponsor navigation/search disclosed no announcement. All fields remain NOT FOUND. The existing note should acknowledge USENIX discontinuation and the distinct ACM continuation.
- OSDI seriesLink `https://osdi.org/` belongs to a Pakistan NGO, confirmed from its About section. The official archive is [USENIX OSDI symposia](https://www.usenix.org/conferences/byname/179). ISCA official archive is [iscaconf.org](https://www.iscaconf.org/); the local `isca.org` link could not be validated.
- ASPLOS 2026 existing acceptanceRate=14.5 and submissions=1048, and EuroSys 2026 acceptanceRate=19.09 and submissions=723: NOT FOUND on edition home/CFP/committee pages or official-domain queries. These numbers were not validated and should not count as audited facts. Proceedings front matter still needs checking before retaining or clearing these claims.
- Null acceptanceRate/submissions for the remaining current/upcoming records remain unknown; no numbers inferred. No new series are proposed.

## Confirmed schedule and chair audit

| Series/edition/cycle | Abstract | Paper | Response ends | Notification | General chairs | Program chairs | CFP |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ASPLOS 2027 Cycle 1/2 | NOT FOUND / not applicable | 2026-04-15 | 2026-07-09 | 2026-07-27 | Vassilis Papaefstathiou, Angelos Bilas, Andreas Moshovos, Christos Kozyrakis | Abhishek Bhattacharjee, Ada Gavrilovska, Steve Blackburn | [CFP](https://www.asplos-conference.org/asplos2027/cfp/) |
| ASPLOS 2027 Cycle 2/2 | NOT FOUND / not applicable | 2026-09-09 | 2026-12-04 | 2026-12-21 | Vassilis Papaefstathiou, Angelos Bilas, Andreas Moshovos, Christos Kozyrakis | Abhishek Bhattacharjee, Ada Gavrilovska, Steve Blackburn | [CFP](https://www.asplos-conference.org/asplos2027/cfp/) |
| ASPLOS 2026 Cycle 2/2 | 2025-08-13 | 2025-08-20 | 2025-11-14 | 2025-11-24 | Xulong Tang, Vijaykrishnan Narayanan | Benjamin C. Lee, Harry Xu, Mark Silberstein | [CFP](https://www.asplos-conference.org/asplos2026/cfp/index.html) |
| ASPLOS 2026 Cycle 1/2 | 2025-03-05 | 2025-03-12 | 2025-06-13 | 2025-06-24 | Xulong Tang, Vijaykrishnan Narayanan | Benjamin C. Lee, Harry Xu, Mark Silberstein | [CFP](https://www.asplos-conference.org/asplos2026/cfp/index.html) |
| EuroSys 2027 Cycle 1/2 | 2026-05-07 | 2026-05-14 | 2026-07-31 | 2026-08-21 | Rachid Guerraoui, Rafael Pires | Pramod Bhatotia, Lydia Chen, Andreas Haeberlen | [CFP](https://2027.eurosys.org/cfp.html) |
| EuroSys 2027 Cycle 2/2 | 2026-09-17 | 2026-09-24 | 2027-01-08 | 2027-01-29 | Rachid Guerraoui, Rafael Pires | Pramod Bhatotia, Lydia Chen, Andreas Haeberlen | [CFP](https://2027.eurosys.org/cfp.html) |
| EuroSys 2026 Cycle 1/2 | 2025-05-08 | 2025-05-15 | 2025-08-01 | 2025-08-22 | Antonio Barbalace, Luo Mai | Roxana Geambasu, Peter Pietzuch | [CFP](https://2026.eurosys.org/) |
| EuroSys 2026 Cycle 2/2 | 2025-09-18 | 2025-09-25 | 2026-01-09 | 2026-01-30 | Antonio Barbalace, Luo Mai | Roxana Geambasu, Peter Pietzuch | [CFP](https://2026.eurosys.org/) |
| ISCA 2027  | 2026-11-09 | 2026-11-16 | 2027-03-08 | 2027-03-26 | Hyesoon Kim, Prashant Nair | Yuan Xie | [CFP](https://iscaconf.org/isca2027/submit/callforpapers.php) |
| ISCA 2026  | 2025-11-10 | 2025-11-17 | 2026-03-06 | 2026-03-27 | James Tuck, Huiyang Zhou | Kevin Skadron, Carole-Jean Wu | [CFP](https://www.iscaconf.org/isca2026/submit/callforpapers.php) |
| OSDI 2027  | 2026-12-01 | 2026-12-08 | NOT FOUND / not applicable | 2027-03-16 | NOT FOUND / not applicable | Philip Levis, Junfeng Yang | [CFP](https://www.usenix.org/conference/osdi27/call-for-papers) |
| OSDI 2026  | 2025-12-04 | 2025-12-11 | NOT FOUND / not applicable | 2026-03-26 | NOT FOUND / not applicable | Eddie Kohler, Amar Phanishayee | [CFP](https://www.usenix.org/conference/osdi26/call-for-papers) |
| SOSP 2026  | 2026-03-26 | 2026-04-01 | 2026-06-24 | 2026-07-03 | Pramod Bhatotia, Christof Fetzer | Angela Demke Brown, Shan Lu | [CFP](https://sigops.org/s/conferences/sosp/2026/cfp.html) |
| USENIX ATC 2026  | NOT FOUND / not applicable | 2026-06-10 | 2026-09-02 | 2026-09-18 | John C.S. Lui, Chuan Wu | Marcos K. Aguilera, Gala Yadgar | [CFP](https://sigops.org/s/conferences/atc/2026/cfp.html) |

## Proposed field evidence

```text
CONF: ASPLOS
YEAR: 2027
EDITION_URL: https://www.asplos-conference.org/asplos2027/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2026-07-09
SOURCE: https://www.asplos-conference.org/asplos2027/cfp/
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (Cycle 1/2)
CONFIDENCE: confirmed
```

```text
CONF: ASPLOS
YEAR: 2027
EDITION_URL: https://www.asplos-conference.org/asplos2027/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2026-12-04
SOURCE: https://www.asplos-conference.org/asplos2027/cfp/
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (Cycle 2/2)
CONFIDENCE: confirmed
```

```text
CONF: ASPLOS
YEAR: 2026
EDITION_URL: https://www.asplos-conference.org/asplos2026/
FIELD: seriesLink
CURRENT: MISSING
VALUE: https://www.asplos-conference.org/
SOURCE: https://www.asplos-conference.org/
EVIDENCE: Official edition page explicitly establishes this field. (Cycle 2/2)
CONFIDENCE: confirmed
```

```text
CONF: ASPLOS
YEAR: 2026
EDITION_URL: https://www.asplos-conference.org/asplos2026/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2025-11-14
SOURCE: https://www.asplos-conference.org/asplos2026/cfp/index.html
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (Cycle 2/2)
CONFIDENCE: confirmed
```

```text
CONF: ASPLOS
YEAR: 2026
EDITION_URL: https://www.asplos-conference.org/asplos2026/
FIELD: seriesLink
CURRENT: MISSING
VALUE: https://www.asplos-conference.org/
SOURCE: https://www.asplos-conference.org/
EVIDENCE: Official edition page explicitly establishes this field. (Cycle 1/2)
CONFIDENCE: confirmed
```

```text
CONF: ASPLOS
YEAR: 2026
EDITION_URL: https://www.asplos-conference.org/asplos2026/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2025-06-13
SOURCE: https://www.asplos-conference.org/asplos2026/cfp/index.html
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (Cycle 1/2)
CONFIDENCE: confirmed
```

```text
CONF: EuroSys
YEAR: 2026
EDITION_URL: https://2026.eurosys.org/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2025-08-01
SOURCE: https://2026.eurosys.org/
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (Cycle 1/2)
CONFIDENCE: confirmed
```

```text
CONF: ISCA
YEAR: 2027
EDITION_URL: https://iscaconf.org/isca2027/
FIELD: seriesLink
CURRENT: https://www.isca.org/
VALUE: https://www.iscaconf.org/
SOURCE: https://www.iscaconf.org/
EVIDENCE: Official edition page explicitly establishes this field. (edition)
CONFIDENCE: confirmed
```

```text
CONF: ISCA
YEAR: 2027
EDITION_URL: https://iscaconf.org/isca2027/
FIELD: abstractDeadline
CURRENT: 2026-11-10
VALUE: 2026-11-09
SOURCE: https://iscaconf.org/isca2027/submit/callforpapers.php
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (edition)
CONFIDENCE: confirmed
```

```text
CONF: ISCA
YEAR: 2027
EDITION_URL: https://iscaconf.org/isca2027/
FIELD: deadline
CURRENT: 2026-11-17
VALUE: 2026-11-16
SOURCE: https://iscaconf.org/isca2027/submit/callforpapers.php
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (edition)
CONFIDENCE: confirmed
```

```text
CONF: ISCA
YEAR: 2027
EDITION_URL: https://iscaconf.org/isca2027/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2027-03-08
SOURCE: https://iscaconf.org/isca2027/submit/callforpapers.php
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (edition)
CONFIDENCE: confirmed
```

```text
CONF: ISCA
YEAR: 2027
EDITION_URL: https://iscaconf.org/isca2027/
FIELD: notificationDate
CURRENT: 2027-03-27
VALUE: 2027-03-26
SOURCE: https://iscaconf.org/isca2027/submit/callforpapers.php
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (edition)
CONFIDENCE: confirmed
```

```text
CONF: ISCA
YEAR: 2027
EDITION_URL: https://iscaconf.org/isca2027/
FIELD: generalChair
CURRENT: MISSING
VALUE: Hyesoon Kim, Prashant Nair
SOURCE: https://iscaconf.org/isca2027/committees/org.php
EVIDENCE: Official edition page explicitly establishes this field. (edition)
CONFIDENCE: confirmed
```

```text
CONF: ISCA
YEAR: 2027
EDITION_URL: https://iscaconf.org/isca2027/
FIELD: programChair
CURRENT: MISSING
VALUE: Yuan Xie
SOURCE: https://iscaconf.org/isca2027/committees/org.php
EVIDENCE: Official edition page explicitly establishes this field. (edition)
CONFIDENCE: confirmed
```

```text
CONF: ISCA
YEAR: 2026
EDITION_URL: https://www.iscaconf.org/isca2026/
FIELD: seriesLink
CURRENT: MISSING
VALUE: https://www.iscaconf.org/
SOURCE: https://www.iscaconf.org/
EVIDENCE: Official edition page explicitly establishes this field. (edition)
CONFIDENCE: confirmed
```

```text
CONF: ISCA
YEAR: 2026
EDITION_URL: https://www.iscaconf.org/isca2026/
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2026-03-06
SOURCE: https://www.iscaconf.org/isca2026/submit/callforpapers.php
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (edition)
CONFIDENCE: confirmed
```

```text
CONF: OSDI
YEAR: 2027
EDITION_URL: https://www.usenix.org/conference/osdi27
FIELD: seriesLink
CURRENT: https://osdi.org/
VALUE: https://www.usenix.org/conferences/byname/179
SOURCE: https://www.usenix.org/conferences/byname/179
EVIDENCE: Official edition page explicitly establishes this field. (edition)
CONFIDENCE: confirmed
```

```text
CONF: OSDI
YEAR: 2026
EDITION_URL: https://www.usenix.org/conference/osdi26
FIELD: seriesLink
CURRENT: https://osdi.org/
VALUE: https://www.usenix.org/conferences/byname/179
SOURCE: https://www.usenix.org/conferences/byname/179
EVIDENCE: Official edition page explicitly establishes this field. (edition)
CONFIDENCE: confirmed
```

```text
CONF: OSDI
YEAR: 2026
EDITION_URL: https://www.usenix.org/conference/osdi26
FIELD: notificationDate
CURRENT: MISSING
VALUE: 2026-03-26
SOURCE: https://www.usenix.org/conference/osdi26/call-for-papers
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (edition)
CONFIDENCE: confirmed
```

```text
CONF: USENIX ATC
YEAR: 2026
EDITION_URL: https://sigops.org/s/conferences/atc/2026/index.html
FIELD: deadline
CURRENT: 2026-06-11
VALUE: 2026-06-10
SOURCE: https://sigops.org/s/conferences/atc/2026/cfp.html
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (edition)
CONFIDENCE: confirmed
```

```text
CONF: USENIX ATC
YEAR: 2026
EDITION_URL: https://sigops.org/s/conferences/atc/2026/index.html
FIELD: rebuttalDate
CURRENT: MISSING
VALUE: 2026-09-02
SOURCE: https://sigops.org/s/conferences/atc/2026/cfp.html
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (edition)
CONFIDENCE: confirmed
```

```text
CONF: USENIX ATC
YEAR: 2026
EDITION_URL: https://sigops.org/s/conferences/atc/2026/index.html
FIELD: notificationDate
CURRENT: MISSING
VALUE: 2026-09-18
SOURCE: https://sigops.org/s/conferences/atc/2026/cfp.html
EVIDENCE: Official CFP specifies this date; response periods use their ending date. (edition)
CONFIDENCE: confirmed
```

```text
CONF: SOSP
YEAR: 2027
EDITION_URL: https://sigops.org/s/conferences/sosp/2027/
FIELD: link
CURRENT: https://sigops.org/s/conferences/sosp/2027/
VALUE: NOT FOUND
SOURCE: https://www.sigops.org/newsletter-issue/3938/
EVIDENCE: Sponsor announces Vancouver for 2027, but the derived local edition URL failed retrieval and no validated edition URL was located. (edition)
CONFIDENCE: needs-review
```

```text
CONF: SOSP
YEAR: 2027
EDITION_URL: https://sigops.org/s/conferences/sosp/2027/
FIELD: seriesLink
CURRENT: MISSING
VALUE: https://sosp.org/
SOURCE: https://sosp.org/
EVIDENCE: Official series archive lists SOSP editions. (edition)
CONFIDENCE: confirmed
```


Coordinator review (October 10): Confirmed field patches were applied. SOSP link clearing was not applied: retrieval failure does not prove an invalid URL. ATC 2026/2027 names now say ACM ATC, retaining usenixatc venue keys and historical USENIX editions. Unsupported ASPLOS/EuroSys statistics remain pending review.
