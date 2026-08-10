import fs from 'node:fs/promises';
import Papa from 'papaparse';

const ROSTER_URL = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/csrankings.csv';
// The roster and the publication table spell some people differently ("Aaron
// Striegel" vs "Aaron D. Striegel"). The app keys on the publication-table
// name, so the snapshot records both and the crosswalk lists the differences.
const AUTHOR_INFO_URL = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/generated-author-info.csv';
const INSTITUTIONS_URL = 'https://raw.githubusercontent.com/emeryberger/CSrankings/gh-pages/institutions.csv';
const API_URL = 'https://www.research.gov/awardapi-service/v1/awards.json';
const LEGACY_API_URL = 'https://api.nsf.gov/services/v1/awards.json';
const OUTPUT = new URL('../public/nsf-awards.json', import.meta.url);
const CROSSWALK = new URL('../public/nsf-name-crosswalk.csv', import.meta.url);
const CACHE = new URL('../.nsf-sync-cache.json', import.meta.url);
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const schoolFilter = option('--school');
const facultyFilter = option('--faculty');
const collaborativeFilter = option('--collaborative');
const allUs = args.includes('--all-us');
const refresh = args.includes('--refresh');
const limit = Number(option('--limit')) || Infinity;

if (!schoolFilter && !allUs) {
  throw new Error('Provide --all-us or a scoped university, for example: --school "George Mason University"');
}

function cleanRosterName(name) {
  return String(name || '').replace(/\s+\d{4}$/, '').trim();
}

