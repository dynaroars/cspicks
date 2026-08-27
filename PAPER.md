# CS Picks Paper, Research, and Experiment Plan

## 1. Research vision

CSPicks should help prospective students, faculty, and researchers understand the structure of computer-science research rather than merely produce another league table. The central research question is:

> Can an interactive, transparent, and uncertainty-aware system help people form better calibrated judgments about universities, faculty, and research communities than a conventional ranking table?

The project can contribute in three ways:

1. **System contribution:** an open exploratory interface integrating institution, faculty, venue, historical-affiliation, and DBLP information.
2. **Empirical contribution:** large-scale findings about ranking stability, departmental breadth, concentration, mobility, collaboration, and methodological sensitivity.
3. **Human-centered contribution:** evidence about how explanations, counterfactuals, and uncertainty affect users' understanding and trust.

The goal is not to establish a single “correct” ranking. A more interesting contribution is showing when rankings are stable, when they are fragile, and which methodological assumptions materially change the conclusions.

## 2. Research principles

- Treat rankings as descriptive summaries, not measurements of institutional or individual quality.
- Keep fractional publication credit mandatory for production rankings, but permit alternative credit systems in clearly labeled research experiments.
- Distinguish exploratory findings from preregistered confirmatory tests.
- Report effect sizes, confidence intervals, uncertainty, and sensitivity—not only p-values.
- Correct for multiple comparisons when searching across many institutions, areas, and years.
- Avoid causal language for observational findings unless the design supports it.
- Never infer protected characteristics from names, photographs, or profiles.
- Do not create individual “hire,” “fire,” tenure, promotion, or advisor-quality scores.
- Separate factual records from simulations and display provenance for both.
- Red-team features that could enable harassment, gaming, or consequential personnel decisions.

## 3. Existing platform capabilities

CSPicks already provides a useful experimental foundation:

- University, faculty, research-area, conference, and DBLP search.
- Region, year, conference-set, rankings, and historical-affiliation filters, remembered across pages.
- Fractional-credit rankings compatible with CSRankings methodology, including a venue-set fidelity rule that counts only venues CSRankings itself assigns to an area.
- University and researcher comparison through an `A vs B` query, with a head-to-head table and per-area margins.
- Faculty movement/removal/addition simulation.
- Rank movement, momentum, breadth, faculty concentration, median productivity, team-size proxies, and area growth measured against the field.
- Peer discovery by area profile at other universities, and coauthor lookup from DBLP.
- NSF award attribution for matched current faculty, with fractional PI/co-PI shares.
- A nationwide NSF funding explorer with award-year trends, program search,
  institution/faculty comparisons, and a visible data-health audit.
- A maintained conference schedule with research-area search, shared venue
  sets, current/upcoming-year filtering, multiple submission cycles, and
  official source links.
- A curated CS research awards, fellowships, and opportunities explorer with
  audience, sponsor, topic, deadline, and sort filters, plus reviewed
  submission/correction forms.
- Rank-gap explanations, data-health diagnostics, and shareable views.
- URL-preserved state and Copy Link controls across search, comparisons,
  Discoveries, the simulator, funding, grants, and conference views.

These features should be instrumented and validated before expanding the product substantially.

## 4. Core hypotheses and experiments

### H1 — Ranking tables create false confidence

**Hypothesis:** Users shown a conventional ordered ranking will report greater confidence than users shown uncertainty and sensitivity information, even when the underlying rank is unstable.

**Feature:** “Rank stability” panel showing rank ranges under plausible choices of year window, venue set, and attribution mode.

**Experiment:**

- Randomly assign participants to:
  1. plain ranking,
  2. ranking with methodology explanation,
  3. ranking with uncertainty and sensitivity visualization.
- Give all groups institution-comparison tasks containing both stable and unstable cases.
- Ask for the preferred institution, confidence, perceived difference, and explanation.
- Reveal held-out methodological variants after the decision.

**Primary outcomes:** calibration error, decision reversals, confidence, task accuracy, and time.

**Prediction:** Explanations alone may increase confidence without improving calibration; uncertainty visualization should reduce overconfidence and inappropriate certainty.

### H2 — Apparent institutional strength is often concentrated in very few faculty

**Hypothesis:** A substantial fraction of highly ranked departments derive a disproportionate share of fractional publication credit from three or fewer faculty members.

**Feature:** Department concentration profile with top-1, top-3, top-5 shares, Lorenz curve, and effective number of contributors.

**Experiment:**

- Compute concentration by institution, area, region, and time window.
- Compare overall rank with concentration-adjusted rank.
- Bootstrap faculty contributions to estimate confidence intervals.
- Repeat using historical affiliation to avoid crediting old work to current departments.

