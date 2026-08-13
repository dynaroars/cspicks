# CS Picks paper

LaTeX source for the CS Picks paper. Not targeted at a specific venue — plain
`article` class, so it can be reformatted for whichever venue it ends up at.

## Build

```bash
make          # -> main.pdf
make watch    # rebuild on save
make clean
```

Needs `pdflatex`, `latexmk`, and `bibtex`.

## Where the numbers come from

Every figure in the results section is produced by `scripts/paper-stats.mjs`,
which runs the shipping `src/data.js` and `src/metrics.js` modules against the
live CSRankings CSVs — the same code path the site itself uses, so the paper
cannot drift from the implementation.

```bash
node scripts/paper-stats.mjs   # -> paper/stats.json and paper/data/*.dat
```

`stats.json` is committed so the tables can be checked against a known run, and
so are the `paper/data/*.dat` series the figures plot. **The upstream data
changes**, so re-run this before submitting and reconcile the tables in
`main.tex` against the regenerated JSON. The tables that quote it:

| Table | Section | Key in `stats.json` |
|---|---|---|
| Dataset scale (incl. NSF snapshot) | Methods | `dataset`, `nsf` |
| Rank spread by stratum | Results | `stability` |
| Individual rank envelopes | Results | `stability.examples` |
| Venue-set agreement | Results | `venueSensitivity` |
| Top ten under each venue set | Results | `venueMovers.topTens` |
| \csr{} vs. CORE A* venue composition | Results | `venueComposition.perArea` |
| Departments moved most by venue set | Results | `venueMovers` |
| Output concentration | Results | `concentration` |
| The two orderings side by side | Results | `perCapita.sideBySide` |
| Biggest per-faculty gains | Results | `perCapita.biggestGains` |
| Departures to leave a rank band | Results | `fragility` |
| Researcher distribution | Results | `researchers` |
| Most prolific / widest researchers | Results | `researchers.top`, `.broadest` |
| Leading researcher per subfield | Results | `researchers.areaLeaders` |
| Subfield scale and growth | Results | `fields.rows` |
| Subfield leadership changes | Results | `fields.leadershipChanges` |
| Subfield head-to-head | Results | `fields.headToHead` |
| Department and researcher head-to-heads | Results | `comparisons` |
| NSF-funded departments and investigators | Results | `nsf.topSchools`, `.topFaculty` |
| Funding vs. publication divergence | Results | `nsf.fundingAhead`, `.publicationsAhead` |

The four figures are drawn by `pgfplots` straight from `paper/data/`, so no
figure quotes a number the pipeline did not produce:

| Figure | Data file |
|---|---|
| Rank-spread distribution and spread vs. baseline rank | `spread-cdf.dat`, `spread-by-rank.dat` |
| \csr{} rank vs. per-faculty rank | `percapita-scatter.dat` |
| Adjusted output by subfield | `field-totals.dat` |
| Publication rank vs. NSF funding rank | `funding-scatter.dat` |

Label columns in those files are LaTeX-escaped at generation time (an
unescaped `&` in a tick label is an alignment tab and kills the build).

The NSF blocks read `public/nsf-awards.json` from the working tree rather than
the network, so run `npm run sync:nsf:names` first if the roster has moved on
(see "Routine Maintenance" in the repo README).

## arXiv

arXiv does not compile Typst; it accepts LaTeX source or a pre-built PDF
(submitting a Typst-built PDF means a "PDF only" listing with no source
available to readers). This paper is LaTeX so the source can be posted.

## Related

`PAPER.md` at the repo root holds the broader research plan and hypotheses
(H1–H6). This paper covers H1 (rank stability), H2 (concentration, including the
per-faculty ordering), H3 (fragility), and H5 (venue sensitivity); H4
(historical attribution) and H6 (alternative credit models) are future work.
