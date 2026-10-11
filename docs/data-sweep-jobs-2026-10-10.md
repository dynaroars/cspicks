# Jobs sweep evidence — 2026-10-10

The full sweep remains in progress. Three school crawls are complete for this pass; seven additional schools have partial checks. The coverage ledger is `docs/data-sweep-2026-10-10.json`. Raw browser captures are under `/tmp` and contain the official URL and HTTP status; they are research material, not independently verified dataset updates.

## Posting corrections

| Posting | Official source | Confirmed changes |
| --- | --- | --- |
| ASU AI for infrastructure | [194202](https://apply.interfolio.com/194202) | SCAI department; AI/ML areas; October 29 priority then reserve-pool review until filled; August 2027 appointment. |
| ASU AI with real-world impact | [194258](https://apply.interfolio.com/194258) | SCAI department; AI/ML and cybersecurity; October 29 priority then reserve-pool review until filled; August 2027 appointment. |
| ASU quantum computing | [194270](https://apply.interfolio.com/194270) | SCAI department; quantum algorithms, ML, architectures, software and networking; October 29 priority then reserve-pool review until filled; August 2027 appointment. |
| Tennessee computer engineering | [193072](https://apply.interfolio.com/193072) | Security, embedded systems, networks, distributed systems, architecture and EDA; November 30 priority with later applications considered until filled. |
| Tennessee computer science | [192692](https://apply.interfolio.com/192692) | Security/privacy, graphics, PL, robotics and HCI; explicitly excludes candidates working only in AI/ML; October 15 priority, rolling thereafter. |

All five full posting pages were read, so `visaSponsorship: not-stated` is now supported. `lastSeenAt` is October 10. Month-only appointment dates stay in summaries rather than becoming invented day-specific ISO dates.

## Newly added postings

| ID | Official source | Dates and eligibility evidence |
| --- | --- | --- |
| tulsa-instructional-asst-prof-cyber-studies-2026 | [Oracle 282](https://utulsa-ibvjjb.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/282) | Live full-time cybersecurity teaching faculty; posted May 20, 2026; January 2027 appointment; relevant MS required and PhD preferred. No deadline or sponsorship statement. A PhD minimum is not required for dataset teaching scope. |
| mst-asst-assoc-prof-cs-2026 | [eRecruit 60984](https://erecruit.umsystem.edu/psp/tamext/ROLLA/HRMS/c/HRS_HRAM_FL.HRS_CG_SEARCH_FL.GBL?Page=HRS_APP_JBPST_FL&Action=U&SiteId=10&FOCUS=Applicant&SiteId=10&JobOpeningId=60984&PostingSeq=1) | Posted September 14; October 31, 2026 review, until filled; AI priority with other named CS fields considered; relevant PhD. Conditional sponsorship for candidates already in U.S. in eligible work-authorized status. |
| mst-asst-assoc-teaching-cs-2026 | [eRecruit 60978](https://erecruit.umsystem.edu/psp/tamext/ROLLA/HRMS/c/HRS_HRAM_FL.HRS_CG_SEARCH_FL.GBL?Page=HRS_APP_JBPST_FL&Action=U&SiteId=10&FOCUS=Applicant&SiteId=10&JobOpeningId=60978&PostingSeq=1) | Posted September 11; rolling; Fall 2027; relevant MS/PhD, PhD preferred. Same conditional sponsorship. No specific research areas stated. |
| mst-asst-prof-computer-engineering-2026 | [eRecruit 60994](https://erecruit.umsystem.edu/psp/tamext/ROLLA/HRMS/c/HRS_HRAM_FL.HRS_CG_SEARCH_FL.GBL?Page=HRS_APP_JBPST_FL&Action=U&SiteId=10&FOCUS=Applicant&SiteId=10&JobOpeningId=60994&PostingSeq=1) | Posted September 14; November 1, 2026 full consideration, until filled; architecture/AI; computer engineering or related PhD. Same conditional sponsorship. |
| mst-ece-postdoc-energy-optimization-2026 | [eRecruit 59561](https://erecruit.umsystem.edu/psp/tamext/ROLLA/HRMS/c/HRS_HRAM_FL.HRS_CG_SEARCH_FL.GBL?Page=HRS_APP_JBPST_FL&Action=U&SiteId=10&FOCUS=Applicant&SiteId=10&JobOpeningId=59561&PostingSeq=1) | Posted August 7; rolling; EE/CS/IE/OR PhD; energy forecasting/optimization/ML; explicitly no visa sponsorship. |
| indstate-asst-prof-business-analytics-2026 | [56526](https://jobs.indstate.edu/postings/56526) | Posted June 3; August 15 priority, open until filled; January 1, 2027 start; data/business analytics, management science, OR or closely related PhD/DBA; no sponsorship and no OPT/CPT-only work authorization. |
| louisiana-ece-asst-prof-2023 | [CSOD 2584](https://louisiana.csod.com/ux/ats/careersite/1/home/requisition/2584?c=louisiana) | Still on public board and application page. ECE search naming security, robotics and embedded systems. Retains October 2023 posting, November 2024 review and August 2025 preferred start; preserved those dates and stated the stale timeline explicitly. No closure inferred. |

Missouri S&T share dialogs exposed permanent posting URLs; each was then opened in a fresh browser session. No email was sent.

## School coverage and remaining checks

- **Missouri S&T:** Read the complete 25-entry faculty/research eRecruit board, CS homepage and all four relevant CS/ECE postings. Added all four. Other listed departments do not target computing applicants.
- **Indiana State:** Read CS homepage and all 79 public jobs over three populated pages; fourth page empty. Added data/business analytics role. Remaining faculty listings concern social work, physical therapy, physician assistant, construction management and aviation. Student/staff roles excluded.
- **New York Tech:** Read all four iCIMS pages using its ordinary embedded frame, professor search, and ambiguous details 4219, 4209, 4204 and 4270. Computing/ECE entries were adjunct pools. The research assistant is a biomedical technician, and instructor roles require medical simulation/biomedical education; the generic assistant professor requires MD/DO. No full-time computing faculty/research/postdoc opening found.
- **Louisiana Lafayette:** All 34 board entries over two pages read. Added ECE 2584; architecture digital communication 3965 requires design/architecture qualifications. CS and engineering department pages return HTTP 500; those pages and the old ECE timeline remain unresolved.
- **Western Michigan:** All 11 faculty entries and BIS cybersecurity 3819 read. BIS requires Business Computer Information Systems PhD from AACSB institution, so does not target a CS PhD. Department pages and research listings remain to check.
- **Tulsa:** Added live teaching role 282. Remaining whole-board and related-unit checks pending.
- **ASU / Tennessee:** Five recorded postings above fully read; whole-school discovery and remaining postings pending.
- **UT San Antonio:** Read moved CS homepage and old CE advertisements; whole-school portal and adjacent departments pending. No new job inferred from old cycle dates.
- **Illinois Tech:** Rendered HRMDirect index; only staff department categories exposed. Computing/ECE pages and other official faculty routes need completion.

## Full capture process

An ordinary Chromium capture of all 652 known official hiring/related-unit/posting URLs was started using `scripts/jobs-render.mjs` in batches of 20. Manifest and batch checkpoints: `/tmp/cspicks-full-jobs-capture/`. Runner: `/tmp/full-jobs-capture.cjs`. Captures must be read and compared with the datasets before any school is marked complete or any posting re-confirmed/closed. URL inventory and captured text alone are not audit completion evidence.

## Second review batch — CMU

Reviewed the complete university faculty index, CSD/ECE hiring pages, and 28 relevant or ambiguous posting details. Added 16 faculty, teaching, leadership and postdoc roles; corrected/refreshed six prior records. Exact records, exclusions and official URLs are in `docs/data-sweep-jobs-cmu-evidence-2026-10-10.json`. Older BME, Xu and Lane advertisements are still live and retain their source dates with explicit historical timing notes.

All 33 capture batches completed: 652 known official URLs. Other captures still require evidence review before a school or posting is marked checked.
