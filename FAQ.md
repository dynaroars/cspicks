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
- [DBLP](https://dblp.org/) supplies author-search and publication metadata used by the simulator.
- [OpenAlex](https://openalex.org/) and manually reviewed corrections supply estimated historical affiliations.

## Features and filters

### What is History mode?

By default, every eligible paper is credited to its author’s current CSRankings institution. History mode instead attempts to credit a paper to the institution where the author was affiliated in the publication year.

Historical affiliation records are estimates. They can be incomplete or incorrect, especially for older years, visiting positions, and institutions that changed names.

### What do the conference-set options mean?

- **CSRankings (Default)** uses the primary CSRankings venue set and excludes its optional next-tier venues.
- **CSRankings (All)** includes both the primary and extended CSRankings venues, including venues such as ASE, ISSTA, ICDE, PODS, HPCA, NDSS, EuroSys, Eurographics, FAST, USENIX ATC, ICFP, OOPSLA, and KDD.
- **CORE A\*** includes only conferences mapped to the CORE A* tier.
- **CORE A\*/A** includes conferences mapped to either the CORE A* or A tier.

Conference definitions can change upstream. CS Picks synchronizes its venue rules from CSRankings when possible and keeps a bundled fallback.

### How does the ranking simulator work?

Choose a target university and one or more researchers. Current faculty are modeled as removals, faculty at another ranked university as transfers, and external DBLP researchers as additions. The simulator applies their eligible publication records to the selected period and conference set, then recalculates overall and per-area ranks.

The simulator is exploratory. Its results are hypothetical and should not be interpreted as predictions, hiring recommendations, or evaluations of individuals.

## Data limitations

- Historical affiliations are assembled from automated sources and manual corrections; coverage is uneven.
- Current-roster mode assigns past work to current institutions and therefore should not be interpreted as a historical department ranking.
- Publication and author records can change when CSRankings or DBLP updates.
- Conference names and eligibility rules can change over time.
- The collaboration statistic is a coauthor-intensity proxy, not a measurement of cross-institution collaboration.
- A passing Data Health audit means the current calculation is internally consistent with the loaded inputs. It does not guarantee that a separately deployed CSRankings page uses identical data at that moment.

## Privacy

CS Picks fetches public scholarly metadata on demand. It does not store names entered into Search or the simulator as user-submitted personal data.

## Corrections and issues

To report an affiliation correction, [open a GitHub issue](https://github.com/dynaroars/cspicks/issues) with the professor’s name, correct institution, supporting source, and applicable years. Other bugs and data discrepancies can be reported in the same repository.

## Acknowledgments

CS Picks is inspired by [CSRankings](https://csrankings.org/) and uses its public taxonomy and publication data. Historical affiliation estimates use data from [OpenAlex](https://openalex.org/) plus manually reviewed corrections.
