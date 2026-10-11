# Vision and robotics conference sweep — 2026-10-10

Read-only official-source research for CVPR, ICCV, ECCV, WACV, ICRA and IROS. No dataset or ledger edits. All 11 current records/cycles checked; all fields have explicit outcomes in `/tmp/confs-vision-robotics-patches.json`. Coordinator had already applied initial deadline/committee corrections, which are rechecked here. Unknown fields remain unknown.

## Audit outcomes

| Edition/cycle | Outcome | Remaining checks |
| --- | --- | --- |
| CVPR 2028 | partial | Edition /Conferences/2028 returns HTTP 404; event dates and all submission milestones unannounced. Generic series link remains available. |
| CVPR 2027 | audited | No schedule/chair gaps; null future statistics or inapplicable milestones explicitly recorded. |
| CVPR 2026 | audited | No schedule/chair gaps; null future statistics or inapplicable milestones explicitly recorded. |
| ECCV 2026 | partial | 2026 submissions and acceptance rate NOT FOUND after edition home/program/accepted-paper and restricted official-domain searches. Next /Conferences/2028 returns 404; no ECVA next-edition announcement established. |
| ICCV 2027 | partial | All paper milestones NOT FOUND; no full CFP timeline yet. Generic root serves 2027 correctly; year-specific /Conferences/2027 also available. |
| ICRA 2027 | partial | Schedule/chairs checked; generic seriesLink icra.org not validated (timeout). |
| ICRA 2026 | partial | Statistics unresolved: official raw submissions 5,088 versus stored 4,947; stored acceptance 38.04% has no corroborated accepted count or denominator. Recommend retaining pending review rather than combining unlike metrics. |
| IROS 2027 | partial | Stored edition domain ERR_NAME_NOT_RESOLVED; abstract/rebuttal/notification NOT FOUND via sponsor fallback. |
| IROS 2026 | partial | Stored submissions 4,348 and acceptance 36.45% NOT FOUND in official edition/sponsor sources; not safe to assert or replace. March 5 permits modifications to papers submitted by March 2, not new submissions. |
| WACV 2027 round 1 | audited | No schedule/chair gaps; null future statistics or inapplicable milestones explicitly recorded. |
| WACV 2027 round 2 | audited | No schedule/chair gaps; null future statistics or inapplicable milestones explicitly recorded. |

## Remaining changes

Each proposed field has its own evidence block below. Statistics marked needs-review are proposals for coordinator review, not safe automatic replacements. CVPR acceptance rate is explicitly derived from the final official submitted/accepted counts.

ICRA 2026 and IROS 2026 stored acceptance percentages cannot be corroborated in this pass; retain pending review. ECCV 2026 statistics remain NOT FOUND.

## Newly discovered editions

Structured complete proposed records and field-specific source evidence are in the patch artifact. Next missing editions: CVPR 2029, WACV 2028, ICCV 2031, ICRA 2028/2029 and IROS 2028. Missing WACV 2026 has two proposed cycles. All unannounced fields are null. Future sponsor-only records use their working sponsor source as link when an edition URL has not been validated.

