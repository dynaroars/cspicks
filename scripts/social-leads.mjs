#!/usr/bin/env node
/**
 * Social-media leads for the jobs and awards routines: searches public Bluesky posts (no login) for job ads and award
 * calls, drops posts we already have, and prints what is left with a school/sponsor hint and the links to follow.
 *
 *   npm run leads:social -- --kind jobs --days 14              # job leads from the last two weeks
 *   npm run leads:social -- --kind jobs --country US           # only US schools (+ leads naming no known school)
 *   npm run leads:social -- --kind awards --days 35 --json     # award leads, machine-readable
 *
 * A post is a lead, never a source: follow it to the official page and take every fact from there. When a record is
 * added because of a lead, store the printed `sourcePost` URL on it so the card credits the post. Searches and accounts
 * live in scripts/data/social-sources.json. See TASKS/jobs.md and TASKS/grants.md, "Social-media leads".
 */
import fs from 'node:fs/promises';

const API = 'https://api.bsky.app/xrpc';
const DAY = 86_400_000;

const read = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));

/** Words that make a post about computing at all. */
const COMPUTING = /comput|software|informatic|data scien|artificial intelligence|machine learning|\bAI\b|\bML\b|cyber|robotic|electrical (and|&) computer|\bECE\b|\bCS\b|\bCSE\b|information (science|technology)|\bHCI\b|human.computer|quantum/i;
/** A computing unit or the bot's #computerscience tag; "machine learning" alone also matches physics and chemistry postdocs. */
const CS_UNIT = /computer science|computing|computer engineering|informatics|software|cyber ?security|electrical (and|&) computer|data science|information (science|technology)|\bECE\b|\bEECS\b|\bCSE?\b|#computerscience/i;
const JOB = /faculty|professor|professorship|lecturer|postdoc|post-doc|tenure|open rank|instructor|research (fellow|scientist)|researcher|teaching/i;
/** Staff and student roles we don't list. */
const NOT_ACADEMIC_JOB = /student assistant|research assistant|technician|architect|project manager|administrator|software engineer|developer|coordinator/i;
/** PhD-student recruiting and studentships are not jobs we list (unless the post also advertises a faculty/postdoc job). */
const STUDENT_AD = /\b(ph\.?d|doctoral|predoc|pre-doc)\.?\s*(students?|candidates?|positions?|researchers?|studentships?|applicants?|admissions?|programs?)\b|prospective (ph\.?d\.? )?students|graduate students|university assistant pre-?doc/i;
const FACULTY = /professor|lecturer|faculty|postdoc|post-doc|research fellow|research scientist/i;
const AWARD = /fellowship|award|grant|call for (proposals|applications|nominations)|\bcfp\b|funding|prize|scholarship|credits|\bRFP\b|solicitation|apply|applications? (are )?(open|due)|deadline/i;
/** An award lead asks the reader to do something; winner announcements, birthdays, and news coverage don't. */
const AWARD_ACTION = /nominat|\bapply\b|applications? (are |now )?(open|due|close)|accepting (applications|proposals|nominations)|call for (proposals|applications|nominations)|deadline|\bdue\b|\bRFA\b|\bRFP\b|solicitation|submit/i;
const AWARD_NOISE = /congratulat|happy birthday|\bHBD\b|recipients?\b(?! will)|is the winner|won the|winning|awardees?|we'll be at|booth|announcing:? .*recipients/i;
/** Conference talk/paper calls look like award calls; the conferences routine covers them. */
const PAPER_CALL = /call for (papers|talks|posters|workshops|tutorials)|submit (your )?(paper|abstract|talk)/i;

function parseArgs(argv) {
  const options = { kind: 'jobs', days: 14, since: null, country: null, limit: 40, json: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--kind') options.kind = next();
    else if (arg === '--days') options.days = Number(next());
    else if (arg === '--since') options.since = next();
    else if (arg === '--country') options.country = next();
    else if (arg === '--limit') options.limit = Number(next());
    else if (arg === '--json') options.json = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--help' || arg === '-h') { console.log(`Usage: npm run leads:social -- [--kind jobs|awards] [--days N | --since YYYY-MM-DD] [--country US|intl] [--limit N] [--all] [--json]
  --all   also list posts whose links or post are already in jobs.json / grants.json`); process.exit(0); }
    else throw new Error(`Unknown option ${arg}`);
  }
  if (!['jobs', 'awards'].includes(options.kind)) throw new Error('--kind must be jobs or awards');
  if (options.country && !['US', 'intl'].includes(options.country)) throw new Error('--country must be US or intl');
  options.sinceIso = options.since ? new Date(`${options.since}T00:00:00Z`).toISOString() : new Date(Date.now() - options.days * DAY).toISOString();
  return options;
}

let requests = 0;
let failures = 0;
async function xrpc(method, params) {
  const url = `${API}/${method}?${new URLSearchParams(params)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    requests++;
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status < 500) { failures++; console.error(`! ${method} ${params.q ?? params.actor ?? ''}: HTTP ${response.status}`); return null; }
    } catch (error) {
      if (attempt === 2) { failures++; console.error(`! ${method}: ${error.message}`); return null; }
    }
    await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  failures++;
  return null;
}

