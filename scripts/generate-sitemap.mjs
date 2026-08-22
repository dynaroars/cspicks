#!/usr/bin/env node
/**
 * Builds public/sitemap.xml: the six static pages, plus one deep link per
 * university straight into its Search-page research profile (the same
 * ?q=&target=&targetType=school URL the site's own links use, which sets a
 * university-specific <title>/description/canonical on load - see
 * src/seo.js). Real, distinct content per URL, not just a query-string fan-out
 * of one template, so it is a legitimate sitemap rather than a spam pattern.
 *
 * Regenerate when CSRankings' roster changes meaningfully:
 *   node scripts/generate-sitemap.mjs
 */
import fs from 'node:fs/promises';
import Papa from 'papaparse';

const ORIGIN = 'https://cspicks.roars.dev';
const ROSTER_URL = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/csrankings.csv';
const OUTPUT = new URL('../public/sitemap.xml', import.meta.url);

const response = await fetch(ROSTER_URL);
if (!response.ok) throw new Error(`${response.status} from ${ROSTER_URL}`);
const roster = Papa.parse(await response.text(), { header: true, skipEmptyLines: true }).data;

const schools = [...new Set(roster.map(row => row.affiliation?.trim()).filter(Boolean))].sort();

const today = new Date().toISOString().slice(0, 10);
// XML, not just URL-encoding: a raw "&" between query params is a well-formedness
// error inside <loc>, not just a nicety - sitemap.xml has to parse as XML first.
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
  const q = encodeURIComponent(name).replace(/%20/g, '+');
  return url(`${ORIGIN}/?q=${q}&target=${q}&targetType=school`, { changefreq: 'weekly', priority: '0.6' });
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticPages, ...schoolPages].join('\n')}
</urlset>
`;

await fs.writeFile(OUTPUT, xml);
console.log(`Wrote ${schools.length} university pages + 6 static pages to ${OUTPUT.pathname}`);