function nameWords(name) {
  return cleanRosterName(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function identityKey(name) {
  const words = nameWords(name);
  return words.length ? `${words[0]} ${words.at(-1)}` : '';
}

function fullNameKey(name) {
  return nameWords(name).join(' ');
}

function projectTitleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\bresaerch\b/g, 'research')
    .replace(/\banalysiss\b/g, 'analysis')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCollaborativeTitle(title) {
  return /\bcollaborative\s+(?:research|resaerch)\b/i.test(title || '');
}

function investigatorName(value) {
  return String(value || '').replace(/\s+\S+@\S+\s*$/, '').trim();
}

function facultyNameMatches(rosterName, awardName) {
  const rosterWords = nameWords(rosterName);
  const awardWords = nameWords(awardName);
  if (!rosterWords.length || !awardWords.length || rosterWords.at(-1) !== awardWords.at(-1)) return false;
  if (fullNameKey(rosterName) === fullNameKey(awardName)) return true;
  const rosterGiven = new Set(rosterWords.slice(0, -1));
  return awardWords.slice(0, -1).some(word => rosterGiven.has(word));
}

function facultyQueryNames(name) {
  const cleaned = cleanRosterName(name);
  const variants = [cleaned];
  if (cleaned.includes('-')) {
    const words = nameWords(cleaned);
    if (words.length > 2) variants.push(`${words.at(-2)} ${words.at(-1)}`);
  }
  return [...new Set(variants)];
}

function institutionKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\buniversity\b/g, 'univ')
    .replace(/\b(the|research|foundation|corporation|corp|inc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function institutionMatches(first, second) {
  const a = institutionKey(first);
  const b = institutionKey(second);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function compactAward(raw) {
  return {
    id: String(raw.id), title: raw.title || 'Untitled award',
    awardeeName: raw.awardeeName || raw.awardee || '', date: raw.date || null,
    startDate: raw.startDate || null, expDate: raw.expDate || null,
    fundsObligatedAmt: raw.fundsObligatedAmt || 0, estimatedTotalAmt: raw.estimatedTotalAmt || 0,
    dirAbbr: raw.dirAbbr || '', divAbbr: raw.divAbbr || '',
    fundProgramName: raw.fundProgramName || '', program: raw.program || '',
    activeAwd: raw.activeAwd || 'false', pdPIName: raw.pdPIName || '', poName: raw.poName || '',
    pi: raw.pi || [], coPDPI: raw.coPDPI || []
  };
}

function buildFacultyResolver(faculty) {
  const byLastName = new Map();
  faculty.forEach(row => {
    const key = nameWords(row.name).at(-1);
    if (!byLastName.has(key)) byLastName.set(key, []);
    byLastName.get(key).push(row);
  });
  return (name, awardee) => {
    const candidates = (byLastName.get(nameWords(name).at(-1)) || [])
      .filter(row => institutionMatches(row.affiliation, awardee) && facultyNameMatches(row.name, name));
    if (!candidates.length) return null;
    const exact = candidates.filter(row => fullNameKey(row.name) === fullNameKey(name));
    if (exact.length === 1) return exact[0];
    const uniqueNames = new Map(candidates.map(row => [fullNameKey(row.name), row]));
    return uniqueNames.size === 1 ? [...uniqueNames.values()][0] : null;
  };
}

function normalizeAward(raw, resolveFaculty) {
  const awardee = raw.awardeeName || '';
  const investigatorRows = [
    ...(raw.pi || [raw.pdPIName]).filter(Boolean).map(name => ({ name: investigatorName(name), role: 'PI' })),
    ...(raw.coPDPI || []).map(name => ({ name: investigatorName(name), role: 'Co-PI' }))
  ];
  const seen = new Set();
  const investigators = investigatorRows.filter(row => {
    const key = fullNameKey(row.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(row => {
    const faculty = resolveFaculty(row.name, awardee);
    return {
      name: row.name, role: row.role,
      facultyName: faculty?.name || null,
      // The publication-table spelling, resolved once here instead of in every
      // visitor's browser.
      rosterName: faculty ? rosterNameFor(faculty.name, faculty.affiliation) : null,
      affiliation: faculty?.affiliation || null
    };
  });
  return {
    id: String(raw.id), title: raw.title, awardee,
    awardDate: raw.date, startDate: raw.startDate, endDate: raw.expDate,
    obligatedAmount: Number(raw.fundsObligatedAmt) || 0,
    estimatedAmount: Number(raw.estimatedTotalAmt) || 0,
    directorate: raw.dirAbbr, division: raw.divAbbr,
    program: raw.fundProgramName || raw.program,
    programManager: raw.poName || '',
    active: raw.activeAwd === 'true', investigators
  };
}

async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 750));
  }
  throw lastError;
}

async function fetchAwardsForFaculty(faculty) {
  const awards = [];
  for (const queryName of facultyQueryNames(faculty.name)) {
    let offset = 0;
    do {
      const url = new URL(API_URL);
      url.searchParams.set('pdPIName', queryName);
      url.searchParams.set('rpp', '25');
      url.searchParams.set('offset', String(offset));
      const payload = await fetchJson(url);
      const response = payload.response || {};
      if (response.serviceNotification) break;
      const page = response.award || [];
      awards.push(...page.filter(award =>
        facultyNameMatches(faculty.name, award.pdPIName)
        && institutionMatches(award.awardeeName || award.awardee, faculty.affiliation)
      ));
      const total = Number(response.metadata?.totalCount) || 0;
      offset += page.length;
      if (!page.length || offset >= total || offset >= 3000) break;
    } while (true);
  }
  return [...new Map(awards.map(award => [String(award.id), award])).values()];
}

async function fetchCollaborativeAwards(title) {
  const awards = [];
  let offset = 0;
  do {
    const url = new URL(LEGACY_API_URL);
    const searchWords = String(title)
      .replace(/^.*?\bcollaborative\s+(?:research|resaerch)\s*:\s*/i, '')
      .split(/\s+/)
      .slice(0, 10)
      .join(' ');
    url.searchParams.set('keyword', `"${searchWords}"`);
    url.searchParams.set('rpp', '25');
    url.searchParams.set('offset', String(offset));
    const payload = await fetchJson(url);
    const response = payload.response || {};
    if (response.serviceNotification) return awards;
    const page = response.award || [];
    awards.push(...page.filter(award => projectTitleKey(award.title) === projectTitleKey(title)));
    const total = Number(response.metadata?.totalCount) || 0;
    offset += page.length;
    if (!page.length || offset >= total || offset >= 250) break;
  } while (true);
  return awards;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.text();
}

const [rosterText, institutionsText, authorInfoText] = await Promise.all([
  fetchText(ROSTER_URL), fetchText(INSTITUTIONS_URL), fetchText(AUTHOR_INFO_URL)
]);
const roster = Papa.parse(rosterText, { header: true, skipEmptyLines: true }).data
  .filter(row => row.name && row.affiliation);

// Names as they appear in the publication table, which is what the app keys on.
const publicationNames = new Set(Papa.parse(authorInfoText, { header: true, skipEmptyLines: true }).data
  .map(row => String(row.name || '').replace(/\s*\[.*\]$/, '').trim())
  .filter(Boolean));
const publicationNamesByIdentity = new Map();
publicationNames.forEach(name => {
  const key = identityKey(name);
  // An ambiguous identity (two people, same first and last name) is left
  // unresolved rather than guessed at.
  publicationNamesByIdentity.set(key, publicationNamesByIdentity.has(key) ? null : name);
});

const crosswalk = new Map();
function rosterNameFor(name, affiliation) {
  if (!name) return null;
  if (publicationNames.has(name)) return name;
  const candidate = publicationNamesByIdentity.get(identityKey(name));
  if (!candidate) return null;
  crosswalk.set(`${name}|${candidate}`, { facultyName: name, rosterName: candidate, affiliation: affiliation || '' });
  return candidate;
}
const institutions = Papa.parse(institutionsText, { header: true, skipEmptyLines: true }).data;
const usSchools = new Set(institutions
  .filter(row => String(row.countryabbrv || '').trim().toLowerCase() === 'us')
  .map(row => row.institution?.trim()).filter(Boolean));
const scopeSchools = schoolFilter ? new Set([schoolFilter]) : usSchools;
const scopedRoster = roster.filter(row => scopeSchools.has(row.affiliation));

const facultyByQuery = new Map();
scopedRoster.forEach(row => {
  const key = `${fullNameKey(row.name)}|${institutionKey(row.affiliation)}`;
  if (!facultyByQuery.has(key)) facultyByQuery.set(key, row);
});
const scopedFaculty = [...facultyByQuery.values()].slice(0, limit);
if (!scopedFaculty.length) throw new Error('No CSRankings faculty found for the selected scope.');

let cache = { schemaVersion: 2, checked: {}, collaborativeChecked: {}, awards: {} };
if (!refresh) {
  try {
    const loaded = JSON.parse(await fs.readFile(CACHE, 'utf8'));
    if (loaded.schemaVersion === cache.schemaVersion) cache = { ...cache, ...loaded, collaborativeChecked: loaded.collaborativeChecked || {} };
  } catch {
    // Start a new resumable cache.
  }
}

let completed = 0;
let failures = 0;
let cacheWrite = Promise.resolve();
const queueCacheWrite = () => {
  const snapshot = `${JSON.stringify(cache)}\n`;
  cacheWrite = cacheWrite.then(() => fs.writeFile(CACHE, snapshot));
};
const pending = scopedFaculty.filter(faculty => {
  const key = `${fullNameKey(faculty.name)}|${institutionKey(faculty.affiliation)}`;
  const selected = !facultyFilter || fullNameKey(faculty.name).includes(fullNameKey(facultyFilter));
  return selected && (!cache.checked[key] || Boolean(facultyFilter));
});
process.stdout.write(`NSF sync: ${scopedFaculty.length} faculty at ${new Set(scopedFaculty.map(row => row.affiliation)).size} institutions; ${pending.length} require API queries.\n`);

const concurrency = 6;
let nextIndex = 0;
async function worker() {
  while (nextIndex < pending.length) {
    const faculty = pending[nextIndex++];
    const key = `${fullNameKey(faculty.name)}|${institutionKey(faculty.affiliation)}`;
    try {
      const awards = await fetchAwardsForFaculty(faculty);
      awards.forEach(raw => { cache.awards[String(raw.id)] = compactAward(raw); });
      cache.checked[key] = { name: faculty.name, affiliation: faculty.affiliation, checkedAt: new Date().toISOString() };
    } catch (error) {
      failures++;
      process.stderr.write(`Failed ${faculty.name} (${faculty.affiliation}): ${error.message}\n`);
    }
    completed++;
    if (completed % 25 === 0 || completed === pending.length) {
      queueCacheWrite();
      process.stdout.write(`Progress: ${completed}/${pending.length} queried; ${Object.keys(cache.awards).length} cached awards; ${failures} failures.\n`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, pending.length || 1) }, worker));
await cacheWrite;

const collaborativeTitles = new Map();
Object.values(cache.awards).forEach(award => {
  if (isCollaborativeTitle(award.title)) collaborativeTitles.set(projectTitleKey(award.title), award.title);
});
const pendingCollaborative = [...collaborativeTitles].filter(([key, title]) => {
  const selected = !collaborativeFilter || projectTitleKey(title).includes(projectTitleKey(collaborativeFilter));
  return selected && (!cache.collaborativeChecked[key] || Boolean(collaborativeFilter));
});
process.stdout.write(`Collaborative enrichment: ${collaborativeTitles.size} project titles; ${pendingCollaborative.length} require API queries.\n`);

nextIndex = 0;
let collaborativeCompleted = 0;
async function collaborativeWorker() {
  while (nextIndex < pendingCollaborative.length) {
    const [key, title] = pendingCollaborative[nextIndex++];
    try {
      const siblings = await fetchCollaborativeAwards(title);
      siblings.forEach(raw => { cache.awards[String(raw.id)] = compactAward(raw); });
      cache.collaborativeChecked[key] = { title, checkedAt: new Date().toISOString(), siblingAwards: siblings.length };
    } catch (error) {
      failures++;
      process.stderr.write(`Failed collaborative project ${title}: ${error.message}\n`);
    }
    collaborativeCompleted++;
    if (collaborativeCompleted % 25 === 0 || collaborativeCompleted === pendingCollaborative.length) {
      queueCacheWrite();
      process.stdout.write(`Collaborative progress: ${collaborativeCompleted}/${pendingCollaborative.length}; ${Object.keys(cache.awards).length} cached awards; ${failures} failures.\n`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, pendingCollaborative.length || 1) }, collaborativeWorker));
await cacheWrite;

const resolveFaculty = buildFacultyResolver(scopedRoster);
const normalizedAwards = Object.values(cache.awards).map(raw => normalizeAward(raw, resolveFaculty));
const collaborativeGroups = new Map();
normalizedAwards.filter(award => isCollaborativeTitle(award.title)).forEach(award => {
  const key = projectTitleKey(award.title);
  if (!collaborativeGroups.has(key)) collaborativeGroups.set(key, new Map());
  const lead = award.investigators.find(person => person.role === 'PI');
  const leadKey = identityKey(lead?.name) || `award:${award.id}`;
  const amount = award.estimatedAmount || award.obligatedAmount || 0;
  const prior = collaborativeGroups.get(key).get(leadKey);
  if (!prior || amount > prior.amount) collaborativeGroups.get(key).set(leadKey, { amount, id: award.id });
});
const collaborativeTotals = new Map([...collaborativeGroups].map(([key, leads]) => [
  key,
  { amount: [...leads.values()].reduce((sum, item) => sum + item.amount, 0), awardCount: leads.size }
]));
const awards = normalizedAwards
  .map(award => {
    const collaborative = collaborativeTotals.get(projectTitleKey(award.title));
    return collaborative?.awardCount > 1
      ? { ...award, collaborativeTotalAmount: collaborative.amount, collaborativeAwardCount: collaborative.awardCount }
      : award;
  })
  .filter(award => award.investigators.some(person => person.facultyName))
  .sort((a, b) => String(b.awardDate).localeCompare(String(a.awardDate)));
const checkedFaculty = scopedFaculty.filter(faculty =>
  cache.checked[`${fullNameKey(faculty.name)}|${institutionKey(faculty.affiliation)}`]
);
const checkedSchools = new Set(checkedFaculty.map(row => row.affiliation));
const scopeComplete = checkedFaculty.length === scopedFaculty.length;
const output = {
  schemaVersion: 3,
  syncedAt: new Date().toISOString(),
  source: 'NSF Award Search API',
  sourceUrl: 'https://www.nsf.gov/funding/award-search',
  scope: allUs ? ['US CSRankings universities'] : [schoolFilter],
  methodology: 'Awards are discovered by exact primary-investigator name and retained only when the NSF recipient matches the faculty member’s current CSRankings institution. Listed investigators are matched to that scoped current roster; NSF estimated total award amounts are divided among all listed investigators. Collaborative project totals are enriched from exact-title sibling awards and transfer records for the same lead investigator are counted once.',
  coverage: {
    complete: scopeComplete,
    facultyChecked: checkedFaculty.length,
    facultyTotal: scopedFaculty.length,
    institutionsChecked: checkedSchools.size,
    institutionsTotal: new Set(scopedFaculty.map(row => row.affiliation)).size,
    failures
  },
  awards
};
await fs.writeFile(OUTPUT, `${JSON.stringify(output)}\n`);

// A reviewable record of every name that needed resolving, so a wrong match can
// be spotted and corrected by hand.
const crosswalkRows = [...crosswalk.values()].sort((a, b) => a.rosterName.localeCompare(b.rosterName));
await fs.writeFile(CROSSWALK, [
  '# Faculty whose CSRankings roster name differs from their publication-table name.',
  `# Generated ${new Date().toISOString()} by scripts/sync-nsf-awards.mjs.`,
  'faculty_name,roster_name,affiliation',
  ...crosswalkRows.map(row => [row.facultyName, row.rosterName, row.affiliation]
    .map(value => /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(','))
].join('\n') + '\n');
process.stdout.write(`Recorded ${crosswalkRows.length} name resolutions in public/nsf-name-crosswalk.csv.\n`);
process.stdout.write(`Saved ${awards.length} awards matched to ${checkedFaculty.length} faculty at ${checkedSchools.size} institutions. Coverage complete: ${scopeComplete}.\n`);
