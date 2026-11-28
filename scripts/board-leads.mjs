#!/usr/bin/env node
/**
 * Job-board leads for the jobs routines: reads two aggregators that scripts can reach and lists the postings we may be
 * missing, grouped by school, with the school's crawl state.
 *
 *   npm run leads:boards                          # open leads from both boards
 *   npm run leads:boards -- --country US --days 21
 *   npm run leads:boards -- --source ajo --json
 *
 * Sources:
 *  - csjobs (https://dliu18.github.io/csjobs/): a daily-updated list of junior tenure-track CS-adjacent postings in North
 *    America and Europe. Its data file (js/jobs.js on GitHub) merges AcademicJobsOnline (any ad containing "computer"),
 *    the CRA Career Center (Cloudflare-blocked for scripts, so this is our only scripted view of it), and a
 *    school-by-school sweep of university-wide faculty portals (Interfolio, PeopleAdmin, Workday, UC AP Recruit, ...)
 *    that finds computing hires in statistics, business, information schools, public health, and policy units.
 *  - AJO's computer-science discipline list (https://academicjobsonline.org/ajo/cs), every open posting with its
 *    external apply link when the school uses its own portal.
 *
 * A board entry is a lead, never a source: open the official posting and take every field from it (TASKS/jobs.md).
 */
import fs from 'node:fs/promises';
import { normalizeUrl, matchSchool, fold } from './social-leads.mjs';

const CSJOBS = 'https://raw.githubusercontent.com/dliu18/csjobs/main/js/jobs.js';
const AJO = 'https://academicjobsonline.org';
const DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const read = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));

const US_STATES = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|United States)\b/;
/** A unit name that is plainly computing; anything else is a related-unit lead (statistics, business IS, iSchool...). */
const CS_UNIT = /computer|computing|informatics|software|cyber|electrical (and|&) computer|\bEECS\b|\bECE\b|artificial intelligence|data science/i;

/** CSRankings abbreviations ("Univ.", "Inst.", "Univ. of California - Berkeley") folded like the boards spell them. */
const expand = name => name.replace(/\bInst\./g, 'Institute').replace(/\bUNC\b/g, 'University of North Carolina');
/** Board spellings that the folded-substring match can't bridge. @type {[RegExp, string][]} */
const ALIASES = [
  [/\bMIT\b|Massachusetts Institute of Technology/, 'Massachusetts Inst. of Technology'],
  [/\bCaltech\b|California Institute of Technology/, 'California Inst. of Technology'],
  [/\bEPFL\b|polytechnique f[ée]d[ée]rale de Lausanne/i, 'EPFL'],
  [/\bETH Z[uü]rich\b/i, 'ETH Zurich'],
  [/Indiana University Bloomington/, 'Indiana University'],
  [/University of Tennessee, Knoxville/, 'University of Tennessee'],
  [/University of Nebraska.Lincoln/, 'University of Nebraska'],
  [/Missouri University of Science (&|and) Technology/, 'Missouri S&T'],
  [/^Rutgers\b/, 'Rutgers University'],
  [/^INSAIT\b|\(INSAIT\)/, 'INSAIT']
];

