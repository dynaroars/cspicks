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
node scripts/paper-stats.mjs   # -> paper/stats.json
```

`stats.json` is committed so the tables can be checked against a known run.
**The upstream data changes**, so re-run this before submitting and reconcile
the tables in `main.tex` against the regenerated JSON. The tables that quote it:

| Table | Section | Key in `stats.json` |
|---|---|---|
| Dataset scale | Methods | `dataset` |
| Rank spread by stratum | Results | `stability` |
| Individual rank envelopes | Results | `stability.examples` |
| Venue-set agreement | Results | `venueSensitivity` |
| Output concentration | Results | `concentration` |
| Per-faculty ordering | Results | `perCapita` |
| Departures to leave a rank band | Results | `fragility` |

## arXiv

arXiv does not compile Typst; it accepts LaTeX source or a pre-built PDF
(submitting a Typst-built PDF means a "PDF only" listing with no source
available to readers). This paper is LaTeX so the source can be posted.

## Related

`PAPER.md` at the repo root holds the broader research plan and hypotheses
(H1–H6). This paper covers H1 (rank stability), H2 (concentration, including the
per-faculty ordering), H3 (fragility), and H5 (venue sensitivity); H4
(historical attribution) and H6 (alternative credit models) are future work.