**Primary outcomes:** distribution of top-3 share, Gini coefficient, effective contributor count, and rank changes after concentration adjustment.

**Potential controversial finding:** Some highly ranked departments may have broad reputations but narrow current research capacity.

### H3 — Rankings are fragile to a small number of faculty movements

**Hypothesis:** Many rank differences can be reversed by moving one or two high-output faculty members, especially in departments with concentrated portfolios.

**Feature:** “Department fragility” stress test that removes or transfers faculty one at a time and reports the smallest change needed to alter rank bands.

**Experiment:**

- For each institution, simulate removal of each active faculty member independently.
- Simulate plausible transfers within the same region and research area.
- Calculate the minimum number of changes required to move out of the top 10, 25, or 50.
- Relate fragility to concentration, faculty count, and breadth.

**Primary outcomes:** rank elasticity, minimum disruptive set, median rank loss, and area-level vulnerability.

**Safeguard:** Publish aggregated institutional results. Do not label named faculty as expendable, dangerous, or responsible for institutional decline.

### H4 — Current-affiliation rankings substantially rewrite historical institutional output

**Hypothesis:** Assigning all prior work to a faculty member's current institution systematically benefits institutions that recruit established faculty and disadvantages institutions they left.

**Feature:** “Where was this work done?” view comparing current and publication-time affiliation.

**Experiment:**

- Compute rankings under current and historical attribution for identical windows.
- Measure rank changes, credit transfers, and net import/export of research credit.
- Stratify by institution rank, geography, area, and career stage when reliable.
- Manually audit a stratified sample of affiliation histories.

**Primary outcomes:** transferred fractional credit, rank displacement, credit import ratio, and historical-data error rate.

**Potential controversial finding:** Some institutions' apparent historical strength may primarily reflect later hiring rather than locally produced work.

### H5 — Venue definitions materially determine who “wins”

**Hypothesis:** Institution and area rankings change meaningfully when reasonable venue definitions change, even when the same publication-credit formula is used.

**Feature:** Venue sensitivity matrix comparing CSRankings Default, CSRankings All, CORE A*, CORE A*/A, and carefully documented custom sets.

**Experiment:**

- Calculate rank correlations and top-k overlap across venue sets.
- Identify institutions and fields most sensitive to inclusion choices.
- Use leave-one-venue-out analysis to estimate each venue's leverage.
- Ask domain experts to rate whether resulting changes match their expectations.

**Primary outcomes:** Kendall's tau, top-k Jaccard overlap, median absolute rank change, and venue leverage.

**Potential controversial finding:** Some “institutional” rankings may actually be rankings of venue-selection preferences.

### H6 — Fractional credit changes incentives and conclusions

**Hypothesis:** Raw paper counts disproportionately benefit subfields and institutions with larger author teams, while fractional credit reduces—but does not eliminate—field-specific collaboration effects.

**Feature:** Research-only “credit lens” showing results under fractional, raw, square-root, and capped-team-size credit. Production ranking remains fractional.

**Experiment:**

- Compare institutions and fields under multiple credit functions.
- Estimate implied team-size distributions from raw-to-fractional ratios.
- Test whether rank shifts correlate with field, institution, or time.
- Validate the proxy against a DBLP paper-level sample where coauthor lists are available.

**Primary outcomes:** rank change, field-level team-size proxy, and cross-method stability.

**Potential controversial finding:** A single credit rule may encode systematic advantages for particular research cultures.

### H7 — “Rising department” claims are often artifacts of window choice

**Hypothesis:** Momentum labels based on one time window frequently disappear or reverse under adjacent reasonable windows.

**Feature:** Momentum robustness view with multiple rolling windows and change-point detection.

**Experiment:**

- Calculate growth using 3-, 5-, and 10-year windows.
- Shift each window by one year and measure sign stability.
- Bootstrap publication years and contributions.
- Compare simple percentage growth with rank movement and change-point models.

**Primary outcomes:** direction stability, confidence interval, false “rising” rate, and persistence.

**Rule:** Do not display “rising” unless direction is stable across preregistered windows.

### H8 — Breadth provides information not captured by overall rank

**Hypothesis:** Prospective students value sustained strength in their areas of interest more than a university's overall rank.

**Feature:** Personalized “research fit” explorer where users select multiple areas and minimum breadth requirements.

**Experiment:**

- Compare recommendations from overall rank, selected-area rank, and sustained-breadth score.
- Ask prospective graduate students to complete realistic program-discovery tasks.
- Measure whether users discover relevant institutions outside the conventional top tier.
- Follow up later, where feasible, to compare saved institutions with application lists.

