#!/usr/bin/env node
/**
 * build-ror-crosswalk.js
 *
 * Prototype: resolve every CSRankings institution name to a ROR
 * (Research Organization Registry) ID via the public ROR API, to see how
 * much of the roster a canonical-ID crosswalk could cover before wiring
 * it into build-school-aliases.js / sync-nsf-awards.mjs.
 *
 * Usage:
 *   node scripts/build-ror-crosswalk.js [--limit=N] [--out=path.json]
 */

import fs from 'node:fs/promises';
import Papa from 'papaparse';

const INSTITUTIONS_URL = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/institutions.csv';
const ROR_API = 'https://api.ror.org/v2/organizations';
const DELAY_MS = 200;

const args = process.argv.slice(2);
const option = name => {
    const match = args.find(a => a.startsWith(`--${name}=`));
    return match ? match.split('=').slice(1).join('=') : null;
};
const limit = option('limit') ? Number(option('limit')) : Infinity;
const outPath = option('out') || new URL('../.ror-crosswalk-prototype.json', import.meta.url).pathname;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(name) {
    return name
        .toLowerCase()
        .replace(/[''`]/g, "'")
        .replace(/[""]/g, '"')
        .replace(/\s+/g, ' ')
        .replace(/univ\./g, 'university')
        .replace(/inst\./g, 'institute')
        .replace(/tech\./g, 'technology')
        .replace(/ - /g, ' ')
        .replace(/ — /g, ' ')
        .replace(/-/g, ' ')
        .replace(/,/g, '')
        .replace(/^the /g, '')
        .replace(/\(.*\)/g, '')
        .trim();
}

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} from ${url}`);
    return response.text();
}

async function resolveOne(name, attempt = 1) {
    const url = `${ROR_API}?query=${encodeURIComponent(name)}`;
    const response = await fetch(url);
    if (response.status === 429) {
        if (attempt > 3) throw new Error(`Rate limited repeatedly on "${name}"`);
        await sleep(2000 * attempt);
        return resolveOne(name, attempt + 1);
    }
    if (!response.ok) throw new Error(`${response.status} from ROR for "${name}"`);
    const data = await response.json();
    return data;
}

// True if any ROR name/alias/label/acronym normalizes to the same string
// as the CSRankings name.
function findExactNameHit(csrankingsName, rorItem) {
    const target = normalize(csrankingsName);
    return (rorItem.names || []).some(n => normalize(n.value) === target);
}

async function main() {
    console.log('=== ROR Crosswalk Prototype ===\n');

    const institutionsText = await fetchText(INSTITUTIONS_URL);
    const institutions = Papa.parse(institutionsText, { header: true, skipEmptyLines: true }).data
        .map(row => row.institution?.trim())
        .filter(Boolean);

    const names = institutions.slice(0, limit);
    console.log(`Resolving ${names.length} CSRankings institutions against ROR...\n`);

    const results = [];
    let exact = 0, review = 0, none = 0, errors = 0;

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        try {
            const data = await resolveOne(name);
            const top = data.items?.[0];

            if (!top) {
                results.push({ csrankings_name: name, ror_id: null, tier: 'none' });
                none++;
            } else {
                const exactHit = findExactNameHit(name, top);
                const displayName = top.names.find(n => n.types.includes('ror_display'))?.value
                    || top.names[0]?.value;
                results.push({
                    csrankings_name: name,
                    ror_id: top.id,
                    ror_display_name: displayName,
                    tier: exactHit ? 'exact' : 'review',
                    total_candidates: data.number_of_results,
                });
                if (exactHit) exact++; else review++;
            }
        } catch (err) {
            results.push({ csrankings_name: name, ror_id: null, tier: 'error', error: err.message });
            errors++;
        }

        if ((i + 1) % 50 === 0 || i === names.length - 1) {
            process.stdout.write(`  ${i + 1}/${names.length}  (exact: ${exact}, review: ${review}, none: ${none}, errors: ${errors})\r`);
        }
        await sleep(DELAY_MS);
    }

    console.log('\n');
    console.log('=== Summary ===');
    console.log(`Total institutions:  ${names.length}`);
    console.log(`Exact name match:    ${exact}  (${(100 * exact / names.length).toFixed(1)}%)`);
    console.log(`Top hit, needs review: ${review}  (${(100 * review / names.length).toFixed(1)}%)`);
    console.log(`No ROR match:        ${none}  (${(100 * none / names.length).toFixed(1)}%)`);
    console.log(`Errors:              ${errors}`);

    await fs.writeFile(outPath, JSON.stringify(results, null, 2));
    console.log(`\nFull results written to ${outPath}`);

    const reviewRows = results.filter(r => r.tier === 'review' || r.tier === 'none');
    const csv = ['csrankings_name,ror_top_hit_name,ror_id,decision']
        .concat(reviewRows.map(r => {
            const name = (r.ror_display_name || '').replace(/"/g, '""');
            return `"${r.csrankings_name}","${name}","${r.ror_id || ''}",`;
        }))
        .join('\n');
    const reviewPath = outPath.replace(/\.json$/, '-review.csv');
    await fs.writeFile(reviewPath, csv);
    console.log(`Reviewable candidates (${reviewRows.length} rows) written to ${reviewPath}`);

    console.log('\n=== Sample: needs review (top ROR hit != exact CSRankings name) ===');
    results.filter(r => r.tier === 'review').slice(0, 20).forEach(r => {
        console.log(`  "${r.csrankings_name}" → ROR top hit: "${r.ror_display_name}" (${r.ror_id})`);
    });

    console.log('\n=== Sample: no ROR match ===');
    results.filter(r => r.tier === 'none').slice(0, 20).forEach(r => {
        console.log(`  "${r.csrankings_name}"`);
    });
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
