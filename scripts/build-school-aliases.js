#!/usr/bin/env node
/**
 * build-school-aliases.js
 * 
 * Creates a mapping from OpenAlex school names to CSRankings school names.
 * Uses conservative normalization - only matches when names are very similar.
 * 
 * Usage: node scripts/build-school-aliases.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENALEX_HISTORY = path.join(__dirname, '../public/professor_history_openalex.json');
const CSRANKINGS_INSTITUTIONS = path.join(__dirname, '../public/data/institutions.csv');
const OUTPUT_ALIASES = path.join(__dirname, '../public/school-aliases.json');

/**
 * Normalize school name for matching
 */
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
        .replace(/\(.*\)/g, '') // Remove parenthetical info like (United States)
        .trim();
}

/**
 * Even more aggressive normalization for fuzzy matching
 */
function normalizeAggressive(name) {
    return normalize(name)
        .replace(/university of/g, '')
        .replace(/university/g, '')
        .replace(/institute of/g, '')
        .replace(/institute/g, '')
        .replace(/college/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract CSRankings institution names
 */
function loadCSRankingsInstitutions() {
    const csv = fs.readFileSync(CSRANKINGS_INSTITUTIONS, 'utf-8');
    const lines = csv.trim().split('\n');
    const institutions = new Map(); // normalized -> original name
    const aggressiveMap = new Map(); // aggressive normalized -> original name

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        const name = parts[0].trim().replace(/\r/g, '');
        if (name) {
            institutions.set(normalize(name), name);

            const aggressive = normalizeAggressive(name);
            if (aggressive.length > 3 && !aggressiveMap.has(aggressive)) {
                aggressiveMap.set(aggressive, name);
            }
        }
    }

    return { institutions, aggressiveMap };
}

/**
 * Collect unique OpenAlex school names from history
 */
function collectOpenAlexSchools() {
    const history = JSON.parse(fs.readFileSync(OPENALEX_HISTORY, 'utf-8'));
    const schools = new Set();

    for (const prof of Object.values(history)) {
        for (const aff of prof) {
            schools.add(aff.school);
        }
    }

    return Array.from(schools);
}

// Manual overrides for known problematic mappings
const MANUAL_OVERRIDES = {
    'Northeastern University': 'Northeastern University',
    'Purdue University West Lafayette': 'Purdue University',
    'Purdue University System': 'Purdue University',
    'University of California, Berkeley': 'Univ. of California - Berkeley',
    'University of California, Los Angeles': 'Univ. of California - Los Angeles',
    'University of California, San Diego': 'Univ. of California - San Diego',
    'University of California, Santa Barbara': 'Univ. of California - Santa Barbara',
    'University of California, Davis': 'Univ. of California - Davis',
    'University of California, Irvine': 'Univ. of California - Irvine',
    'University of California, Riverside': 'Univ. of California - Riverside',
    'University of California, Santa Cruz': 'Univ. of California - Santa Cruz',
    'University of California, Merced': 'Univ. of California - Merced',
    'The University of Texas at Austin': 'University of Texas at Austin',
    'The Ohio State University': 'Ohio State University',
    'University of Massachusetts Amherst': 'Univ. of Massachusetts Amherst',
    'Indiana University Bloomington': 'Indiana University',
    'The Pennsylvania State University': 'Pennsylvania State University',
    'University of Wisconsin–Madison': 'University of Wisconsin - Madison',
    'University of Wisconsin-Madison': 'University of Wisconsin - Madison',
    'University of Nebraska-Lincoln': 'University of Nebraska',
    'University of Nebraska–Lincoln': 'University of Nebraska',
    'University of Nebraska at Omaha': 'University of Nebraska - Omaha',
    // UIUC and other major schools with naming discrepancies
    'University of Illinois Urbana-Champaign': 'Univ. of Illinois at Urbana-Champaign',
    'University of Illinois at Urbana-Champaign': 'Univ. of Illinois at Urbana-Champaign',
    'University of Illinois at Chicago': 'University of Illinois at Chicago',
    'University of Maryland, College Park': 'Univ. of Maryland - College Park',
    'University of Maryland': 'Univ. of Maryland - College Park',
    'University of North Carolina at Chapel Hill': 'Univ. of North Carolina - Chapel Hill',
    'University of North Carolina': 'Univ. of North Carolina - Chapel Hill',
    'University of Washington': 'Univ. of Washington',
    'University of Michigan': 'University of Michigan',
    'University of Michigan-Ann Arbor': 'University of Michigan',
    'Georgia Institute of Technology': 'Georgia Institute of Technology',
    'Georgia Tech': 'Georgia Institute of Technology',
};

// Patterns to exclude (companies, hospitals, etc. that shouldn't map to universities)
const EXCLUDE_PATTERNS = [
    /^google\b/i,
    /^microsoft\b/i,
    /^amazon\b/i,
    /^meta\b/i,
    /^apple\b/i,
    /^nvidia\b/i,
    /^intel\b/i,
    /^ibm\b/i,
    /^facebook\b/i,
    /^deepmind/i,
    /^openai/i,
    /hospital/i,
    /^clinic\b/i,
    /medical center/i,
    /university press/i,
    /university system/i,
    /^berkeley college$/i,  // Not UC Berkeley
    /^berkeley city college$/i,
    /national laboratory/i,
    /national lab\b/i,
    /research center/i,
    /research institute/i,
    /academy of sciences/i,
    /^california university of pennsylvania$/i, // Not U Penn
    /universidad del noreste/i,  // Mexico
];

/**
 * Find best match for an OpenAlex name in CSRankings
 * Conservative approach - only match on normalized exact matches
 */
function findMatch(openAlexName, csrankingsMap, aggressiveMap) {
    // Check manual overrides first
    if (MANUAL_OVERRIDES[openAlexName]) {
        return MANUAL_OVERRIDES[openAlexName];
    }

    // Check exclusion patterns
    for (const pattern of EXCLUDE_PATTERNS) {
        if (pattern.test(openAlexName)) {
            return null;
        }
    }

    const normalized = normalize(openAlexName);

    // Exact match after normalization
    if (csrankingsMap.has(normalized)) {
        return csrankingsMap.get(normalized);
    }

    // Try aggressive normalization for near-matches
    const aggressive = normalizeAggressive(openAlexName);
    if (aggressive.length > 3 && aggressiveMap.has(aggressive)) {
        return aggressiveMap.get(aggressive);
    }

    // No match - return null (will keep original name)
    return null;
}

/**
 * Main execution
 */
function main() {
    console.log('=== School Alias Builder ===\n');

    // Load CSRankings institutions
    const { institutions, aggressiveMap } = loadCSRankingsInstitutions();
    console.log(`Loaded ${institutions.size} CSRankings institutions`);

    // Collect OpenAlex schools
    const openAlexSchools = collectOpenAlexSchools();
    console.log(`Found ${openAlexSchools.length} unique OpenAlex schools\n`);

    // Build mapping
    const aliases = {};
    let matched = 0;
    let unmatched = 0;

    for (const school of openAlexSchools) {
        let isExcluded = false;
        for (const pattern of EXCLUDE_PATTERNS) {
            if (pattern.test(school)) {
                aliases[school] = null;
                isExcluded = true;
                break;
            }
        }
        if (isExcluded) continue;

        const match = findMatch(school, institutions, aggressiveMap);
        if (match) {
            aliases[school] = match;
            matched++;
        } else {
            aliases[school] = school;
            unmatched++;
        }
    }

    console.log(`Matched: ${matched}`);
    console.log(`Unmatched: ${unmatched}`);

    // Save
    fs.writeFileSync(OUTPUT_ALIASES, JSON.stringify(aliases, null, 2));
    console.log(`\nSaved to ${OUTPUT_ALIASES}`);

    // Show examples of matches
    console.log('\n=== Sample Matches ===');
    let count = 0;
    for (const [oa, cs] of Object.entries(aliases)) {
        if (oa !== cs && count < 30) {
            console.log(`  "${oa}" → "${cs}"`);
            count++;
        }
    }
}

main();