**Primary outcomes:** relevant-institution recall, diversity of considered schools, decision confidence, and perceived usefulness.

**Safeguard:** Call this “research fit,” not admission probability or student–advisor compatibility.

### H9 — Explanations can persuade users even when they are unfaithful

**Hypothesis:** Attractive rank explanations increase trust even when the explanation omits influential methodological assumptions.

**Feature:** Explanation audit mode displaying contribution decomposition, omitted assumptions, and counterfactual checks.

**Experiment:**

- Randomize participants among no explanation, polished incomplete explanation, and faithful explanation with caveats.
- Include deliberately unstable examples.
- Measure trust, factual understanding, error detection, and willingness to use the result consequentially.

**Primary outcomes:** calibrated trust, comprehension, and unsupported inference rate.

**Prediction:** Polished incomplete explanations may be more persuasive than faithful ones, demonstrating that explainability is not equivalent to transparency.

### H10 — Users misuse hypothetical simulations despite warnings

**Hypothesis:** Some users interpret faculty-transfer simulations as hiring recommendations even when the interface labels them hypothetical.

**Feature:** Simulator framing variants: minimal warning, contextual warning, friction prompt, and required uncertainty acknowledgment.

**Experiment:**

- Present identical simulations under randomized warning designs.
- Ask users what conclusions are justified.
- Measure inappropriate personnel inference, warning recall, and task abandonment.
- Conduct qualitative interviews about intended uses and perceived legitimacy.

**Primary outcomes:** misuse rate, comprehension, warning recall, and usability cost.

**Deployment criterion:** Do not ship a framing variant unless it reduces consequential misuse without making normal exploration impractical.

### H11 — Data errors are not evenly distributed

**Hypothesis:** Missing profiles, name ambiguity, incomplete historical affiliations, and venue-normalization failures disproportionately affect particular regions, institutions, or naming conventions.

**Feature:** Public data-quality dashboard with coverage, ambiguity, freshness, and correction status.

**Experiment:**

- Draw stratified audit samples across regions, institution ranks, and name-ambiguity levels.
- Manually compare records with institutional pages and DBLP profiles.
- Model error probability without inferring demographic attributes.
- Track correction latency and downstream rank effects.

**Primary outcomes:** precision, recall, missingness, identity error rate, and rank sensitivity to corrections.

**Potential controversial finding:** Ranking error may be systematically larger for institutions already underrepresented in global ranking systems.

### H12 — Rankings encourage strategic behavior

**Hypothesis:** Transparent ranking mechanics allow users to identify low-cost methodological or reporting changes that improve rank without corresponding improvements in research capacity.

**Feature:** “What would change this rank?” optimizer restricted to aggregate, non-personnel scenarios.

**Experiment:**

- Find minimal additions of fractional credit across areas needed to cross rank thresholds.
- Compare breadth-building strategies with concentration in already strong areas.
- Identify discontinuities introduced by rounding, venue selection, or ranking ties.
- Red-team whether institutions could game inclusion or affiliation records.

**Primary outcomes:** minimum synthetic credit required, most leverageable area, and prevalence of discontinuities.

**Safeguard:** Disclose systemic vulnerabilities responsibly; do not provide instructions for falsifying affiliations or publication records.

## 5. Provocative feature laboratory

These ideas are intentionally controversial. They should begin as offline analyses or restricted prototypes, not production defaults.

### 5.1 Rank Roulette

Randomly sample plausible methodological choices and show the resulting distribution of ranks rather than one number.

**Hypothesis:** Users will view rank differences of a few places as less meaningful after seeing the distribution.

### 5.2 Prestige Tax

Compare observed rankings with versions that normalize by faculty size, field-specific team size, or prior institutional rank.

**Hypothesis:** Conventional ranking methods compound existing prestige and department-size advantages.

**Warning:** “Prestige-adjusted quality” would be an unjustified label. Present this only as a sensitivity analysis.

### 5.3 Department Bus Factor

Report how many faculty must be removed before an institution loses a chosen fraction of output or leaves a rank band.

**Hypothesis:** Bus factor will explain ranking volatility better than faculty count alone.

### 5.4 Credit Migration Map

Visualize where historically produced publication credit moves when faculty change institutions.

**Hypothesis:** Net credit flows will be concentrated toward a small group of already highly ranked institutions.

### 5.5 Ranking Doppelgängers

Find institutions with similar area profiles but very different overall ranks, geographic locations, or reputations.

**Hypothesis:** Profile similarity will help students discover relevant departments they would otherwise overlook.

### 5.6 Counterfactual Venue Politics

