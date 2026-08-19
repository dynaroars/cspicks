# CS Picks

**CS Picks** helps prospective CS PhD applicants, current grad students, faculty, and department chairs find the right program and research advisor. It's a JavaScript application for exploring computer science professors, universities, research strengths, publication trends, and NSF funding, and it accompanies the [PhD Demystify](https://github.com/dynaroars/phd-cs-us) book for prospective PhD students. CS Picks uses CSRankings and DBLP for ranking-compatible publication counts, OpenAlex plus manual corrections for estimated historical affiliations, and the official NSF Award Search for its funding beta.

Live at **[cspicks.roars.dev](https://cspicks.roars.dev)**.

## 🚀 Features

### 1. Professor Search
- **Search by Name**: Instantly find professors by name.
- **Publication Stats**: View a breakdown of publication counts by research area, sorted by volume.
- **Activity Summary**: Consistency, momentum, and steadiness of a researcher's output over time.
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
- **Shareable setup**: the selected university and candidate names round-trip through the URL, so a link reproduces the same inputs one click away from a result.

### 5. Head-to-Head Comparison
- **`vs` Search**: Type `A vs B` in the main search box to compare two universities (`CMU vs MIT`), two professors, or two research areas (`AI vs Security`) side by side.
- **Rank-Gap Breakdown**: For universities, see the area-level log-score differences behind the overall rank gap.
- **Area vs. area**: growth versus the prior period, and who bridges both fields — the universities and researchers active in each.

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

### 9. Discoveries
- **On the Search page**: the "🔭 Discoveries" nav link (`index.html?view=discoveries`) opens the same search shell — header, filter bar, search box, examples — but its default landing state shows the Discoveries insight cards where the university/faculty lists would normally sit. Typing a real search still works exactly like Search and replaces the cards with actual results.
- **Notable, reproducible patterns**: fastest-growing/shrinking research areas and universities, departments rising or falling, funding trends, faculty mobility (who's new to a field), regional specializations, and more — every card is computed from the live data, never hand-picked.
- **University-level and subfield-level**: one set of cards asks "which universities moved," a second asks "which research areas themselves grew, shrank, or changed leaders" region-wide.
- **Stable, shareable per-card links**: every card has its own `#fragment` URL and a Copy Link button; opening that link scrolls to and highlights the exact card.

### 10. CS Conference Schedule
- **Conference and research-area search**: Find conference dates and submission timelines with the same autocomplete behavior as the rest of CS Picks.
- **Shared venue sets**: Switch among CSRankings and CORE conference sets using the same definitions as publication search.
- **Applicant-focused window**: The schedule opens to the current and following conference year and understands multiple or rolling submission cycles.
- **Self-contained data**: Conference schedules live under `csconfs/data/`, are maintained through agent-assisted research of official conference sites, and deploy with this project; no external checkout or runtime service is required.

## 🔗 URL architecture & sharing

Every page keeps the URL in sync with what's on screen, so any view is a link that reproduces itself — no login, no server-side state.

| Page | What's encoded |
| --- | --- |
| Search (`index.html`) | `q` (the search text, including `A vs B`), `target`/`targetType` (the selected analysis target), plus region/years/venue set/rankings/history/per-capita from the shared filter bar |
| Discoveries (`index.html?view=discoveries`) | `view=discoveries`, region/years/venue set/history/per-capita, plus a `#fragment` per card (`#discovery-fastest-growing-subfields`, etc.) that scrolls to and briefly highlights that card on load — or `q`/`target` once the visitor searches for something |
| Simulator (`simulator.html`) | Filters, `univ` (selected university), and `candidates` (the raw candidate names/DBLP links) — opening the link pre-fills the setup one click from a result, without re-querying DBLP on load |
| CS Confs (`csconfs.html`) | `q`, conference-year range, venue set, and whether only upcoming conferences are shown |
| Funding (`funding.html`) | `q` (search or `A vs B`) plus the year-range filter |

Filter choices also persist across page navigations via `localStorage`, so switching between Search and Discoveries, or clicking into Simulator or Funding, doesn't silently reset the region or year range.

Every page has an unobtrusive **Copy Link** button in the header (`src/share.js`): the Web Share API's native sheet where the browser offers one, a clipboard copy otherwise. Discoveries cards each get their own copy of the same control, scoped to that card's fragment. `src/seo.js` keeps `<title>`, the meta description, canonical link, and OpenGraph/Twitter tags in sync with the same state, so a shared link's title and social preview describe the actual view, not just the generic homepage.

## 📈 SEO & social previews

- Every page ships baseline `<title>`, meta description, canonical link, and OpenGraph/Twitter card tags in its HTML `<head>`, so a crawler that never runs JS still sees something accurate.
- `src/seo.js` sharpens those tags client-side once a specific view (a university, a comparison, a Discoveries filter set) is on screen.
- `public/og-image.png` is the site-wide social preview image, regenerated with `npm run og:image` (uses Playwright's already-installed Chromium to screenshot `scripts/og-card-template.html` — no new dependency). A true per-page dynamic OG image isn't possible on a static GitHub Pages deploy without a server, so this is the "best static alternative": one well-designed card, with per-page title/description still set dynamically in the tags above.
- `public/sitemap.xml` lists the six static pages plus one deep link per university straight into its Search-page research profile. Regenerate it after a meaningful CSRankings roster change with `npm run sitemap` (`scripts/generate-sitemap.mjs`).
- `public/robots.txt` allows all crawlers and points at the sitemap.

## 📊 Analytics

No analytics are wired to a real account by default — `src/analytics.js`'s calls are safe no-ops until one is configured, and nothing here can invent credentials for you. To enable lightweight, cookie-free tracking:

1. Sign up at [plausible.io](https://plausible.io) (or self-host it) and register `cspicks.roars.dev`.
2. Uncomment the `<script defer data-domain="cspicks.roars.dev" src="https://plausible.io/js/script.js">` tag near the bottom of each page's `<head>` (`index.html`, `simulator.html`, `funding.html`).
3. Deploy. Plausible's dashboard then answers: visits, popular pages (via its own pathname-based pageviews), and referral sources out of the box.

`src/analytics.js` additionally fires custom events — `View` (by page and kind: school/researcher/area/search-results), `Comparison`, and `Discovery Share`, each tagged with `page: 'search' | 'discoveries'` where relevant — at the same points the URL updates, so "popular university pages," "popular research fields," "comparison usage," and "Discoveries traffic" are answerable from Plausible's custom-event breakdowns even though those views share one static HTML file per page. Swap the calls in `analytics.js` for another tool's API (e.g. GoatCounter) if preferred; nothing else needs to change.

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
    The application will be available at `http://localhost:5173/`.

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
| After changing institution or name matching | `npm run sync:nsf:rebuild` | Local cache only, seconds | Rebuilds the dataset from `.nsf-sync-cache.json` with no API access |

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

NSF records awards under legal names (`Regents of the University of Michigan - Flint`), informal ones (`Georgia Tech Research Corporation`), and expansions of names CSRankings abbreviates (`Massachusetts Institute of Technology` vs `Massachusetts Inst. of Technology`). The synchronizer normalizes those forms, keeps an alias list for names it cannot derive, and assigns each awardee to the *most specific* matching institution so a flagship never claims its branch campus's awards.

To build a deliberately scoped dataset for one institution instead:

```bash
npm run sync:nsf -- --school "George Mason University"
```

Run the nationwide command again before deployment when you want to refresh NSF data. `npm run deploy` does not contact NSF automatically.

### Funding interpretation

An award's estimated total amount (its intended amount) is divided equally among every listed PI and co-PI. University totals sum the shares assigned to matched current CSRankings faculty. These are matched-faculty statistics—not complete university NSF portfolios, annual expenditures, fiscal-year obligation totals, or measures of research quality.

Awards made to a professor's former institution are intentionally excluded. Name variants, missing co-PIs, transfers, supplements, and NSF data changes can still cause omissions.

## 🌱 Growing CSPicks

### Adding a new Discovery

Discoveries must be reproducible from the same data every other page uses — never hardcoded or hand-picked. Adding one is usually two small pieces:

1. **Compute it.** Add a case to `calculateDiscoveryInsights` (university-level movement) or `calculateSubfieldDiscoveries` (region-wide, per research area) in `src/metrics.js`, or write a new pure function alongside them if the shape is genuinely different. Follow the existing pattern: compare a current period against the equal-length prior period via `buildPriorPeriodData`, apply a minimum-evidence guard (e.g. "both periods need an adjusted count of at least 2") so a tiny denominator can't dominate the list, and return a ranked, capped (`limit`, default 5) array.
2. **Render it.** In `src/discoveries.js`, call the shared `card(title, help, body, className)` helper with your new data. `card()` automatically slugifies the title into a stable `id` (`discovery-<slug>`), wires the ⓘ tooltip from `help`, and adds a Copy Link button scoped to that card — you get a shareable, self-documenting card for free. Use `schoolLink()`/`areaLink()` to link names back into Search.
3. **Add a unit test.** Every existing Discovery has a `test/data.test.js` case with a small synthetic fixture that asserts the ranking and thresholds; follow that pattern rather than relying only on live data. `test/e2e/core-flows.spec.js` covers the URL/share/hash-scroll mechanics generically, so a new card doesn't need its own e2e test unless it adds new interactive behavior.

Keep the `help` text honest about the methodology (thresholds, what counts as "prior period," what's excluded) — it's the only methodology note most readers will see, and it's what distinguishes a Discovery from an unsupported claim.

## 📂 Project Structure

```
cspicks/
├── public/
│   ├── professor_history_openalex.json  # Historical affiliations
│   ├── nsf-awards.json                  # Synchronized US NSF funding data
│   ├── nsf-name-crosswalk.csv           # Roster vs publication-table name resolutions
│   ├── school-aliases.json              # OpenAlex → CSRankings name mapping
│   ├── manual_affiliations.csv          # Community corrections
│   ├── og-image.png                     # Site-wide social preview image
│   ├── sitemap.xml                      # Static pages + one deep link per university
│   └── robots.txt
├── csconfs/                         # Conference-schedule page and synchronized data
│   ├── data/                        # Locally maintained conference schedules
│   ├── main.js                      # Search/filter/URL controller
│   ├── schedule-data.js             # Date, grouping, filtering, and sorting rules
│   └── schedule-render.js           # Native CS Picks schedule cards
├── src/
│   ├── data.js                       # Data loading, filtering, ranking pipeline
│   ├── metrics.js                    # School/researcher/subfield metrics and Discoveries insights
│   ├── filters.js                    # Shared region/year/venue/history filter bar
│   ├── charts.js                     # Chart.js defaults, redraw, and theme handling
│   ├── main.js                       # Search page controller (also drives the Discoveries view)
│   ├── search-results.js             # Search result sections
│   ├── search-cards.js               # Professor/school card rendering
│   ├── suggestion-box.js             # Shared autocomplete menu (Search and Funding)
│   ├── search-suggestions.js         # Search autocomplete rows
│   ├── comparison.js                 # `A vs B` head-to-head mode (schools, professors, or areas)
│   ├── compare-view.js               # Comparison chart and summary rendering
│   ├── discoveries.js                # Discoveries view (rendered on the Search page): insight cards
│   ├── simulator.js                  # Simulator page UI and orchestration
│   ├── simulation.js                 # Pure matching and rank-impact logic
│   ├── analysis.js                   # Integrated analysis and data-health logic
│   ├── funding.js                    # NSF funding search page
│   ├── nsf.js                        # Funding attribution and rendering
│   ├── seo.js                        # Dynamic <title>/description/canonical/OG per view
│   ├── share.js                      # Reusable Copy Link / Web Share control
│   ├── analytics.js                  # Opt-in, no-op-by-default usage tracking hooks
│   ├── tooltip-position.js           # Positions ⓘ tooltip panels beside their trigger
│   └── style.css                     # CSS styles
├── scripts/
│   ├── build-openalex-history.js     # Generates historical affiliations
│   ├── sync-nsf-awards.mjs           # Resumable scoped/all-US NSF synchronization
│   ├── sync-nsf-roster-names.mjs     # Re-resolves NSF names against the CSRankings roster
│   ├── build-school-aliases.js       # Generates school-aliases.json
│   ├── generate-og-image.mjs         # Renders og-card-template.html to public/og-image.png
│   └── generate-sitemap.mjs          # Generates public/sitemap.xml from the CSRankings roster
├── index.html                        # Search, results, integrated analysis, and the Discoveries view
├── csconfs.html                      # CS conference schedule
├── csconfs-submit.html               # Conference submission/correction form
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
