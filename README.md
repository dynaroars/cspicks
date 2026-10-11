# CS Picks

Companion to [PhD Demystify](https://github.com/dynaroars/phd-cs-us): tools for CS PhD applicants and early-career
researchers. Live at **[cspicks.roars.dev](https://cspicks.roars.dev)**.

- **Search & Discoveries**: CS professors, universities, and research areas (CSRankings data), `A vs B` comparisons, optional historical affiliations, and data-driven insights.
- **Simulator**: see how adding, moving, or removing faculty changes rankings.
- **NSF Funding**: NSF awards for CSRankings faculty.
- **CS Confs**: conference dates and submission deadlines.
- **Awards & Grants**: fellowships, research awards, and funding calls.
- **US Jobs**: academic CS openings at US universities.

Every view is a shareable URL. No backend: data comes from public sources and static JSON in `public/`.

## Develop

```bash
npm ci
npm run dev      # http://localhost:5173/
npm test && npm run test:e2e && npm run build
```

Data refresh workflows are in [MAINTENANCE.md](MAINTENANCE.md). Architecture notes are in [AGENTS.md](AGENTS.md).
Analytics: `src/analytics.ts` does nothing until you enable a provider (e.g. uncomment the Plausible tag in each page's `<head>`).

## Data

[CSRankings](https://csrankings.org/) (faculty, publications, rankings), [DBLP](https://dblp.org/),
[OpenAlex](https://openalex.org/) (historical affiliations), [NSF Award Search](https://www.nsf.gov/funding/award-search),
plus curated conference, grant, and job data checked against official pages. Rankings follow CSRankings'
geometric-mean method. All results are estimates; confirm details on the official sources. Report corrections via
[GitHub issues](https://github.com/dynaroars/cspicks/issues) or the submit forms on each page.

## License

Code is [MIT](LICENSE). Third-party data keeps its own terms: follow the CSRankings license; DBLP and OpenAlex are CC0; NSF records are public government data.
