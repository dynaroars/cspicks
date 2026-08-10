/**
 * Refreshes the publication-table name recorded against each matched NSF
 * investigator, and rewrites the crosswalk of names that needed resolving.
 *
 * The award data changes rarely; the CSRankings roster changes weekly. This
 * script re-resolves names from two CSV downloads without touching the NSF API,
 * so it is cheap enough to run on a schedule:
 *
 *   node scripts/sync-nsf-roster-names.mjs
 */
import fs from 'node:fs/promises';
import Papa from 'papaparse';

const AUTHOR_INFO_URL = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/generated-author-info.csv';
const AWARDS = new URL('../public/nsf-awards.json', import.meta.url);
const CROSSWALK = new URL('../public/nsf-name-crosswalk.csv', import.meta.url);

function nameWords(name) {
  return String(name || '')
    .replace(/\s+\d+$/, '')
    .toLowerCase()
    .replace(/[.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// First and last name only: the pair that survives a middle-initial difference.
function identityKey(name) {
  const words = nameWords(name);
  return words.length ? `${words[0]} ${words.at(-1)}` : '';
}

const response = await fetch(AUTHOR_INFO_URL);
if (!response.ok) throw new Error(`${response.status} from ${AUTHOR_INFO_URL}`);
const publicationNames = new Set(Papa.parse(await response.text(), { header: true, skipEmptyLines: true }).data
  .map(row => String(row.name || '').replace(/\s*\[.*\]$/, '').trim())
  .filter(Boolean));

const byIdentity = new Map();
publicationNames.forEach(name => {
  const key = identityKey(name);
  // Two people sharing a first and last name stay unresolved rather than guessed.
  byIdentity.set(key, byIdentity.has(key) ? null : name);
});

const dataset = JSON.parse(await fs.readFile(AWARDS, 'utf8'));
const crosswalk = new Map();
let resolved = 0;
let unmatched = 0;

(dataset.awards || []).forEach(award => {
  (award.investigators || []).forEach(person => {
    if (!person.facultyName) return;
    if (publicationNames.has(person.facultyName)) {
      person.rosterName = person.facultyName;
      resolved++;
      return;
    }
    const candidate = byIdentity.get(identityKey(person.facultyName));
    if (!candidate) {
      person.rosterName = null;
      unmatched++;
      return;
    }
    person.rosterName = candidate;
    resolved++;
    crosswalk.set(`${person.facultyName}|${candidate}`, {
      facultyName: person.facultyName,
      rosterName: candidate,
      affiliation: person.affiliation || ''
    });
  });
});

dataset.rosterNamesSyncedAt = new Date().toISOString();
await fs.writeFile(AWARDS, `${JSON.stringify(dataset)}\n`);

const rows = [...crosswalk.values()].sort((a, b) => a.rosterName.localeCompare(b.rosterName));
const csvValue = value => (/[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
await fs.writeFile(CROSSWALK, [
  '# Faculty whose CSRankings roster name differs from their publication-table name.',
  `# Generated ${dataset.rosterNamesSyncedAt} by scripts/sync-nsf-roster-names.mjs.`,
  '# The publication-table name is what the site matches on; edit a row to correct a resolution.',
  'faculty_name,roster_name,affiliation',
  ...rows.map(row => [row.facultyName, row.rosterName, row.affiliation].map(csvValue).join(','))
].join('\n') + '\n');

process.stdout.write(`Resolved ${resolved} investigator names (${unmatched} without a publication record).\n`);
process.stdout.write(`Recorded ${rows.length} differing names in public/nsf-name-crosswalk.csv.\n`);