Show which institutions benefit most from adding or removing a venue and which field communities gain representation.

**Hypothesis:** Venue-selection debates have predictable institutional winners and losers.

### 5.7 “Famous Faculty Removed” Aggregate Test

Measure the effect of removing the top contributor from every institution without identifying individuals in published results.

**Hypothesis:** Reputation and current breadth will diverge sharply for a nontrivial set of departments.

### 5.8 Minimal Evidence Challenge

Ask: what is the smallest plausible data correction that changes a published rank or comparison conclusion?

**Hypothesis:** Many close rankings are less robust than their ordered presentation suggests.

## 6. User-study program

### Study A — Baseline usability and task performance

**Participants:** prospective graduate students, current graduate students, and faculty.

**Design:** within-subject comparison of CSRankings and CSPicks, counterbalanced by task order.

**Tasks:**

- Find institutions active in two specified areas.
- Identify faculty relevant to a research topic.
- Explain why two institutions have different ranks.
- Determine whether the conclusion changes under another year window.
- Identify data limitations that should affect the decision.

**Measures:** correctness, completion time, NASA-TLX or a lighter workload measure, confidence, recall, and qualitative reasoning.

**Hypothesis:** CSPicks improves complex exploratory-task accuracy but may initially increase completion time because it exposes more information.

### Study B — Trust and calibration

**Design:** between-subject experiment using plain ranks, explanations, and uncertainty-aware explanations.

**Measures:** trust, calibration, sensitivity awareness, and willingness to use results in consequential decisions.

### Study C — Student program discovery

**Design:** field study during graduate-application planning.

**Measures:** institutions discovered, list diversity, area fit, changes to application consideration, and interviews about decision process.

**Do not measure:** admissions success as a direct quality outcome without accounting for extensive confounding.

### Study D — Faculty and administrator red team

Ask faculty, department chairs, bibliometrics researchers, and research-integrity experts to find misleading outputs, gaming opportunities, dangerous interpretations, and missing caveats.

### Study E — Longitudinal deployment

With consent, collect privacy-preserving aggregate interaction events: filters used, views opened, uncertainty panels consulted, exports, and corrections initiated. Avoid storing raw search strings unless essential and explicitly consented to.

## 7. Observational analysis package

A paper could include several preregistered analyses:

1. Rank stability across windows and venue sets.
2. Current versus historical affiliation displacement.
3. Concentration and department fragility.
4. Sustained breadth versus overall rank.
5. Field-level effects of fractional credit.
6. Geographic and institutional variation in data completeness.
7. Momentum robustness and false “rising department” labels.
8. Minimal methodological change needed to reverse pairwise comparisons.

The paper should distinguish analyses hypothesized in advance from patterns discovered after looking at the results.

## 8. Statistical design

- Define the institution population and minimum-data threshold before analysis.
- Use equal-length comparison periods for momentum and rank movement.
- Report rank correlations with bootstrap confidence intervals.
- Use top-k overlap in addition to correlation; high global correlation can hide important top-k changes.
- Use multilevel models when observations repeat across institution, area, and year.
- Cluster uncertainty by institution or faculty where appropriate.
- Use permutation tests for rank differences when normality assumptions are unreasonable.
- Control false discovery rate for exploratory institution-level findings.
- Conduct sensitivity analyses for missing affiliations and identity errors.
- For user studies, run a pilot, estimate effect sizes, and perform power analysis before the confirmatory study.
- Publish analysis code and frozen input versions needed for reproduction, subject to upstream licensing.

## 9. Data and validity threats

### Construct validity

- Publication output is not equivalent to research quality, teaching quality, advising quality, culture, resources, or student outcomes.
- Venue lists encode community judgments and omissions.
- Fractional credit is principled but not uniquely correct.

### Internal validity

- Faculty movement, missing affiliations, and name disambiguation can create false changes.
- Current-year data may be incomplete.
- DBLP and OpenAlex update at different times.

### External validity

- Results about computer science may not generalize to journal-centered fields.
- Users recruited from one institution may not represent international applicants or faculty.

### Ethical validity

- A technically accurate statistic can still invite an unjustified or harmful interpretation.
- Individual counterfactuals are especially vulnerable to misuse in hiring and evaluation.

## 10. Recommended first paper

### Working title

**Beyond a Single Rank: Transparent and Sensitivity-Aware Exploration of Computer Science Research Institutions**

### Candidate contribution package

1. CSPicks as an open interactive research-exploration system.
2. A methodology for explaining rank contributions and uncertainty.
3. A large-scale study of ranking stability, concentration, historical attribution, and venue sensitivity.
4. A controlled user study comparing conventional rankings with transparent and uncertainty-aware exploration.
5. Design recommendations for responsible academic ranking interfaces.

