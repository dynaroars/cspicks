#!/usr/bin/env node
/**
 * Generates static, SEO-optimized HTML landing pages for:
 * - Universities (/schools/<slug>/index.html)
 * - CS Research Areas (/areas/<slug>/index.html)
 *
 * Provides instant First Contentful Paint, rich OpenGraph/Twitter cards,
 * Schema.org JSON-LD structured data, and search engine indexability
 * for non-JS crawlers (Google, Bing, DuckDuckGo, Perplexity, ChatGPT).
 *
 * Usage:
 *   node --import tsx scripts/generate-seo-pages.mjs [--dev]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, filterByYears, DEFAULT_START_YEAR, DEFAULT_END_YEAR } from '../src/data.ts';
import { areaLabels, escapeHtml } from '../src/shared.ts';
import { parentMap } from '../src/data/conference-sets.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const isDev = process.argv.includes('--dev');
const outDir = path.resolve(root, isDev ? 'public' : 'dist');
const ORIGIN = 'https://cspicks.roars.dev';

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function renderHeader() {
  return `<header>
    <div class="title-row">
      <a class="site-title-link" href="/index.html" aria-label="Reset CS Picks"><h1>CS Picks</h1></a>
      <a class="github-link" href="https://github.com/dynaroars/cspicks" target="_blank" rel="noopener noreferrer" aria-label="View CS Picks on GitHub" title="View source on GitHub"></a>
      <a class="icon-link roars-link" href="https://roars.dev" target="_blank" rel="noopener noreferrer" aria-label="ROARS Lab" title="ROARS Lab"></a>
    </div>
    <nav class="top-nav" aria-label="Primary navigation">
      <a href="/index.html" id="nav-search">🔎 Search</a>
      <a href="/simulator.html">☠️ Simulator</a>
      <a href="/csconfs.html">📅 CS Confs</a>
      <a href="/grants.html">💰 Awards &amp; Grants</a>
      <a href="/nsf.html">🇺🇸 NSF Funding</a>
    </nav>
  </header>`;
}

function renderSchoolPage(school, faculty, allSchools) {
  const slug = slugify(school.name);
  const canonicalUrl = `${ORIGIN}/schools/${slug}/`;
  const facultyCount = faculty.length;
  const topFaculty = [...faculty].sort((a, b) => b.totalAdjusted - a.totalAdjusted);
  const totalPubs = school.totalAdjusted.toFixed(1);

  // Group and rank school areas
  const areaEntries = Object.entries(school.areas || {})
    .map(([key, stats]) => ({
      key,
      name: areaLabels[key] || key,
      pubs: stats.adjusted || 0,
      facultyCount: (stats.faculty || []).length
    }))
    .filter(a => a.pubs > 0)
    .sort((a, b) => b.pubs - a.pubs);

  const topAreaNames = areaEntries.slice(0, 4).map(a => a.name).join(', ');
  const title = `${school.name} - Computer Science Faculty & Research | CS Picks`;
  const description = `Explore computer science research at ${school.name}: ${facultyCount} active faculty, ${totalPubs} publications across ${topAreaNames || 'key areas'}, rankings, and advisor profiles.`;

  const interactiveUrl = `/index.html?q=${encodeURIComponent(school.name)}&target=${encodeURIComponent(school.name)}&targetType=school`;

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: school.name,
    url: canonicalUrl,
    description,
    department: {
      '@type': 'Department',
      name: 'Department of Computer Science'
    },
    numberOfEmployees: facultyCount,
    employee: topFaculty.slice(0, 20).map(f => ({
      '@type': 'Person',
      name: f.name,
      url: f.homepage || undefined,
      sameAs: [
        f.scholarid ? `https://scholar.google.com/citations?user=${f.scholarid}` : null,
        f.orcid ? `https://orcid.org/${f.orcid}` : null
      ].filter(Boolean)
    }))
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="CS Picks">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${ORIGIN}/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ORIGIN}/og-image.png">
  <script type="application/ld+json">${schemaJson}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/seo.css">
</head>
<body class="school-profile-page">
  <div id="app">
    ${renderHeader()}

    <main>
      <div class="hero-card">
        <div class="breadcrumbs">
          <a href="/index.html">Home</a> &gt; <a href="/index.html?region=${school.region || 'world'}">Universities</a> &gt; <span>${escapeHtml(school.name)}</span>
        </div>
        <h1 class="hero-title">${escapeHtml(school.name)}</h1>
        <p class="hero-subtitle">Computer Science Faculty, Research Strengths &amp; Publication Trends</p>

        <div class="hero-stats-row">
          <div class="stat-box">
            <div class="stat-value">${school.rank ? `#${school.rank}` : '—'}</div>
            <div class="stat-label">Global Rank</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${facultyCount}</div>
            <div class="stat-label">Active CS Faculty</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${totalPubs}</div>
            <div class="stat-label">10-Yr Publications</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${(school.region || 'World').toUpperCase()}</div>
            <div class="stat-label">Region</div>
          </div>
        </div>

        <div>
          <a class="cta-button" href="${interactiveUrl}">⚡ Open Interactive Analysis &amp; Filters</a>
        </div>
      </div>

      <section class="page-section">
        <h2 class="section-heading">Research Areas &amp; Subfield Strengths (${DEFAULT_START_YEAR}–${DEFAULT_END_YEAR})</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Research Area</th>
              <th>Active Faculty</th>
              <th>Adjusted Pubs</th>
              <th>Interactive Exploration</th>
            </tr>
          </thead>
          <tbody>
            ${areaEntries.map(a => `<tr>
              <td><strong><a href="/areas/${slugify(a.name)}/" style="color:inherit;text-decoration:none;">${escapeHtml(a.name)}</a></strong></td>
              <td>${a.facultyCount}</td>
              <td>${a.pubs.toFixed(1)}</td>
              <td><a href="/index.html?q=${encodeURIComponent(school.name + ' ' + a.name)}" style="color:var(--accent-blue);">Explore ${escapeHtml(a.name)} &rarr;</a></td>
            </tr>`).join('\n')}
          </tbody>
        </table>
      </section>

      <section class="page-section">
        <h2 class="section-heading">Computer Science Faculty Roster (${facultyCount} Professors)</h2>
        <div class="cards-grid">
          ${topFaculty.map(f => {
            const fAreas = Object.entries(f.areas || {})
              .sort((a, b) => (b[1].adjusted || 0) - (a[1].adjusted || 0))
              .map(([k]) => areaLabels[k] || k)
              .slice(0, 3);

            return `<div class="faculty-card">
              <div class="faculty-name">
                ${escapeHtml(f.name)}
                ${f.turingAwardYear ? `<span class="badge-honor">Turing Award &#39;${String(f.turingAwardYear).slice(-2)}</span>` : ''}
                ${f.acmFellowYear ? `<span class="badge-honor">ACM Fellow &#39;${String(f.acmFellowYear).slice(-2)}</span>` : ''}
              </div>
              <div class="faculty-meta">${f.totalPapers} papers &bull; ${f.totalAdjusted.toFixed(1)} adjusted count</div>
              <div class="faculty-tags">
                ${fAreas.map(tag => `<span class="faculty-tag">${escapeHtml(tag)}</span>`).join('')}
              </div>
              <div class="faculty-links">
                ${f.homepage ? `<a href="${escapeHtml(f.homepage)}" target="_blank" rel="noopener noreferrer">Homepage</a>` : ''}
                ${f.scholarid ? `<a href="https://scholar.google.com/citations?user=${escapeHtml(f.scholarid)}" target="_blank" rel="noopener noreferrer">Google Scholar</a>` : ''}
                <a href="/index.html?q=${encodeURIComponent(f.name)}">Analysis &rarr;</a>
              </div>
            </div>`;
          }).join('\n')}
        </div>
      </section>
    </main>

    <footer>
      <p>Data sourced from <a href="https://csrankings.org" target="_blank" rel="noopener noreferrer" style="color:inherit;">CSRankings</a>, DBLP, and open academic indices. Built with open-source tools for the CS community.</p>
    </footer>
  </div>
</body>
</html>`;
}

function renderAreaPage(areaKey, areaName, topSchools, topProfessors) {
  const slug = slugify(areaName);
  const canonicalUrl = `${ORIGIN}/areas/${slug}/`;
  const title = `Top Computer Science Programs in ${areaName} | CS Picks`;
  const description = `Discover leading computer science universities and top faculty in ${areaName}. Rankings, publication volumes, active researchers, and conference tracks on CS Picks.`;
  const interactiveUrl = `/index.html?q=${encodeURIComponent(areaName)}`;

  // Find tracked conferences for this area
  const trackedConfs = Object.entries(parentMap)
    .filter(([_, area]) => area === areaKey)
    .map(([conf]) => conf.toUpperCase());

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: canonicalUrl,
    description,
    about: {
      '@type': 'DefinedTerm',
      name: areaName,
      description: `Computer Science research subfield: ${areaName}`
    }
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="CS Picks">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${ORIGIN}/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ORIGIN}/og-image.png">
  <script type="application/ld+json">${schemaJson}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/seo.css">
</head>
<body class="area-profile-page">
  <div id="app">
    ${renderHeader()}

    <main>
      <div class="hero-card">
        <div class="breadcrumbs">
          <a href="/index.html">Home</a> &gt; <span>Research Areas</span> &gt; <span>${escapeHtml(areaName)}</span>
        </div>
        <h1 class="hero-title">${escapeHtml(areaName)} Research &amp; Rankings</h1>
        <p class="hero-subtitle">Leading Institutions, Faculty, and Publication Trends (${DEFAULT_START_YEAR}–${DEFAULT_END_YEAR})</p>

        <div class="hero-stats-row">
          <div class="stat-box">
            <div class="stat-value">${topSchools.length}</div>
            <div class="stat-label">Active Institutions</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${topProfessors.length}</div>
            <div class="stat-label">Active Researchers</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${trackedConfs.length ? trackedConfs.join(', ') : 'All Venues'}</div>
            <div class="stat-label">Tracked Conferences</div>
          </div>
        </div>

        <div>
          <a class="cta-button" href="${interactiveUrl}">⚡ Explore ${escapeHtml(areaName)} in Interactive Search</a>
        </div>
      </div>

      <section class="page-section">
        <h2 class="section-heading">Top Universities in ${escapeHtml(areaName)}</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Institution</th>
              <th>Faculty in ${escapeHtml(areaName)}</th>
              <th>Adjusted Output</th>
              <th>Profile</th>
            </tr>
          </thead>
          <tbody>
            ${topSchools.slice(0, 30).map((s, idx) => `<tr>
              <td><strong>#${idx + 1}</strong></td>
              <td><a href="/schools/${slugify(s.name)}/" style="color:var(--text-primary);font-weight:600;text-decoration:none;">${escapeHtml(s.name)}</a></td>
              <td>${s.facultyCount}</td>
              <td>${s.pubs.toFixed(1)}</td>
              <td><a href="/schools/${slugify(s.name)}/" style="color:var(--accent-blue);">View School &rarr;</a></td>
            </tr>`).join('\n')}
          </tbody>
        </table>
      </section>

      <section class="page-section">
        <h2 class="section-heading">Leading Faculty in ${escapeHtml(areaName)}</h2>
        <div class="cards-grid">
          ${topProfessors.slice(0, 24).map(f => `<div class="faculty-card">
            <div class="faculty-name">
              ${escapeHtml(f.name)}
              ${f.turingAwardYear ? `<span class="badge-honor">Turing Award</span>` : ''}
              ${f.acmFellowYear ? `<span class="badge-honor">ACM Fellow</span>` : ''}
            </div>
            <div class="faculty-meta">${escapeHtml(f.affiliation)}</div>
            <div class="faculty-tags">
              <span class="faculty-tag">${f.areaPubs.toFixed(1)} ${escapeHtml(areaName)} pubs</span>
              <span class="faculty-tag">${f.totalPapers} total papers</span>
            </div>
            <div class="faculty-links">
              ${f.homepage ? `<a href="${escapeHtml(f.homepage)}" target="_blank" rel="noopener noreferrer">Homepage</a>` : ''}
              ${f.scholarid ? `<a href="https://scholar.google.com/citations?user=${escapeHtml(f.scholarid)}" target="_blank" rel="noopener noreferrer">Google Scholar</a>` : ''}
              <a href="/schools/${slugify(f.affiliation)}/">${escapeHtml(f.affiliation)} &rarr;</a>
            </div>
          </div>`).join('\n')}
        </div>
      </section>
    </main>

    <footer>
      <p>Data sourced from <a href="https://csrankings.org" target="_blank" rel="noopener noreferrer" style="color:inherit;">CSRankings</a> and DBLP. Built for prospective PhD students and CS researchers.</p>
    </footer>
  </div>
</body>
</html>`;
}

export async function generateSeoPages() {
  console.log(`Loading CSRankings data for SEO page generation (output: ${outDir})...`);
  const rawData = await loadData();
  const filtered = filterByYears(rawData, DEFAULT_START_YEAR, DEFAULT_END_YEAR, 'world', null, null, 'all-union');

  const schoolsDir = path.join(outDir, 'schools');
  const areasDir = path.join(outDir, 'areas');
  await fs.mkdir(schoolsDir, { recursive: true });
  await fs.mkdir(areasDir, { recursive: true });

  // Ensure seo.css is in target directory
  const seoCssSrc = path.join(root, 'public', 'seo.css');
  const seoCssDest = path.join(outDir, 'seo.css');
  if (seoCssSrc !== seoCssDest) {
    await fs.copyFile(seoCssSrc, seoCssDest);
  }

  // 1. Generate School Pages
  const schoolList = Object.values(filtered.schools);
  let schoolPageCount = 0;

  for (const school of schoolList) {
    const faculty = Object.values(filtered.professors).filter(p => p.affiliation === school.name);
    if (faculty.length === 0 && school.totalAdjusted === 0) continue;

    const slug = slugify(school.name);
    const schoolSubDir = path.join(schoolsDir, slug);
    await fs.mkdir(schoolSubDir, { recursive: true });

    const html = renderSchoolPage(school, faculty, filtered.schools);
    await fs.writeFile(path.join(schoolSubDir, 'index.html'), html);
    schoolPageCount++;
  }
  console.log(`Generated ${schoolPageCount} university SEO pages.`);

  // 2. Generate Research Area Pages
  let areaPageCount = 0;
  for (const [areaKey, areaName] of Object.entries(areaLabels)) {
    const slug = slugify(areaName);
    const areaSubDir = path.join(areasDir, slug);
    await fs.mkdir(areaSubDir, { recursive: true });

    // Find top schools for this area
    const topSchools = schoolList
      .map(s => {
        const areaStats = s.areas?.[areaKey];
        return {
          name: s.name,
          pubs: areaStats?.adjusted || 0,
          facultyCount: (areaStats?.faculty || []).length
        };
      })
      .filter(s => s.pubs > 0)
      .sort((a, b) => b.pubs - a.pubs);

    // Find top professors for this area
    const topProfessors = Object.values(filtered.professors)
      .map(p => {
        const pArea = p.areas?.[areaKey];
        return {
          name: p.name,
          affiliation: p.affiliation,
          homepage: p.homepage,
          scholarid: p.scholarid,
          turingAwardYear: p.turingAwardYear,
          acmFellowYear: p.acmFellowYear,
          totalPapers: p.totalPapers,
          areaPubs: p.areas?.[areaKey]?.adjusted || 0
        };
      })
      .filter(p => p.areaPubs > 0)
      .sort((a, b) => b.areaPubs - a.areaPubs);

    const html = renderAreaPage(areaKey, areaName, topSchools, topProfessors);
    await fs.writeFile(path.join(areaSubDir, 'index.html'), html);
    areaPageCount++;
  }
  console.log(`Generated ${areaPageCount} research area SEO pages.`);

  return { schoolPageCount, areaPageCount };
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateSeoPages();
}
