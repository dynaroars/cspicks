# CS Picks

**CS Picks** is a JavaScript application for exploring computer science professors, universities, publication patterns, and NSF funding. It accompanies the [PhD Demystify](https://github.com/dynaroars/phd-cs-us) book for prospective PhD students. CS Picks uses CSRankings and DBLP for ranking-compatible publication counts, OpenAlex plus manual corrections for estimated historical affiliations, and the official NSF Award Search for its funding beta.

## 🚀 Features

### 1. Professor Search
- **Search by Name**: Instantly find professors by name.
- **Publication Stats**: View a breakdown of publication counts by research area, sorted by volume.
- **Activity Graph**: Visual timeline of publications per year.
- **Direct Links**: Quick access to the professor's:
    - **Homepage**
    - **Google Scholar Profile**
    - **DBLP Profile**
    
### 2. School Search
- **Search by Name**: Find universities by name.
- **Area Analysis**: View the school's top research areas with per-area rankings.
- **Faculty Count**: See total faculty contributing to each school.
- **Further Analysis**: Explore publication trends, area growth, conference trends, faculty diversity, publishing effort, and other profile highlights.

### 3. Historical Mode
- **Toggle Historical Affiliations**: When enabled, publications are credited to the institution where the author was affiliated at the time of publication (via OpenAlex data).

### 4. Ranking Simulator
- **What-if Analysis**: Model adding, transferring, or removing faculty and inspect the resulting overall and per-area rank changes.
- **CSRankings and DBLP**: Use existing CSRankings faculty or look up external researchers through DBLP.

### 5. Head-to-Head Comparison
- **`vs` Search**: Type `A vs B` in the main search box (e.g. `CMU vs MIT`) to compare two universities or two professors side by side across all research areas.
- **Rank-Gap Breakdown**: For universities, see the area-level log-score differences behind the overall rank gap.

### 6. Area & Conference Search
- **Search by Area Name**: Find universities and professors in a research area.
- **Search by Conference**: Find contributors to specific venues (e.g., PLDI, NeurIPS).

### 7. Manual Affiliation Overrides
- **Community Corrections**: Add corrections to `public/manual_affiliations.csv` to fix incorrect OpenAlex data.

### 8. NSF Funding Beta
- **Nationwide Search**: Explore institution-verified NSF awards for faculty at US universities in the current CSRankings roster.
- **Fractional Funding Attribution**: Divide NSF's estimated total award amount equally among every listed PI and co-PI, then aggregate matched faculty shares to universities.
- **Funding Trends**: Inspect award-year activity, programs, active awards, and individual award details.
- **Conservative Matching**: Retain an award only when its NSF recipient matches the faculty member's current CSRankings institution.

## 🛠️ Technologies Used

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Build Tool**: [Vite](https://vitejs.dev/).
- **Charts**: [Chart.js](https://www.chartjs.org/).
- **CSV Parsing**: [PapaParse](https://www.papaparse.com/).
- **HTML Encoding**: [he](https://github.com/mathiasbynens/he).

## 📦 Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/dynaroars/cspicks.git
    cd cspicks
    ```

2.  **Install Dependencies**
    ```bash
    npm ci
    ```

3.  **Run Development Server**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173/cspicks/`.

4.  **Run Tests and Build**
    ```bash
    npm test
    npm run test:e2e
    npm run build
    ```

5.  **Deploy to GitHub Pages**
    ```bash
    npm run deploy
    ```

## 🔁 Routine Maintenance

Two upstream sources move at very different speeds, so refreshing them is two different jobs.

| How often | Command | Cost | What it does |
| --- | --- | --- | --- |
| **Monthly, or after any CSRankings roster update** | `npm run sync:nsf:names` | 2 CSV downloads, seconds | Re-resolves NSF investigators to the name CSRankings' publication table uses, and rewrites `public/nsf-name-crosswalk.csv` |
| Quarterly, or when award data looks stale | `npm run sync:nsf:all` | Thousands of NSF API queries, hours | Re-queries the NSF Award Search API for every faculty/institution pair |

**Run `npm run sync:nsf:names` regularly.** CSRankings spells some faculty differently in `csrankings.csv` than in `generated-author-info.csv`, and the site matches on the latter. Without this refresh, faculty hired or renamed since the last award sync silently show no funding. It needs no NSF API access, so it is safe to run any time — commit the resulting `public/nsf-awards.json` and `public/nsf-name-crosswalk.csv`.

The crosswalk is meant to be read: each row records a name that needed resolving. Correcting a wrong row by hand is a legitimate fix.

```bash
npm run sync:nsf:names   # then review the diff in public/nsf-name-crosswalk.csv
npm test && npm run build
```

## 💰 Refreshing NSF Funding Data

The browser does not query NSF directly. NSF rejects browser-origin requests, and live per-user requests would make results dependent on API availability and unstable name matching. Instead, the funding page lazily loads a synchronized static dataset only when someone opens `funding.html`.

To synchronize all US institutions in the current CSRankings roster:

```bash
npm run sync:nsf:all
```

The synchronizer:

- queries the official NSF Award Search API for each unique faculty/institution pair;
- accepts awards only when the NSF recipient matches the current CSRankings institution;
- retains all listed PIs and co-PIs for fractional attribution;
- finds exact-title sibling awards for collaborative projects and deduplicates institution-transfer records;
- checkpoints progress in the ignored `.nsf-sync-cache.json` file;
- resumes incomplete runs without repeating completed queries.

To force a targeted faculty refresh while diagnosing a name variant:

```bash
npm run sync:nsf:all -- --faculty "Hoang-Dung Tran"
```
- writes the deployable dataset to `public/nsf-awards.json`, including explicit coverage totals.

To build a deliberately scoped dataset for one institution instead:

```bash
npm run sync:nsf -- --school "George Mason University"
```

Run the nationwide command again before deployment when you want to refresh NSF data. `npm run deploy` does not contact NSF automatically.

### Funding interpretation

An award's estimated total amount (its intended amount) is divided equally among every listed PI and co-PI. University totals sum the shares assigned to matched current CSRankings faculty. These are matched-faculty statistics—not complete university NSF portfolios, annual expenditures, fiscal-year obligation totals, or measures of research quality.

Awards made to a professor's former institution are intentionally excluded. Name variants, missing co-PIs, transfers, supplements, and NSF data changes can still cause omissions.

## 📂 Project Structure

```
cspicks/
├── public/
│   ├── professor_history_openalex.json  # Historical affiliations
│   ├── nsf-awards.json                  # Synchronized US NSF funding data
│   ├── nsf-name-crosswalk.csv           # Roster vs publication-table name resolutions
│   ├── school-aliases.json              # OpenAlex → CSRankings name mapping
│   └── manual_affiliations.csv          # Community corrections
├── src/
│   ├── data.js                       # Data loading, filtering, ranking pipeline
│   ├── filters.js                    # Shared region/year/venue/history filter bar
│   ├── charts.js                     # Chart.js defaults, redraw, and theme handling
│   ├── main.js                       # Search page controller
│   ├── search-results.js             # Search result sections
│   ├── search-suggestions.js         # Search autocomplete
│   ├── comparison.js                 # `A vs B` head-to-head mode
│   ├── simulator.js                  # Simulator page UI and orchestration
│   ├── simulation.js                 # Pure matching and rank-impact logic
│   ├── compare-view.js               # Comparison chart and summary rendering
│   ├── analysis.js                   # Integrated analysis and data-health logic
│   ├── funding.js                    # NSF funding search page
│   ├── nsf.js                        # Funding attribution and rendering
│   └── style.css                     # CSS styles
├── scripts/
│   ├── build-openalex-history.js     # Generates historical affiliations
│   ├── sync-nsf-awards.mjs           # Resumable scoped/all-US NSF synchronization
│   ├── sync-nsf-roster-names.mjs     # Re-resolves NSF names against the CSRankings roster
│   └── build-school-aliases.js       # Generates school-aliases.json
├── index.html                        # Search, results, and integrated analysis
├── funding.html                      # Nationwide NSF funding beta
├── simulator.html                    # Ranking simulator page
├── FAQ.md                            # GitHub-hosted methods and data documentation
└── README.md
```

## 📊 Data Sources

- [CSRankings](https://github.com/emeryberger/CSrankings) - Faculty and publication data
- [DBLP](https://dblp.org/) - Publication metadata and author profiles
- [OpenAlex](https://openalex.org/) - Historical affiliation data
- [NSF Award Search](https://www.nsf.gov/funding/award-search) - NSF awards, investigators, program managers, programs, dates, and intended amounts

## 📝 License
Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License.