ICRA 2028 has conflicting official venue/deadline announcements: [Rio listing](https://www.ieee-ras.org/event/2028-ieee-international-conference-on-robotics-and-automation-icra-74101/) and [Guadalajara listing](https://www.ieee-ras.org/event/2028-ieee-international-conference-on-robotics-and-automation-icra-64236/). Do not choose either venue or deadline. Event dates agree.

IROS 2028 Sydney is established in [approved sponsor minutes](https://www.ieee-ras.org/wp-content/uploads/2026/01/APPROVED_Minutes__March_28th__2025.pdf); a [sponsor member profile](https://www.ieee-ras.org/ras_member/peter-corke/) establishes one program co-chair, not the complete committee. No event dates or paper timeline established.

WACV 2026 [CFP](https://wacv.thecvf.com/Conferences/2026/CallForPapers) gives final decisions November 5 while [Dates](https://wacv.thecvf.com/Conferences/2026/Dates) displays November 6 UTC; proposed notificationDate remains null pending review.

Further announced editions are listed in the artifact as leads: CVPR 2030/2031; WACV 2029–2031; ICCV 2029 is metadata TBD. ECCV 2028 URL returned 404 and no official next-edition announcement was found.

## Edition validation and source priority

CVPR/ECCV/WACV edition route bodies and year navigation match intended years. Some organizer HTML titles say 2025/2026 despite body identifying 2026/2027; role headings and edition body were checked. ICCV generic root currently serves 2027. Future CVPR/ECCV/WACV 2028 routes return HTTP 404. IROS 2027 domain fails DNS in Chromium; sponsor future-venues/calendar corroborate available facts. ICRA 2028/2029 edition URLs fail SSL; sponsor event records are the fallback. Real browser captures are recorded in the artifact. Edition committees take precedence over stale sponsor tables (ECCV program committee, WACV fifth program chair, IROS Hatton spelling).

## Evidence blocks

The JSON artifact also includes unchanged field evidence and NOT FOUND outcomes. Blocks below cover remaining proposed differences.

```text
CONF: CVPR
YEAR: 2028
EDITION_URL: https://www.thecvf.com/?page_id=100
FIELD: generalChair
CURRENT: T. Hassner, A. Tal, K. Derpanis, X. Liu
VALUE: T. Hassner, A. Tal, R. Souvenir
SOURCE: https://www.thecvf.com/?page_id=100
EVIDENCE: The future-edition general-chair column differs from the stored mixed-role list.
CONFIDENCE: confirmed
```

```text
CONF: CVPR
YEAR: 2028
EDITION_URL: https://www.thecvf.com/?page_id=100
FIELD: programChair
CURRENT: null
VALUE: K. Derpanis, X. Liu, R. Giryes, S. J. Kim, G. Varol
SOURCE: https://www.thecvf.com/?page_id=100
EVIDENCE: The separate program-chair column names five chairs.
CONFIDENCE: confirmed
```

```text
CONF: CVPR
YEAR: 2028
EDITION_URL: https://www.thecvf.com/?page_id=100
FIELD: place
CURRENT: San Antonio, TX, USA
VALUE: San Antonio, TX, US
SOURCE: https://www.thecvf.com/?page_id=100
EVIDENCE: Sponsor identifies San Antonio; normalized repository US country spelling.
CONFIDENCE: confirmed
```

```text
CONF: CVPR
YEAR: 2026
EDITION_URL: https://cvpr.thecvf.com/Conferences/2026
FIELD: submissions
CURRENT: null
VALUE: 16092
SOURCE: https://cvpr.thecvf.com/Conferences/2026/News/Closing
EVIDENCE: Final June 22 closing report gives 16,092 submitted papers and 4,089 accepted presentations.
CONFIDENCE: confirmed
```

```text
CONF: CVPR
YEAR: 2026
EDITION_URL: https://cvpr.thecvf.com/Conferences/2026
FIELD: acceptanceRate
CURRENT: 25.42
VALUE: 25.41
SOURCE: https://cvpr.thecvf.com/Conferences/2026/News/Closing
EVIDENCE: Derived from final counts: 4089 / 16092 × 100 = 25.41%, rounded to two decimals. Earlier press release percentage differs; prefer final counts.
CONFIDENCE: confirmed
```

```text
CONF: ECCV
YEAR: 2026
EDITION_URL: https://eccv.ecva.net/Conferences/2026
FIELD: note
CURRENT: null
VALUE: Paper registration and submission deadlines are 23:00 CET; rebuttal deadline is 23:00 CEST.
SOURCE: https://eccv.ecva.net/Conferences/2026/CallForPapers
EVIDENCE: The paper CFP explicitly specifies CET for February/March and CEST for May; do not assume AoE.
CONFIDENCE: confirmed
```

```text
CONF: ICCV
YEAR: 2027
EDITION_URL: https://iccv.thecvf.com/
FIELD: programChair
CURRENT: Derek Hoiem, Adriana Kovashka, Philippos Mordohai, Jingyi Yu
VALUE: Derek Hoiem, Adriana Kovashka, Philippos Mordohai, Marcus Rohrbach, Ping Tan, Jingyi Yu
SOURCE: https://iccv.thecvf.com//Conferences/2027/Committees
EVIDENCE: Edition committee body lists six program chairs, including two omitted locally. Page title is stale 2025; menu and committee heading/body identify 2027.
CONFIDENCE: confirmed
```

```text
CONF: ICCV
YEAR: 2027
EDITION_URL: https://iccv.thecvf.com/
FIELD: estimated
CURRENT: False
VALUE: True
SOURCE: https://iccv.thecvf.com/Conferences/2027/Dates
EVIDENCE: Submission timeline has not been announced; MAINTENANCE requires estimated until timeline confirmed.
CONFIDENCE: confirmed
```

```text
CONF: ICCV
YEAR: 2027
EDITION_URL: https://iccv.thecvf.com/
FIELD: verified
CURRENT: True
VALUE: False
SOURCE: https://iccv.thecvf.com/Conferences/2027/Dates
EVIDENCE: Dates page supplies event dates only; important submission schedule facts are NOT FOUND.
CONFIDENCE: confirmed
```

```text
CONF: ICRA
YEAR: 2026
EDITION_URL: https://2026.ieee-icra.org/
FIELD: submissions
CURRENT: 4947
VALUE: 5088
SOURCE: https://2026.ieee-icra.org/announcements/record-of-submissions/
EVIDENCE: Official October 22, 2025 announcement says 5,088 submissions. Stored 4,947 could be post-withdrawal review count; this denominator distinction is unresolved.
CONFIDENCE: needs-review
```

```text
CONF: IROS
YEAR: 2027
EDITION_URL: https://www.iros2027.org/
FIELD: seriesLink
CURRENT: null
VALUE: https://www.ieee-ras.org/conferences-workshops/financially-co-sponsored/iros/iros-past-and-future-venues/
SOURCE: https://www.ieee-ras.org/conferences-workshops/financially-co-sponsored/iros/iros-past-and-future-venues/
EVIDENCE: Sponsor page serves the stable past/future IROS series listing.
CONFIDENCE: confirmed
```

```text
CONF: IROS
YEAR: 2027
EDITION_URL: https://www.iros2027.org/
FIELD: programChair
CURRENT: Ross Hutton
VALUE: Sami Haddadin
SOURCE: https://www.ieee-ras.org/conferences-workshops/financially-co-sponsored/iros/iros-past-and-future-venues/
EVIDENCE: Sponsor 2027 future-venues block names Sami Haddadin as program chair; stored Ross Hutton belongs to the prior edition.
CONFIDENCE: confirmed
```

```text
CONF: IROS
YEAR: 2026
EDITION_URL: https://2026.ieee-iros.org/
FIELD: seriesLink
CURRENT: null
VALUE: https://www.ieee-ras.org/conferences-workshops/financially-co-sponsored/iros/iros-past-and-future-venues/
SOURCE: https://www.ieee-ras.org/conferences-workshops/financially-co-sponsored/iros/iros-past-and-future-venues/
EVIDENCE: Sponsor page serves the stable past/future IROS series listing.
CONFIDENCE: confirmed
```

```text
CONF: IROS
YEAR: 2026
EDITION_URL: https://2026.ieee-iros.org/
FIELD: programChair
CURRENT: Ross Hutton
VALUE: Ross Hatton
SOURCE: https://2026.ieee-iros.org/about/organizing-committee/
EVIDENCE: Edition committee spells program-chair surname Hatton, superseding sponsor misspelling Hutton.
CONFIDENCE: confirmed
```

```text
CONF: IROS
YEAR: 2026
EDITION_URL: https://2026.ieee-iros.org/
FIELD: place
CURRENT: Pittsburgh, Pennsylvania, USA
VALUE: Pittsburgh, PA, US
SOURCE: https://2026.ieee-iros.org/
EVIDENCE: Edition home identifies Pittsburgh; repository place convention uses state abbreviation and US.
CONFIDENCE: confirmed
```

```text
CONF: WACV
YEAR: 2027
EDITION_URL: https://wacv.thecvf.com/Conferences/2027
FIELD: place
CURRENT: Disney Springs, Buena Vista, FL, USA
VALUE: Lake Buena Vista, FL, US
SOURCE: https://wacv.thecvf.com/Conferences/2027/Hotels
EVIDENCE: Edition hotel page identifies Hilton Orlando Lake Buena Vista (normalize the city rather than Disney Springs branding).
CONFIDENCE: confirmed
```

```text
CONF: WACV
YEAR: 2027
EDITION_URL: https://wacv.thecvf.com/Conferences/2027
FIELD: place
CURRENT: Disney Springs, Buena Vista, FL, USA
VALUE: Lake Buena Vista, FL, US
SOURCE: https://wacv.thecvf.com/Conferences/2027/Hotels
EVIDENCE: Edition hotel page identifies Hilton Orlando Lake Buena Vista (normalize the city rather than Disney Springs branding).
CONFIDENCE: confirmed
```

```text
CONF: CVPR
YEAR: 2027
EDITION_URL: https://cvpr.thecvf.com/Conferences/2027
FIELD: place
CURRENT: Seattle, WA, USA
VALUE: Seattle, WA, US
SOURCE: https://cvpr.thecvf.com/Conferences/2027
EVIDENCE: Edition home confirms city and state; normalize country spelling to repository US convention.
CONFIDENCE: confirmed
```

```text
CONF: CVPR
YEAR: 2026
EDITION_URL: https://cvpr.thecvf.com/Conferences/2026
FIELD: place
CURRENT: Denver, CO, USA
VALUE: Denver, CO, US
SOURCE: https://cvpr.thecvf.com/Conferences/2026
EVIDENCE: Edition home confirms city and state; normalize country spelling to repository US convention.
CONFIDENCE: confirmed
```

```text
CONF: ICCV
YEAR: 2027
EDITION_URL: https://iccv.thecvf.com/Conferences/2027
FIELD: link
CURRENT: https://iccv.thecvf.com/
VALUE: https://iccv.thecvf.com/Conferences/2027
SOURCE: https://iccv.thecvf.com/Conferences/2027
EVIDENCE: Validated route body explicitly identifies ICCV2027 and event venue/dates; prefer edition-specific link over generic root.
CONFIDENCE: confirmed
```

ICRA 2026/2027 generic `seriesLink` could not be validated; edition URLs load and establish schedule/chairs. This link check remains partial. No replacement proposed from a merely guessed URL.
