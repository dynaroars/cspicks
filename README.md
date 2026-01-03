# CS Picks

**CS Picks** is a JavaScript-based web application for exploring Computer Science professors and schools. It uses data from [CSrankings](https://github.com/emeryberger/CSrankings), DBLP, and OpenAlex to provide an interface for searching faculty publications and analyzing school strengths.

## 🚀 Features

### 1. Professor Search
- **Search by Name**: Instantly find professors by name.
- **Publication Stats**: View a breakdown of publication counts by research area, sorted by volume.
- **Direct Links**: Quick access to the professor's:
    - **Homepage**
    - **Google Scholar Profile**
    - **DBLP Profile**

### 2. School Search
- **Search by Name**: Find universities by name.
- **Area Analysis**: View the school's top research areas based on publication count.
- **Faculty Lists**: See which faculty members are publishing in each area.

### 3. Area Search
- **Search by Area Name**: Find universities and professors working on an area.

### 4. Conference Search
- **Search by Conference Name**: Find universities and professors publishing in a specific conference.


## 🛠️ Technologies Used

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Build Tool**: [Vite](https://vitejs.dev/) (for fast development and bundling).
- **CSV Parsing**: [PapaParse](https://www.papaparse.com/).
- **HTML Encoding**: [he](https://github.com/mathiasbynens/he) (for DBLP URL generation).

## 📦 Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone <repository-url>
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
    The application will be available at `http://localhost:5173/`.

## 📂 Project Structure

```
cspicks/
├── public/
│   └── favicon.png                   # Site favicon
├── src/
│   ├── data.js                       # Data loading and processing logic
│   ├── main.js                       # Main application logic
│   └── style.css                     # CSS styles
├── index.html                        # Main HTML entry point
├── package.json                      # dependencies and scripts
└── README.md                         # documentation
```

## 📊 Data Sources

The application uses data from [CSrankings](https://github.com/emeryberger/CSrankings), [DBLP](https://dblp.org/), and [OpenAlex](https://openalex.org/). It does not modify or store these data and instead connects directly to them.


## 📝 License
Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License.