/** All posts matching `q` (optionally by one author) since `since`, newest first, at most `pages` pages of 100. */
async function search(q, since, author, pages = 3) {
  const posts = [];
  let cursor;
  for (let page = 0; page < pages; page++) {
    const result = await xrpc('app.bsky.feed.searchPosts', { q, sort: 'latest', limit: '100', since, ...(author ? { author } : {}), ...(cursor ? { cursor } : {}) });
    if (!result) break;
    posts.push(...(result.posts ?? []));
    cursor = result.cursor;
    if (!cursor || !result.posts?.length) break;
  }
  return posts;
}

/** An account's own posts (no replies) since `since`. */
async function authorFeed(actor, since, pages = 3) {
  const posts = [];
  let cursor;
  for (let page = 0; page < pages; page++) {
    const result = await xrpc('app.bsky.feed.getAuthorFeed', { actor, filter: 'posts_no_replies', limit: '100', ...(cursor ? { cursor } : {}) });
    if (!result) break;
    const batch = (result.feed ?? []).filter(item => !item.reason).map(item => item.post);
    posts.push(...batch.filter(post => (post.record?.createdAt ?? '') >= since));
    cursor = result.cursor;
    if (!cursor || batch.some(post => (post.record?.createdAt ?? '') < since)) break;
  }
  return posts;
}

const rkey = uri => String(uri).split('/').pop();
export const postUrl = post => `https://bsky.app/profile/${post.author.did}/post/${rkey(post.uri)}`;

/** Links a post carries: rich-text link facets and an external link card. */
export function postLinks(post) {
  const links = [
    ...(post.record?.facets ?? []).flatMap(facet => facet.features ?? []).map(feature => feature.uri).filter(Boolean),
    post.record?.embed?.external?.uri,
    post.embed?.external?.uri
  ].filter(link => typeof link === 'string' && /^https?:\/\//.test(link));
  return [...new Set(links)];
}

/** Comparable form of a URL: no scheme, www, tracking params, hash, or trailing slash. */
export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    [...url.searchParams.keys()].filter(key => /^(utm_|fbclid|gclid|ref$|source$)/.test(key)).forEach(key => url.searchParams.delete(key));
    url.hash = '';
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Job-ad mirrors the bot links to instead of the official ad. Their landing page carries one outbound link: the official
 * posting, which is what jobs.json stores, so following it lets the duplicate check work.
 */
const MIRRORS = /^https:\/\/(www\.)?tenuretracker\.info\/l\//;
/** Link shorteners sponsors post through; following the redirect gives the page grants.json would store. */
const SHORTENERS = /^https?:\/\/(bit\.ly|buff\.ly|ow\.ly|t\.co|tinyurl\.com|lnkd\.in|ieeecs\.info|share\.google|goo\.gl|spr\.ly|hubs\.(ly|la))\//;
export function officialLinkFromMirror(html) {
  const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'))
    .filter(link => !/tenuretracker\.info|google|gstatic|cloudflare|jsdelivr|fonts\.|bsky\.app|twitter\.com|x\.com\/|linkedin\.com|facebook\.com/.test(link));
  return links[0] ?? null;
}
async function resolveMirrors(leads) {
  const queue = leads.flatMap(lead => lead.links.filter(link => MIRRORS.test(link) || SHORTENERS.test(link)).map(link => ({ lead, link })));
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const response = await fetch(item.link, { signal: AbortSignal.timeout(15_000) });
        const official = !response.ok ? null : MIRRORS.test(item.link) ? officialLinkFromMirror(await response.text()) : response.url;
        if (official) item.lead.links = item.lead.links.map(link => link === item.link ? official : link);
      } catch { /* keep the mirror link; the routine follows it by hand */ }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  leads.forEach(lead => { lead.links = [...new Set(lead.links)]; });
}

