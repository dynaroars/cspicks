#!/usr/bin/env node
/**
 * build-openalex-history.js
 * 
 * Extracts professor affiliation history from OpenAlex API.
 * Replaces the CSRankings Git mining approach with automated API data.
 * 
 * Usage:
 *   node scripts/build-openalex-history.js                    # Full run
 *   node scripts/build-openalex-history.js --test --limit=10  # Test with 10 professors
 * 
 * Output: public/professor_history_openalex.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_CSV = path.join(__dirname, '../public/data/author-info.csv');
const OUTPUT_JSON = path.join(__dirname, '../public/professor_history_openalex.json');
const SCHOOL_ALIASES_OUTPUT = path.join(__dirname, '../public/school-aliases.json');
const OPENALEX_API = 'https://api.openalex.org/authors';

const DELAY_MS = 115;
const BATCH_SIZE = 50;

// Parse command line args
const args = process.argv.slice(2);
const isTest = args.includes('--test');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract unique professor names from author-info.csv
 */
function extractProfessorNames() {
    const csv = fs.readFileSync(INPUT_CSV, 'utf-8');
    const lines = csv.trim().split('\n');

    const professors = new Map(); // name -> current affiliation

    // Skip header
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        // CSV format: name,dept,area,count,adjustedcount,year
        const parts = line.split(',');
        if (parts.length < 2) continue;

        const name = parts[0].trim().replace(/^"|"$/g, '');
        const dept = parts[1].trim().replace(/^"|"$/g, '');

        if (name && !professors.has(name)) {
            professors.set(name, dept);
        }
    }

    console.log(`Found ${professors.size} unique professors`);
    return professors;
}

/**
 * Clean professor name for API search
 * Remove disambiguation numbers like " 0001"
 */
function cleanName(name) {
    return name.replace(/\s+\d{4}$/, '').trim();
}

/**
 * Query OpenAlex API for author affiliations
 */
async function fetchOpenAlexAuthor(name) {
    const cleanedName = cleanName(name);
    const url = `${OPENALEX_API}?search=${encodeURIComponent(cleanedName)}&per_page=1`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'CSPicks/1.0 (https://github.com/dynaroars/cspicks; mailto:toazanrayyan@gmail.com)'
            }
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.log('Rate limited, waiting 60s...');
                await sleep(60000);
                return fetchOpenAlexAuthor(name); // Retry
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            return null;
        }

        const author = data.results[0];

        // Extract affiliation history
        if (!author.affiliations || author.affiliations.length === 0) {
            return null;
        }

        return {
            openalex_id: author.id?.replace('https://openalex.org/', '') || null,
            orcid: author.orcid?.replace('https://orcid.org/', '') || null,
            display_name: author.display_name,
            affiliations: author.affiliations.map(aff => ({
                institution: aff.institution?.display_name || 'Unknown',
                institution_id: aff.institution?.id?.replace('https://openalex.org/', '') || null,
                country: aff.institution?.country_code || null,
                years: aff.years || []
            }))
        };

    } catch (err) {
        console.error(`Error fetching ${name}: ${err.message}`);
        return null;
    }
}

/**
 * Convert OpenAlex affiliations to our professor_history.json format
 * 
 * Input: { affiliations: [{ institution, years: [2020, 2019, 2018] }] }
 * Output: [{ start: 2018, end: 2020, school: "..." }]
 */
function convertToHistoryFormat(openAlexData) {
    if (!openAlexData || !openAlexData.affiliations) return null;

    const history = [];

    for (const aff of openAlexData.affiliations) {
        if (!aff.years || aff.years.length === 0) continue;

        const sortedYears = [...aff.years].sort((a, b) => a - b);

        // Group consecutive years into segments
        let segmentStart = sortedYears[0];
        let segmentEnd = sortedYears[0];

        for (let i = 1; i < sortedYears.length; i++) {
            if (sortedYears[i] === segmentEnd + 1) {
                // Consecutive year
                segmentEnd = sortedYears[i];
            } else {
                // Gap - save current segment and start new one
                history.push({
                    start: segmentStart,
                    end: segmentEnd,
                    school: aff.institution
                });
                segmentStart = sortedYears[i];
                segmentEnd = sortedYears[i];
            }
        }

        // Save final segment
        history.push({
            start: segmentStart,
            end: segmentEnd,
            school: aff.institution
        });
    }

    return history.length > 0 ? history : null;
}

/**
 * Main execution
 */
async function main() {
    console.log('=== OpenAlex Affiliation Extractor ===\n');

    if (isTest) {
        console.log('TEST MODE: Limited run\n');
    }

    // Step 1: Extract professor names
    const professors = extractProfessorNames();
    let names = Array.from(professors.keys());

    if (limit) {
        names = names.slice(0, limit);
        console.log(`Limited to ${limit} professors for testing\n`);
    }

    // Step 2: Fetch from OpenAlex
    const result = {};
    const schoolNames = new Set(); // Collect all OpenAlex school names
    let found = 0;
    let notFound = 0;

    console.log(`Processing ${names.length} professors...\n`);

    for (let i = 0; i < names.length; i++) {
        const name = names[i];

        // Progress reporting
        if (i > 0 && i % BATCH_SIZE === 0) {
            console.log(`Progress: ${i}/${names.length} (${found} found, ${notFound} not found)`);
        }

        const openAlexData = await fetchOpenAlexAuthor(name);

        if (openAlexData) {
            const history = convertToHistoryFormat(openAlexData);
            if (history) {
                result[name] = history;
                found++;

                // Collect school names for alias mapping
                history.forEach(h => schoolNames.add(h.school));
            } else {
                notFound++;
            }
        } else {
            notFound++;
        }

        // Rate limiting
        await sleep(DELAY_MS);
    }

    console.log(`\nCompleted: ${found} found, ${notFound} not found`);

    // Step 3: Save results
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
    console.log(`\nSaved to ${OUTPUT_JSON}`);

    // Step 4: Save school names for alias mapping
    const schoolList = Array.from(schoolNames).sort();
    const aliasTemplate = {};
    schoolList.forEach(s => { aliasTemplate[s] = s; }); // Identity mapping as starting point

    fs.writeFileSync(SCHOOL_ALIASES_OUTPUT, JSON.stringify(aliasTemplate, null, 2));
    console.log(`Saved ${schoolList.length} school names to ${SCHOOL_ALIASES_OUTPUT}`);

    console.log('\n=== Done ===');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
