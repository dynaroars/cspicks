#!/usr/bin/env node
/**
 * build-openalex-history.js
 *
 * Extracts professor affiliation history from OpenAlex API.
 * Replaces the CSRankings Git mining approach with automated API data.
 *
 * OpenAlex now requires a free API key (openalex.org/settings/api) and caps
 * free usage at $1/day (~1000 author-search requests). The full roster is
 * larger than that, so this script is resumable: it checkpoints every
 * attempted name to .openalex-ror-progress.json (gitignored) and each
 * invocation only spends up to --daily-budget requests on names not yet
 * attempted. Re-run it once a day (or on a cron) until it reports 0
 * remaining. Every run merges freshly-fetched entries into the existing
 * public/professor_history_openalex.json rather than replacing it, so the
 * committed file is safe to commit/push after any partial run.
 *
 * Usage:
 *   OPENALEX_API_KEY=... node scripts/build-openalex-history.js
 *   OPENALEX_API_KEY=... node scripts/build-openalex-history.js --daily-budget=900
 *   node scripts/build-openalex-history.js --test --limit=10
 *
 * Output: public/professor_history_openalex.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeAffiliationHistory, encodeAffiliationHistory } from '../src/affiliation-history-format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_CSV = path.join(__dirname, '../public/data/author-info.csv');
const OUTPUT_JSON = path.join(__dirname, '../public/professor_history_openalex.json');
const SCHOOL_ALIASES_OUTPUT = path.join(__dirname, '../public/school-aliases.json');
const PROGRESS_FILE = path.join(__dirname, '../.openalex-ror-progress.json');
const OPENALEX_API = 'https://api.openalex.org/authors';

const DELAY_MS = 115;
const BATCH_SIZE = 50;
const SAVE_EVERY = 20;
// Retry-after longer than this means the daily quota is exhausted, not a
// transient throttle - stop the run instead of sleeping it out.
const QUOTA_EXHAUSTED_THRESHOLD_S = 300;

// Parse command line args
const args = process.argv.slice(2);
const isTest = args.includes('--test');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const budgetArg = args.find(a => a.startsWith('--daily-budget='));
const dailyBudget = budgetArg ? parseInt(budgetArg.split('=')[1]) : 900;
const apiKeyArg = args.find(a => a.startsWith('--api-key='));
const apiKey = apiKeyArg ? apiKeyArg.split('=')[1] : process.env.OPENALEX_API_KEY;

if (!apiKey) {
    console.warn('WARNING: no OPENALEX_API_KEY set. Anonymous requests have a tiny one-time quota and will likely fail immediately.');
    console.warn('Get a free key at https://openalex.org/settings/api and pass it via OPENALEX_API_KEY env var or --api-key=.\n');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
    if (!fs.existsSync(PROGRESS_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
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

function normalizeInstitutionName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[.,]/g, '')
        .replace(/\buniv\b/g, 'university')
        .replace(/\binst\b/g, 'institute')
        .replace(/\btech\b/g, 'technology')
        .replace(/\s+/g, ' ')
        .trim();
}

// A bare name search with no affiliation check happily returns a real but
// unrelated author when the searched name collides with someone more
// prominent elsewhere in OpenAlex's far larger cross-discipline index -
// common names especially. Preferring a candidate whose own affiliations
// include the professor's known CSRankings institution catches most of that
// before it ever reaches the output file (src/data.js also guards against
// what slips through, since this check can't be perfect on name text alone).
function affiliationsMatch(affiliations, currentAffiliation) {
    const target = normalizeInstitutionName(currentAffiliation);
    if (!target) return false;
    return (affiliations || []).some(aff => {
        const candidate = normalizeInstitutionName(aff.institution?.display_name);
        return Boolean(candidate) && (candidate === target || candidate.includes(target) || target.includes(candidate));
    });
}

// Thrown when the daily quota looks exhausted, to stop the run instead of
// spinning through repeated 60s retries that will never succeed.
class QuotaExhaustedError extends Error {}

/**
 * Query OpenAlex API for author affiliations
 */