/** One lead per linked page: a sponsor reposting the same call (or the bot re-posting an ad) is one lead, newest first. */
export function mergeSameLink(leads) {
  const byLink = new Map();
  const merged = [];
  for (const lead of leads) {
    const key = lead.links.map(normalizeUrl).find(Boolean);
    const first = key ? byLink.get(key) : undefined;
    if (first) { first.alsoPosted.push(lead.sourcePost); continue; }
    const kept = { ...lead, alsoPosted: [] };
    if (key) byLink.set(key, kept);
    merged.push(kept);
  }
  return merged;
}

const fold = text => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ')
  .replace(/\buniv\b/g, 'university').replace(/\b(the|of|at|de|di|degli|studi)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** Longest jobs-sources school whose name appears in the text; the "<X> is hiring:" bot line wins when it names one. */
export function matchSchool(text, schools) {
  const hiring = text.replace(/\s+/g, ' ').match(/^(?:The )?(.+?)(?: \(@[^)]*\))? is hiring:/i)?.[1];
  const haystack = ` ${fold(text)} `;
  let best = null;
  for (const school of schools) {
    if (school.folded.length < 6) continue;
    // The posted name may carry extra words ("Monash University Indonesia"), never fewer: "University of North Carolina"
    // must not become UNC Charlotte.
    const named = hiring && (fold(hiring) === school.folded || ` ${fold(hiring)} `.includes(` ${school.folded} `));
    if (named || haystack.includes(` ${school.folded} `)) {
      const score = (named ? 1000 : 0) + school.folded.length;
      if (!best || score > best.score) best = { ...school, score };
    }
  }
  return { school: best, named: hiring ?? null };
}

