#!/usr/bin/env node
/**
 * Builds public/sitemap.xml:
 * - Root static pages (index, simulator, csconfs, grants, nsf)
 * - Static university landing pages (/schools/<slug>/)
 * - Static research area landing pages (/areas/<slug>/)
 *
 * Regenerate when CSRankings' roster changes:
 *   npm run sitemap
 */
import fs from 'node:fs/promises';
import Papa from 'papaparse';
import { areaLabels } from '../src/shared.ts';

const ORIGIN = 'https://cspicks.roars.dev';
const ROSTER_URL = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/csrankings.csv';
const OUTPUT = new URL('../public/sitemap.xml', import.meta.url);

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const response = await fetch(ROSTER_URL);
if (!response.ok) throw new Error(`${response.status} from ${ROSTER_URL}`);
const roster = Papa.parse(await response.text(), { header: true, skipEmptyLines: true }).data;

const schools = [...new Set(roster.map(row => row.affiliation?.trim()).filter(Boolean))].sort();

const today = new Date().toISOString().slice(0, 10);
const xmlEscape = value => value.replace(/&/g, '&amp;');
const url = (loc, { changefreq = 'weekly', priority = '0.5' } = {}) => `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

const staticPages = [
  url(`${ORIGIN}/`, { changefreq: 'daily', priority: '1.0' }),
  url(`${ORIGIN}/?view=discoveries`, { changefreq: 'daily', priority: '0.9' }),
  url(`${ORIGIN}/simulator.html`, { changefreq: 'weekly', priority: '0.6' }),
  url(`${ORIGIN}/csconfs.html`, { changefreq: 'daily', priority: '0.8' }),
  url(`${ORIGIN}/csconfs-submit.html`, { changefreq: 'monthly', priority: '0.3' }),
  url(`${ORIGIN}/nsf.html`, { changefreq: 'weekly', priority: '0.7' }),
  url(`${ORIGIN}/grants.html`, { changefreq: 'weekly', priority: '0.7' }),
  url(`${ORIGIN}/grants-submit.html`, { changefreq: 'monthly', priority: '0.3' })
];

const schoolPages = schools.map(name => {
  const slug = slugify(name);
  return url(`${ORIGIN}/schools/${slug}/`, { changefreq: 'weekly', priority: '0.7' });
});

const areaPages = Object.values(areaLabels).map(name => {
  const slug = slugify(name);
  return url(`${ORIGIN}/areas/${slug}/`, { changefreq: 'weekly', priority: '0.8' });
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticPages, ...areaPages, ...schoolPages].join('\n')}
</urlset>
`;

await fs.writeFile(OUTPUT, xml);
console.log(`Wrote ${schools.length} universities + ${areaPages.length} areas + ${staticPages.length} static pages to ${OUTPUT.pathname}`);
