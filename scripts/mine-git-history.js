import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Configuration
const REPO_PATH = 'temp_csrankings'; // Cloned repo
const TARGET_FILE = 'generated-author-info.csv';
const OUTPUT_FILE = './public/professor_history.json';
const START_YEAR = 2000;
const END_YEAR = 2025;

async function main() {
    console.log(`Starting Git History Mining for ALL professors`);
    console.log(`Time Range: ${START_YEAR} - ${END_YEAR}`);

    if (!fs.existsSync(REPO_PATH)) {
        console.error(`Error: Repo not found at ${REPO_PATH}`);
        return;
    }

    const historyData = {}; // profName -> { year: school } map

    // 1. Walk years backwards
    for (let year = END_YEAR; year >= START_YEAR; year--) {
        const commitHash = getCommitForYear(year);

        if (!commitHash) {
            console.log(`[${year}] No commit found (repo might be younger)`);
            if (year < 2018) {
            }
            continue;
        }

        console.log(`[${year}] analyzing commit ${commitHash.substring(0, 7)}...`);

        try {
            const fileContent = getFileContentAtCommit(commitHash);
            const affiliations = parseAffiliations(fileContent);

            // Record affiliation for this year
            Object.entries(affiliations).forEach(([prof, school]) => {
                if (!historyData[prof]) historyData[prof] = {};
                historyData[prof][year] = school;
            });

        } catch (e) {
            console.log(`  > Error reading/parsing file: ${e.message}`);
        }
    }

    console.log('Processing timelines...');
    const finalHistory = processHistory(historyData);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalHistory, null, 2));
    console.log(`\nDone! Saved history for ${Object.keys(finalHistory).length} professors to ${OUTPUT_FILE}`);
}

function getCommitForYear(year) {
    // Get the last commit of that year
    try {
        const cmd = `git rev-list -n 1 --before="${year}-12-31" gh-pages`;
        const hash = execSync(cmd, { cwd: REPO_PATH, encoding: 'utf8' }).trim();
        return hash || null;
    } catch (e) {

        try {
            const cmdMaster = `git rev-list -n 1 --before="${year}-12-31" master`;
            return execSync(cmdMaster, { cwd: REPO_PATH, encoding: 'utf8' }).trim();
        } catch (e2) {
            return null;
        }
    }
}

function getFileContentAtCommit(commitHash) {
    const cmd = `git show ${commitHash}:${TARGET_FILE}`;
    return execSync(cmd, { cwd: REPO_PATH, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
}

function parseAffiliations(csvText) {
    const map = {}; // prof -> school
    const lines = csvText.split('\n');
    lines.forEach(line => {
        const parts = line.split(',');
        if (parts.length < 2) return;
        const name = parts[0].trim();
        const dept = parts[1].trim();
        if (name && dept) {
            map[name] = dept;
        }
    });
    return map;
}

function processHistory(rawHistory) {
    // Convert to segments
    const final = {};

    Object.entries(rawHistory).forEach(([prof, yearsMap]) => {
        // Capture ALL professors who changed schools at any point
        const schools = Object.values(yearsMap);

        const segments = [];
        const sortedYears = Object.keys(yearsMap).map(Number).sort((a, b) => a - b);

        if (sortedYears.length === 0) return;

        let currentSeg = {
            school: yearsMap[sortedYears[0]],
            start: sortedYears[0],
            end: sortedYears[0]
        };

        for (let i = 1; i < sortedYears.length; i++) {
            const y = sortedYears[i];
            const school = yearsMap[y];

            // Logic: if gap > 1 year OR school changed
            if (y > currentSeg.end + 1) {
                // Close segment
                segments.push(currentSeg);
                currentSeg = { school: school, start: y, end: y };
            } else if (school !== currentSeg.school) {
                segments.push(currentSeg);
                currentSeg = { school: school, start: y, end: y };
            } else {
                currentSeg.end = y;
            }
        }
        segments.push(currentSeg);
        final[prof] = segments;
    });

    return final;
}

main();