/** Computing faculty posts first, then computing postdocs/research posts, then the rest. */
export function leadPriority(kind, text) {
  const head = text.slice(0, 220);
  if (kind === 'awards') return /computer science|computing|\bAI\b|machine learning|software|cyber/i.test(head) ? 1 : 0;
  return (/computer science|computing|computer engineering|informatics|software|cyber|electrical (and|&) computer|#computerscience/i.test(head) ? 2 : 0)
    + (/professor|lecturer|faculty|tenure|open rank|instructor/i.test(head) ? 1 : 0);
}

/** grants.json ids whose short name or full name the post mentions: probably the same program under another URL. */
export function similarGrants(text, grants) {
  const haystack = ` ${fold(text)} `;
  return grants.filter(grant => [grant.shortName, grant.name].some(name => {
    const folded = fold(name ?? '');
    return folded.split(' ').length >= 2 && haystack.includes(` ${folded} `);
  })).map(grant => grant.id);
}

export function isLead(kind, text, fromAccount) {
  if (kind === 'jobs') {
    if (!COMPUTING.test(text) || !CS_UNIT.test(text) || !JOB.test(text)) return false;
    if (NOT_ACADEMIC_JOB.test(text) && !FACULTY.test(text.replace(NOT_ACADEMIC_JOB, ''))) return false;
    return !(STUDENT_AD.test(text) && !FACULTY.test(text.replace(STUDENT_AD, '')));
  }
  if (!AWARD.test(text) || !AWARD_ACTION.test(text) || AWARD_NOISE.test(text) || PAPER_CALL.test(text)) return false;
  return fromAccount || COMPUTING.test(text);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = await read('./data/social-sources.json');
  const sources = await read('./data/jobs-sources.json');
  const jobs = await read('../public/jobs.json');
  const grants = await read('../public/grants.json');
  const section = config[options.kind];

  // Fetch: keyword searches, then each account (its own queries, or its whole feed).
  const found = new Map();
  const add = (posts, fromAccount) => posts.forEach(post => {
    const prior = found.get(post.uri);
    found.set(post.uri, { post, fromAccount: fromAccount || prior?.fromAccount || false });
  });
  for (const q of section.queries) add(await search(q, options.sinceIso), false);
  for (const account of section.accounts) {
    if (account.queries) for (const q of account.queries) add(await search(q, options.sinceIso, account.handle), true);
    else add(await authorFeed(account.handle, options.sinceIso), true);
  }
  if (requests && failures === requests) {
    console.error(`Bluesky API unreachable (${failures} failed requests). Record "social leads: unavailable" and continue without them.`);
    process.exit(2);
  }

  // A reply can match a search when the post that started its thread did not (the bot puts the link up top): fetch those.
  const missing = [...new Set([...found.values()].map(entry => entry.post.record?.reply?.root?.uri).filter(uri => uri && !found.has(uri)))];
  for (let i = 0; i < missing.length; i += 25) {
    const result = await xrpc('app.bsky.feed.getPosts', new URLSearchParams(missing.slice(i, i + 25).map(uri => ['uris', uri])));
    (result?.posts ?? []).forEach(post => found.set(post.uri, { post, fromAccount: [...found.values()].some(entry => entry.fromAccount && entry.post.record?.reply?.root?.uri === post.uri) }));
  }

  // Fold a thread's replies (the bot's "Extract:" follow-ups) into the post that started it.
  const entries = [...found.values()];
  const roots = new Map(entries.map(entry => [entry.post.uri, { ...entry, text: entry.post.record?.text ?? '', links: postLinks(entry.post) }]));
  for (const entry of entries) {
    const root = entry.post.record?.reply?.root?.uri;
    if (root && root !== entry.post.uri && roots.has(root)) {
      const target = roots.get(root);
      target.text += `\n${entry.post.record.text}`;
      target.links = [...new Set([...target.links, ...postLinks(entry.post)])];
      roots.delete(entry.post.uri);
    }
  }

  const records = options.kind === 'jobs' ? jobs : grants;
  const knownUrls = new Set(records.map(record => normalizeUrl(record.url)).filter(Boolean));
  const knownPosts = new Set(records.map(record => record.sourcePost).filter(Boolean).map(rkey));
  const schools = sources.map(row => ({ name: row.school, folded: fold(row.school), country: row.country ?? 'US' }));
  const postingsBySchool = new Map();
  jobs.forEach(job => postingsBySchool.set(job.school, (postingsBySchool.get(job.school) ?? 0) + 1));

  const candidates = [...roots.values()].filter(entry => isLead(options.kind, entry.text, entry.fromAccount));
  await resolveMirrors(candidates);
  const leads = candidates
    .map(entry => {
      const known = knownPosts.has(rkey(entry.post.uri)) || entry.links.some(link => knownUrls.has(normalizeUrl(link)));
      const match = options.kind === 'jobs' ? matchSchool(entry.text, schools) : { school: null, named: null };
      return {
        date: (entry.post.record?.createdAt ?? '').slice(0, 10),
        author: entry.post.author.handle,
        sourcePost: postUrl(entry.post),
        school: match.school?.name ?? null,
        country: match.school?.country ?? null,
        postingsInJobsJson: match.school ? postingsBySchool.get(match.school.name) ?? 0 : null,
        namedInPost: match.school ? null : match.named,
        similarRecords: options.kind === 'awards' ? similarGrants(entry.text, grants) : [],
        links: entry.links,
        known,
        priority: leadPriority(options.kind, entry.text),
        text: entry.text.replace(/\s+/g, ' ').trim()
      };
    })
    .filter(lead => options.all || !lead.known)
    .filter(lead => !options.country || !lead.country || (options.country === 'US' ? lead.country === 'US' : lead.country !== 'US'))
    .sort((a, b) => b.date.localeCompare(a.date));
  const ranked = mergeSameLink(leads).sort((a, b) => b.priority - a.priority || b.date.localeCompare(a.date)).slice(0, options.limit);

  if (options.json) {
    console.log(JSON.stringify(ranked, null, 2));
    return;
  }
  console.log(`${ranked.length} ${options.kind} lead(s) from Bluesky since ${options.sinceIso.slice(0, 10)} (${found.size} posts scanned, ${requests} requests${failures ? `, ${failures} failed` : ''}).`);
  console.log('Leads only: confirm each on the official page; store sourcePost on records you add from one.\n');
  for (const lead of ranked) {
    const where = options.kind !== 'jobs' ? ''
      : lead.school ? `  school: ${lead.school} (${lead.country}; ${lead.postingsInJobsJson} posting(s) in jobs.json)\n`
        : `  school: not matched in jobs-sources.json${lead.namedInPost ? ` (post names "${lead.namedInPost}")` : ''}\n`;
    const similar = lead.similarRecords.length ? `  maybe already in grants.json: ${lead.similarRecords.join(', ')}\n` : '';
    console.log(`[${lead.date}] @${lead.author}${lead.known ? ' (already in data)' : ''}\n  sourcePost: ${lead.sourcePost}\n${where}${similar}${lead.links.length ? `  links: ${lead.links.join(' ')}\n` : ''}  text: ${lead.text.slice(0, 300)}\n${lead.alsoPosted.length ? `  also posted: ${lead.alsoPosted.join(' ')}\n` : ''}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error.message); process.exit(1); });