async function fetchOpenAlexAuthor(name, currentAffiliation, attempt = 1) {
    const cleanedName = cleanName(name);
    let url = `${OPENALEX_API}?search=${encodeURIComponent(cleanedName)}&per_page=5`;
    if (apiKey) url += `&api_key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'CSPicks/1.0 (https://github.com/dynaroars/cspicks; mailto:toazanrayyan@gmail.com)'
        }
    });

    if (!response.ok) {
        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
            if (retryAfter > QUOTA_EXHAUSTED_THRESHOLD_S) {
                throw new QuotaExhaustedError(`Quota exhausted (retry-after ${retryAfter}s)`);
            }
            if (attempt > 3) throw new Error(`Rate limited repeatedly on "${name}"`);
            console.log(`Rate limited, waiting ${retryAfter || 60}s...`);
            await sleep((retryAfter || 60) * 1000);
            return fetchOpenAlexAuthor(name, currentAffiliation, attempt + 1);
        }
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
        return null;
    }

    // Prefer a result whose own affiliations include the professor's current
    // institution; only fall back to bare top-1 relevance when none of the
    // top candidates confirm it, so a still-unverified match is possible but
    // no longer the default outcome for every ambiguous name.
    const verified = data.results.find(candidate => affiliationsMatch(candidate.affiliations, currentAffiliation));
    const author = verified || data.results[0];

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
            ror: aff.institution?.ror?.replace('https://ror.org/', '') || null,
            country: aff.institution?.country_code || null,
            years: aff.years || []
        }))
    };
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
                    school: aff.institution,
                    ror: aff.ror
                });
                segmentStart = sortedYears[i];
                segmentEnd = sortedYears[i];
            }
        }

        // Save final segment
        history.push({
            start: segmentStart,
            end: segmentEnd,
            school: aff.institution,
            ror: aff.ror
        });
    }

    return history.length > 0 ? history : null;
}

/**
 * Rebuild the committed output files from the existing committed data plus
 * every successfully-fetched name in progress. Names not yet attempted, or
 * that OpenAlex couldn't find, keep whatever was already committed - a run
 * can only add ror-enriched data, never remove existing history.
 */
function writeMergedOutput(progress) {
    let base = {};
    if (fs.existsSync(OUTPUT_JSON)) {
        base = decodeAffiliationHistory(JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf-8')));
    }

    const merged = { ...base };
    for (const [name, openAlexData] of Object.entries(progress)) {
        if (!openAlexData) continue; // not found on OpenAlex - keep old entry, if any
        const history = convertToHistoryFormat(openAlexData);
        if (history) merged[name] = history;
    }

    let aliasTemplate = {};
    if (fs.existsSync(SCHOOL_ALIASES_OUTPUT)) {
        aliasTemplate = JSON.parse(fs.readFileSync(SCHOOL_ALIASES_OUTPUT, 'utf-8'));
    }
    const compact = encodeAffiliationHistory(merged, aliasTemplate);
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(compact));
    console.log(`Saved ${Object.keys(merged).length} professors to ${OUTPUT_JSON}`);

    const schoolNames = new Set();
    for (const history of Object.values(merged)) {
        history.forEach(h => schoolNames.add(h.school));
    }
    const schoolList = Array.from(schoolNames).sort();

    schoolList.forEach(s => { if (!(s in aliasTemplate)) aliasTemplate[s] = s; });

    fs.writeFileSync(SCHOOL_ALIASES_OUTPUT, JSON.stringify(aliasTemplate, null, 2));
    console.log(`Saved ${Object.keys(aliasTemplate).length} school names to ${SCHOOL_ALIASES_OUTPUT}`);
}

/**
 * Main execution
 */
async function main() {
    console.log('=== OpenAlex Affiliation Extractor ===\n');

    if (isTest) {
        console.log('TEST MODE: Limited run\n');
    }

    const professors = extractProfessorNames();
    let names = Array.from(professors.keys());
    if (limit) {
        names = names.slice(0, limit);
        console.log(`Limited to ${limit} professors for testing\n`);
    }

    const progress = isTest ? {} : loadProgress();
    const remaining = names.filter(name => !(name in progress));
    const todaysBatch = isTest ? names : remaining.slice(0, dailyBudget);

    console.log(`${remaining.length} professors not yet attempted; processing ${todaysBatch.length} this run (budget ${dailyBudget}).\n`);

    let found = 0, notFound = 0, quotaHit = false;

    for (let i = 0; i < todaysBatch.length; i++) {
        const name = todaysBatch[i];

        if (i > 0 && i % BATCH_SIZE === 0) {
            console.log(`Progress: ${i}/${todaysBatch.length} (${found} found, ${notFound} not found)`);
        }

        try {
            const openAlexData = await fetchOpenAlexAuthor(name, professors.get(name));
            progress[name] = openAlexData;
            if (openAlexData) found++; else notFound++;
        } catch (err) {
            if (err instanceof QuotaExhaustedError) {
                console.log(`\n${err.message} - stopping this run, resume later.`);
                quotaHit = true;
                break;
            }
            console.error(`Error fetching ${name}: ${err.message}`);
            progress[name] = null;
            notFound++;
        }

        if (!isTest && (i + 1) % SAVE_EVERY === 0) saveProgress(progress);
        await sleep(DELAY_MS);
    }

    console.log(`\nThis run: ${found} found, ${notFound} not found${quotaHit ? ' (stopped early: quota exhausted)' : ''}`);

    if (!isTest) {
        saveProgress(progress);
        writeMergedOutput(progress);

        const stillRemaining = names.filter(name => !(name in progress)).length;
        const daysLeft = Math.ceil(stillRemaining / dailyBudget);
        console.log(`\n${stillRemaining} professors still not attempted (~${daysLeft} more run(s) at this budget).`);
    } else {
        writeMergedOutput(progress);
    }

    console.log('\n=== Done ===');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
