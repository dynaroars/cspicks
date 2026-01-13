# CS Picks

**CS Picks** is a JavaScript-based web application for exploring Computer Science professors and schools. It is an accompaying tool to the PhD Demystify book (https://github.com/dynaroars/phd-cs-us), which helps prospective student navigate the PhD admission process in the US.  CSPicks uses data from [CSrankings](https://github.com/emeryberger/CSrankings), DBLP, and Open Alex to provide an interface for searching faculty publications and analyzing school strengths.

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
- **Trend Charts**: Click "Show Trends" to see:
  - **Rank Trend**: Historical ranking over time.
  - **Area Growth**: Publication growth by research area.
  - **Faculty Diversity**: Percentage of faculty publishing in multiple areas.

### 3. Historical Mode
- **Toggle Historical Affiliations**: When enabled, publications are credited to the institution where the author was affiliated at the time of publication (via OpenAlex data).

### 4. School Comparison
- **Side-by-Side Comparison**: Compare two schools across all research areas.

### 5. Area & Conference Search
- **Search by Area Name**: Find universities and professors in a research area.
- **Search by Conference**: Find contributors to specific venues (e.g., PLDI, NeurIPS).

### 6. Manual Affiliation Overrides
- **Community Corrections**: Add corrections to `public/manual_affiliations.csv` to fix incorrect OpenAlex data.

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
    npm install
    ```

3.  **Run Development Server**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173/cspicks/`.

4.  **Deploy to GitHub Pages**
    ```bash
    npm run deploy
    ```

## 📂 Project Structure

```
cspicks/
├── public/
│   ├── data/                         # CSRankings data files
│   ├── professor_history_openalex.json  # Historical affiliations
│   ├── school-aliases.json           # OpenAlex → CSRankings name mapping
│   └── manual_affiliations.csv       # Community corrections
├── src/
│   ├── data.js                       # Data loading and filtering
│   ├── main.js                       # Main search page logic
│   ├── compare.js                    # School comparison logic
│   ├── analysis.js                   # Analysis dashboard logic
│   └── style.css                     # CSS styles
├── scripts/
│   ├── build-school-aliases.js       # Generates school-aliases.json
│   └── fetch_openalex_history.py     # Fetches OpenAlex affiliation data
├── index.html                        # Main search page
├── compare.html                      # School comparison page
├── analysis.html                     # Analysis dashboard
└── README.md
```

## 📊 Data Sources

- [CSrankings](https://github.com/emeryberger/CSrankings) - Faculty and publication data
- [DBLP](https://dblp.org/) - Publication metadata and author profiles
- [OpenAlex](https://openalex.org/) - Historical affiliation data

## 📝 License
Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License.