### Minimum publishable evaluation

- Verified parity and data-quality audit.
- At least three preregistered observational hypotheses.
- A controlled study with realistic discovery and interpretation tasks.
- Qualitative interviews explaining why participants trusted or rejected results.
- Public artifact, frozen analysis scripts, and documented limitations.

## 11. Venue-oriented variants

### SIGCSE framing

Focus on prospective-student learning, research-area literacy, program discovery, and educational outcomes. Use the Experience Reports and Tools track or Computing Education Research track depending on study rigor.

### CHI framing

Focus on uncertainty communication, calibrated trust, interaction design, explanation faithfulness, and consequential-use safeguards. A strong user study is essential.

### CHIIR framing

Focus on exploratory search, information seeking, sensemaking, relevance, and comparison with existing scholarly-information interfaces.

### JCDL or ISSI framing

Focus on scholarly data integration, scientometric methodology, attribution, rank stability, data quality, and reproducibility.

### Recommended submission order

1. **CHIIR.** The closest fit and the least often considered. Exploratory search and sensemaking over scholarly data is its core subject, it accepts system-plus-study papers, and its expectations for study scale are lower than CHI's. The head-to-head comparison, the area and venue sensitivity views, and the rank-gap explanation are all directly on topic.
2. **JCDL.** The right venue if the data work leads: the CSRankings parity audit, venue-set fidelity, historical attribution from OpenAlex, and NSF award attribution. A scholarly-data-quality paper with a working artifact. Corrections already found while building the tool — venues upstream never assigns to an area, a region filter that matched nothing, roster name variants that broke funding attribution — make a concrete fidelity table.
3. **SIGCSE.** Experience Reports or Tools track, framed around the *PhD Demystify* audience: what applicants misread in rankings and what changes when the interface exposes sensitivity. The lowest evaluation bar of the four and the closest to the existing readership, with the book providing the deployment story.
4. **CHI.** Only with a genuine controlled study (Study B, trust and calibration). Without it a system paper will not clear the bar regardless of the system's quality.

The observational contributions in §7 are nearly free given what the platform already computes, so CHIIR or JCDL is the realistic first submission, with CHI following once Study B has run. SIGCSE can run in parallel with the applicant-facing framing, reusing the same system.

### Reproducibility gap to close first

The minimum publishable evaluation above assumes frozen analysis scripts and versioned datasets, and the repository currently has neither: CSRankings CSVs are fetched from GitHub at page load, so any number computed today cannot be reproduced tomorrow. Before submission:

- Freeze a dated snapshot of every upstream input (csrankings.csv, generated-author-info.csv, institutions.csv, country and alias files, the OpenAlex history, and the NSF award set).
- Add a script that regenerates every figure and table in the paper from that snapshot alone, with no network access.
- Record the upstream commit or fetch date beside each snapshot, and report it in the paper.

## 12. Implementation sequence

### Phase 1 — Measurement foundation

- Add versioned experiment datasets and reproducible analysis scripts.
- Add instrumentation with privacy controls.
- Add rank-distribution and sensitivity computation.
- Validate historical affiliation and DBLP matching on stratified samples.
- Define preregistered metrics and exclusions.

### Phase 2 — High-value user features

- Harden and evaluate the deployed rank stability panel.
- Harden and evaluate the deployed concentration and effective-contributor view.
- Harden and evaluate the deployed venue sensitivity matrix.
- Extend the deployed research-fit, conference-schedule, funding, and grants
  workflows with provenance and freshness checks.
- Add a faithful explanation and provenance panel where current inline notes are
  insufficient.

### Phase 3 — Research-only prototypes

- Department fragility stress test.
- Credit migration map.
- Rank Roulette.
- Credit-model laboratory.
- Minimal Evidence Challenge.

### Phase 4 — Studies

- Pilot usability study.
- Red-team workshop.
- Preregistered observational analysis.
- Powered trust/calibration experiment.
- Longitudinal field deployment if feasible.

## 13. Decision gates

A feature moves from research prototype to the public interface only if:

1. Its calculation is reproducible and adequately validated.
2. Its name does not imply a construct the data cannot measure.
3. Users can understand its uncertainty and provenance.
4. Red-team review finds no unmitigated high-risk misuse.
5. The feature adds information beyond a simpler statistic.
6. The interface does not encourage personnel evaluation or deterministic institutional judgments.

The most valuable final result may be evidence that certain attractive ranking features should **not** be deployed. Negative design findings are legitimate research contributions.
