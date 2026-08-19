# CS Picks: FAQ, Methods, and Data

[Open CS Picks](https://dynaroars.github.io/cspicks/) · [Report an issue](https://github.com/dynaroars/cspicks/issues)

## Data and rankings

### How are rankings calculated?

CS Picks follows the CSRankings approach and uses the geometric mean of adjusted publication counts across research areas. This rewards breadth across computer science rather than dominance in only one area.

```text
Score = (product of (adjusted count + 1)) ^ (1 / number of areas)
```

### What does “adjusted publication count” mean?

Each eligible paper contributes `1.0` in total, divided equally among its authors. For example, each author of a four-author paper receives an adjusted publication count of `0.25`. CS Picks always uses this fractional-author credit.

### What do the university statistics mean?

- **Rank movement** compares the selected period with the immediately preceding period of equal length.
- **Momentum** is the percentage change in adjusted publication count between those periods.
- **Median per faculty** is the median adjusted publication count among active faculty.
- **Top-three concentration** is the share produced by the university’s three highest-output faculty.
- **Breadth** counts active and sustained research areas.
- **Team-size proxy** divides raw publication count by adjusted publication count. It describes coauthor intensity, but cannot distinguish internal from cross-university collaboration.

### Where does the data come from?

- [CSRankings](https://csrankings.org/) supplies the faculty roster, publication data, venue taxonomy, and institution information.
- The locally maintained schedule under `csconfs/data/` supplies conference dates and submission timelines. Entries marked Estimated are projections and should be confirmed on the linked conference website. Deadline countdowns use Anywhere on Earth (UTC−12), and schedule year filters refer to the conference year rather than the submission year.
- Schedule records are maintained through agent-assisted research of official conference and sponsoring-society websites, plus contributor corrections. Historical acceptance totals came from [emeryberger/csconferences](https://github.com/emeryberger/csconferences). Third-party deadline lists may provide leads, but they are not authoritative sources for updates.
- [DBLP](https://dblp.org/) supplies author-search and publication metadata used by the simulator.
- [OpenAlex](https://openalex.org/) and manually reviewed corrections supply estimated historical affiliations.

## Features and filters

### What is History mode?

By default, every eligible paper is credited to its author’s current CSRankings institution. History mode instead attempts to credit a paper to the institution where the author was affiliated in the publication year.

Historical affiliation records are estimates. They can be incomplete or incorrect, especially for older years, visiting positions, and institutions that changed names.

### What does the Rankings checkbox do?

Off by default, the result lists read as plain lists of universities and people. Turning it on shows each university's overall rank for the selected region, years, and conference set, plus its rank within each research area, and ranks people by adjusted publication count over the same selection. In an area or conference view both are ranked within that subject instead. Equal values share a rank.

### Can I compare two universities or two professors?

Yes, on both Search and NSF Funding: type both names separated by `vs` — for example `Carnegie Mellon University vs Univ. of Illinois at Urbana-Champaign`. Both search boxes autocomplete, and after you type `vs` the menu narrows to universities and professors, so you can pick the second side from the list instead of spelling it out. Search compares publication output by research area; NSF Funding compares awards, attributed funding, and the number of matched CS faculty. Both sides must be the same kind of target.

### What do the conference-set options mean?

- **CSRankings (Default)** uses the primary CSRankings venue set and excludes its optional next-tier venues. Venues that CSRankings collects but never assigns to a research area (PoPETs, for example) are counted by neither CSRankings option.
- **CSRankings (All)** includes both the primary and extended CSRankings venues, including venues such as ASE, ISSTA, ICDE, PODS, HPCA, NDSS, EuroSys, Eurographics, FAST, USENIX ATC, ICFP, OOPSLA, and KDD.
- **CORE A\*** includes only conferences mapped to the CORE A* tier.
- **CORE A\*/A** includes conferences mapped to either the CORE A* or A tier.

Conference definitions can change upstream. CS Picks synchronizes its venue rules from CSRankings when possible and keeps a bundled fallback.

### How does the ranking simulator work?

Choose a target university and one or more researchers. Current faculty are modeled as removals, faculty at another ranked university as transfers, and external DBLP researchers as additions. The simulator applies their eligible publication records to the selected period and conference set, then recalculates overall and per-area ranks.

The simulator is exploratory. Its results are hypothetical and should not be interpreted as predictions, hiring recommendations, or evaluations of individuals.

### How does the NSF Funding beta work?

The funding page uses public records from the official [NSF Award Search](https://www.nsf.gov/funding/award-search). A synchronization script searches current CSRankings faculty as primary investigators and retains an award only when its NSF recipient matches the faculty member’s current CSRankings institution.

For an award with multiple listed investigators, NSF's estimated total award amount (the intended amount) is divided equally among all PIs and co-PIs. A university total is the sum of the resulting shares for matched current CSRankings faculty. It is therefore a matched-faculty statistic, not the university’s complete NSF portfolio.

For confirmed transferred awards, the page distinguishes the amount transferred to the new institution from NSF's estimated full award value. It does not infer a transfer merely because estimated funding exceeds current obligations. For collaborative projects, the synchronizer also finds exact-title sibling awards and reports their combined project total while keeping each university's local attribution unchanged. Transfer records for the same lead investigator are counted once in that combined total.

Institution names are matched the same careful way: NSF files awards under legal or informal names, so those are normalized, an alias list covers names that cannot be derived, and each awardee is assigned to the most specific matching institution so a flagship never absorbs a branch campus's awards.

CSRankings spells some faculty differently in its roster file than in its publication table, so the synchronizer records both spellings and `public/nsf-name-crosswalk.csv` lists every name that needed resolving. Corrections to that file are welcome.

The current beta covers the US institutions in the CSRankings roster. The synchronized file records coverage totals so incomplete runs are visible rather than silently treated as complete data.

## Data limitations

- Historical affiliations are assembled from automated sources and manual corrections; coverage is uneven.
- Current-roster mode assigns past work to current institutions and therefore should not be interpreted as a historical department ranking.
- Publication and author records can change when CSRankings or DBLP updates.
- Conference names and eligibility rules can change over time.
- The collaboration statistic is a coauthor-intensity proxy, not a measurement of cross-institution collaboration.
- NSF investigator matching can miss name variants. The beta deliberately excludes awards made to another institution, even when they may belong to the same faculty member’s earlier career.
- NSF dollar totals use the estimated total award amount recorded on each award and group it by award year; they are intended project totals, not annual expenditures or fiscal-year obligations.
- A passing Data Health audit means the current calculation is internally consistent with the loaded inputs. It does not guarantee that a separately deployed CSRankings page uses identical data at that moment.

## Privacy

CS Picks fetches public scholarly metadata on demand. It does not store names entered into Search or the simulator as user-submitted personal data.

## Corrections and issues

To report an affiliation correction, [open a GitHub issue](https://github.com/dynaroars/cspicks/issues) with the professor’s name, correct institution, supporting source, and applicable years. Other bugs and data discrepancies can be reported in the same repository.

## Acknowledgments

CS Picks is inspired by [CSRankings](https://csrankings.org/) and uses its public taxonomy and publication data. Historical affiliation estimates use data from [OpenAlex](https://openalex.org/) plus manually reviewed corrections.