function parseArgs(argv) {
  const options = { sources: ['csjobs', 'ajo'], country: null, days: null, json: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') options.sources = [argv[++i]];
    else if (arg === '--country') options.country = argv[++i];
    else if (arg === '--days') options.days = Number(argv[++i]);
    else if (arg === '--json') options.json = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npm run leads:boards -- [--source csjobs|ajo] [--country US|intl] [--days N] [--all] [--json]
  --days N  only postings posted in the last N days (undated ones are kept)
  --all     also list postings already in jobs.json and ones whose stated dates have all passed`);
      process.exit(0);
    } else throw new Error(`Unknown option ${arg}`);
  }
  if (options.country && !['US', 'intl'].includes(options.country)) throw new Error('--country must be US or intl');
  if (options.sources.some(source => !['csjobs', 'ajo'].includes(source))) throw new Error('--source must be csjobs or ajo');
  return options;
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'Mozilla/5.0 (cspicks job leads)' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return { url: response.url, html: await response.text() };
}

const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const isoDate = value => value?.match(/(\d{4})\/(\d\d)\/(\d\d)/)?.slice(1).join('-') ?? null;

async function fromCsjobs() {
  const { html: source } = await get(CSJOBS);
  const rows = JSON.parse(source.slice(source.indexOf('['), source.lastIndexOf(']') + 1));
  return rows.map(row => ({
    board: 'csjobs',
    posted: row['Posted Date'] || null,
    deadline: row['Application Deadline'] || '',
    school: row.University,
    department: row.Department,
    title: row['Position Title'],
    location: row.City,
    links: [row['Listing Link']]
  }));
}

/** AJO's discipline list: one <h3> per employer and unit, then its postings with the list deadline and apply link. */
export function parseAjoList(html) {
  return html.split('<h3 class="x1">').slice(1).flatMap(block => {
    const [school = '', department = ''] = [...block.slice(0, block.indexOf('</h3>')).matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map(match => text(match[1]));
    return [...block.matchAll(/<li>\[<a href="\/ajo\/jobs\/(\d+)"[\s\S]*?<\/li>/g)].map(([item, id]) => ({
      id, school, department,
      title: text(item.match(/<span id="j\d+"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
      deadline: isoDate(item.match(/\(deadline ([^)]*)\)/)?.[1]) ?? '',
      apply: item.match(/<a href="(https?:\/\/(?!academicjobsonline)[^"]+)"[^>]*>Apply/)?.[1]?.replace(/&amp;/g, '&') ?? null
    }));
  });
}

/** An AJO posting page's labelled fields (postings that redirect to the school's own portal have none). */
export function parseAjoPosting(html) {
  const field = label => text(html.match(new RegExp(`<b>${label}:</b>(?:&nbsp;)?</div><div[^>]*>([\\s\\S]*?)</div>`))?.[1] ?? '');
  const dates = field('Appl Deadline');
  return {
    type: field('Position Type'),
    location: field('Position Location').replace(/\s*\[\s*map\s*\].*$/, ''),
    posted: isoDate(dates.match(/posted ([\d/]+)/)?.[1]),
    deadline: isoDate(dates.replace(/\(posted.*$/, '')) ?? dates.replace(/\(posted.*$/, '').trim()
  };
}

async function fromAjo() {
  const items = parseAjoList((await get(`${AJO}/ajo/cs`)).html);
  const leads = [];
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const lead = { board: 'ajo', school: item.school, department: item.department, title: item.title, deadline: item.deadline,
        posted: null, location: '', type: '', links: [`${AJO}/ajo/jobs/${item.id}`, item.apply].filter(Boolean) };
      try {
        const page = await get(`${AJO}/ajo/jobs/${item.id}`);
        if (new URL(page.url).hostname.endsWith('academicjobsonline.org')) {
          const posting = parseAjoPosting(page.html);
          Object.assign(lead, posting, { deadline: posting.deadline || item.deadline });
        } else lead.links = [...new Set([...lead.links, page.url])];
      } catch (error) { console.error(`! AJO ${item.id}: ${error.message}`); }
      leads.push(lead);
    }
  };
  await Promise.all([worker(), worker()]);
  return leads;
}

/** Still worth a look: rolling/open-ended, undated, or some stated date not yet passed. */
const mayBeOpen = lead => /until filled|rolling|open until|none/i.test(lead.deadline)
  || !/\d{4}-\d\d-\d\d/.test(lead.deadline) || [...lead.deadline.matchAll(/\d{4}-\d\d-\d\d/g)].some(([date]) => date >= today);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sources = await read('./data/jobs-sources.json');
  const jobs = await read('../public/jobs.json');
  const schools = sources.map(row => ({ row, name: row.school, country: row.country ?? 'US', folded: fold(expand(row.school)) }));
  const byName = new Map(schools.map(school => [school.name, school]));
  const knownUrls = new Set(jobs.map(job => normalizeUrl(job.url)));
  const crawledUrls = new Set(sources.flatMap(row => row.checkedUrls ?? []).map(normalizeUrl));
  const activeBySchool = new Map();
  jobs.filter(job => !job.closedAt).forEach(job => activeBySchool.set(job.school, [...(activeBySchool.get(job.school) ?? []), job.title]));

  const raw = [];
  for (const source of options.sources) {
    try { raw.push(...await (source === 'csjobs' ? fromCsjobs() : fromAjo())); }
    catch (error) { console.error(`! ${source} unreachable: ${error.message}. Record "board leads (${source}): unavailable" and continue.`); }
  }
  // csjobs lists many AJO ads by their AJO link; the AJO list knows the school's own apply link for some of them.
  const ajoApply = new Map(raw.filter(lead => lead.board === 'ajo' && lead.links[1]).map(lead => [normalizeUrl(lead.links[0]), lead.links[1]]));
  const seen = new Map();
  for (const lead of raw) {
    lead.links = [...new Set(lead.links.flatMap(link => [link, ajoApply.get(normalizeUrl(link))]).filter(Boolean))];
    const key = normalizeUrl(lead.links.find(link => !link.includes('academicjobsonline')) ?? lead.links[0]);
    if (seen.has(key)) { seen.get(key).board += `+${lead.board}`; continue; }
    seen.set(key, lead);
  }

  const since = options.days ? new Date(Date.now() - options.days * DAY).toISOString().slice(0, 10) : null;
  const leads = [...seen.values()].map(lead => {
    const alias = ALIASES.find(([pattern]) => pattern.test(lead.school))?.[1];
    const school = (alias && byName.get(alias)) || matchSchool(expand(lead.school), schools).school;
    const country = school?.country ?? (US_STATES.test(lead.location ?? '') ? 'US' : 'intl');
    const links = lead.links.map(normalizeUrl);
    return {
      ...lead,
      matched: school?.name ?? null,
      country: country === 'US' ? 'US' : country,
      known: links.some(link => knownUrls.has(link)),
      crawled: links.some(link => crawledUrls.has(link)),
      relatedUnit: !CS_UNIT.test(`${lead.department} ${lead.title}`),
      active: school ? activeBySchool.get(school.name) ?? [] : [],
      lastCheckedAt: school?.row.lastCheckedAt?.slice(0, 10) ?? null
    };
  })
    .filter(lead => options.all || (!lead.known && mayBeOpen(lead)))
    .filter(lead => !since || !lead.posted || lead.posted >= since)
    .filter(lead => !options.country || (options.country === 'US' ? lead.country === 'US' : lead.country !== 'US'));

  // Priority: school not in jobs-sources, then no active postings there, then posted after the last crawl, then the rest.
  const rank = lead => !lead.matched ? 0 : !lead.active.length ? 1
    : !lead.lastCheckedAt || (lead.posted ?? '9999') > lead.lastCheckedAt ? 2 : lead.crawled ? 4 : 3;
  leads.sort((a, b) => rank(a) - rank(b) || (a.matched ?? a.school).localeCompare(b.matched ?? b.school));

  if (options.json) { console.log(JSON.stringify(leads, null, 2)); return; }
  const labels = ['School not in jobs-sources.json (look for a spelling variant before --add)', 'Matched school with no active postings in jobs.json',
    'Posted after (or undated since) the school\'s last crawl', 'School crawled since posting: compare the title with its active records',
    'Link already in the school\'s checkedUrls (read and not added: check why)'];
  console.log(`${leads.length} board lead(s) from ${options.sources.join(' + ')}${since ? ` posted since ${since}` : ''}. Leads only: confirm on the official page.\n`);
  let group = -1;
  for (const lead of leads) {
    if (rank(lead) !== group) { group = rank(lead); console.log(`== ${labels[group]}`); }
    console.log(`- ${lead.matched ?? `"${lead.school}"`} (${lead.country}${lead.lastCheckedAt ? `, crawled ${lead.lastCheckedAt}` : ''}, ${lead.active.length} active) [${lead.board}]`
      + `\n    ${lead.title} — ${lead.department}${lead.relatedUnit ? '  ← non-CS unit: in scope if it hires CS; add to relatedUnits' : ''}`
      + `\n    posted ${lead.posted ?? '?'}; deadline ${lead.deadline || '?'}${lead.type ? `; ${lead.type}` : ''}\n    ${lead.links.join(' ')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error.message); process.exit(1); });
