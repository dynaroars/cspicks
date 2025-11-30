import Papa from 'papaparse';

export async function loadData() {
  const BASE = import.meta.env.BASE_URL;
  const [csrankings, authorInfo, institutions] = await Promise.all([
    fetchCsv(`${BASE}data/csrankings.csv`),
    fetchCsv(`${BASE}data/author-info.csv`),
    fetchCsv(`${BASE}data/institutions.csv`)
  ]);

  const professors = {};
  const schools = {};

  // Process Professors Metadata
  csrankings.forEach(row => {
    if (row.name) {
      const name = row.name.trim();
      professors[name] = {
        name: name,
        affiliation: row.affiliation,
        homepage: row.homepage,
        scholarid: row.scholarid,
        areas: {} // Will be populated from authorInfo
      };
    }
  });

  // Process Publication Data & Build School Stats
  authorInfo.forEach(row => {
    const name = row.name.trim();
    if (professors[name]) {
      // Add area count to professor
      professors[name].areas[row.area] = parseFloat(row.count);

      // Add to school stats
      const schoolName = professors[name].affiliation;
      if (!schools[schoolName]) {
        schools[schoolName] = {
          name: schoolName,
          areas: {}
        };
      }

      if (!schools[schoolName].areas[row.area]) {
        schools[schoolName].areas[row.area] = {
          count: 0,
          faculty: []
        };
      }

      schools[schoolName].areas[row.area].count += parseFloat(row.count);
      if (!schools[schoolName].areas[row.area].faculty.includes(name)) {
        schools[schoolName].areas[row.area].faculty.push(name);
      }
    }
  });

  return { professors, schools };
}

async function fetchCsv(url) {
  const response = await fetch(url);
  const text = await response.text();
  return new Promise((resolve) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data)
    });
  });
}
