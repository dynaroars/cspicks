#!/usr/bin/env node
/**
 * Data checks for the researched datasets the scheduled routines edit (docs/AUTOMATION.md).
 *
 * - `*Problems()` are hard errors: test/unit/data-files.test.js runs them on the live files, so `npm test` (and CI on
 *   every PR and push) rejects a malformed record. Each message names the record and field, so a routine can fix its
 *   own batch before opening the PR. Jobs and labs have their own validators (`npm run validate:jobs`).
 * - `dataWarnings()` are judgment calls a script can only flag (a jobs page on another country's domain, two postings
 *   that look like one search, dates out of order, a grant whose newest date is years old). They never fail CI. The
 *   auditor runs `npm run lint:data`, fixes what it confirms on the official page, and files the rest (TASKS/audit.md).
 *
 *   npm run lint:data     # print warnings (exit 0); errors, if any, exit 1
 */
import fs from 'node:fs/promises';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function isIsoDay(value) {
  const match = ISO_DAY.exec(String(value));
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}
const isDayOrNull = value => value === null || value === undefined || isIsoDay(value);
const isTimeOrNull = value => value === null || value === undefined || isIsoDay(value) || (ISO_INSTANT.test(value) && isIsoDay(value.slice(0, 10)));
const isUrl = value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
const isUrlOrNull = value => value === null || value === undefined || isUrl(value);
const badSpacing = value => typeof value === 'string' && (value !== value.trim() || /\s{2,}/.test(value));

function recordProblems(label, record, fields, checks) {
  const problems = Object.keys(record).filter(key => !fields.has(key)).map(key => `${label}: unknown field ${key}`);
  for (const [field, ok] of checks) if (!ok) problems.push(`${label}: ${field}`);
  for (const [key, value] of Object.entries(record)) if (badSpacing(value)) problems.push(`${label}: ${key} has stray whitespace`);
  return problems;
}

// ---- csconfs/data/conferences.json ----

const CONFERENCE_FIELDS = new Set(['name', 'venueKeys', 'year', 'description', 'link', 'seriesLink', 'date', 'place',
  'abstractDeadline', 'deadline', 'rebuttalDate', 'notificationDate', 'note', 'programChair', 'acceptanceRate', 'submissions',
  'estimated', 'verified', 'generalChair', 'other', 'area']);
const REBUTTAL_RANGE = /^(\d{4}-\d{2}-\d{2})–(\d{4}-\d{2}-\d{2})$/;
const stringOrNull = value => value === null || value === undefined || (typeof value === 'string' && value.length > 0);

export function conferenceProblems(conferences) {
  if (!Array.isArray(conferences)) return ['conferences.json is not an array'];
  const seen = new Set();
  return conferences.flatMap((conf, index) => {
    const label = `${conf?.name ?? `record #${index}`} ${conf?.year ?? ''}${conf?.note ? ` (${conf.note})` : ''}`;
    const key = `${conf?.name}\u0000${conf?.year}\u0000${conf?.note ?? ''}`;
    const duplicate = seen.has(key) ? [`${label}: duplicate name + year + note`] : [];
    seen.add(key);
    const rebuttal = REBUTTAL_RANGE.exec(String(conf?.rebuttalDate));
    return [...duplicate, ...recordProblems(label, conf ?? {}, CONFERENCE_FIELDS, [
      ['name', typeof conf?.name === 'string' && conf.name.length > 0],
      ['year', Number.isInteger(conf?.year) && conf.year >= 1950 && conf.year <= 2100],
      ['venueKeys', Array.isArray(conf?.venueKeys) && conf.venueKeys.every(key => typeof key === 'string' && key)],
      ['abstractDeadline (YYYY-MM-DD)', isDayOrNull(conf?.abstractDeadline)],
      ['deadline (YYYY-MM-DD)', isDayOrNull(conf?.deadline)],
      ['rebuttalDate (YYYY-MM-DD or YYYY-MM-DD–YYYY-MM-DD)', isDayOrNull(conf?.rebuttalDate) || Boolean(rebuttal && isIsoDay(rebuttal[1]) && isIsoDay(rebuttal[2]))],
      ['notificationDate (YYYY-MM-DD)', isDayOrNull(conf?.notificationDate)],
      ['link', isUrlOrNull(conf?.link)],
      ['seriesLink', isUrlOrNull(conf?.seriesLink)],
      ['acceptanceRate (percent)', conf?.acceptanceRate === null || conf?.acceptanceRate === undefined || (typeof conf.acceptanceRate === 'number' && conf.acceptanceRate > 0 && conf.acceptanceRate <= 100)],
      ['submissions', conf?.submissions === null || conf?.submissions === undefined || (Number.isInteger(conf.submissions) && conf.submissions > 0)],
      ['estimated', typeof conf?.estimated === 'boolean'],
      ['verified', typeof conf?.verified === 'boolean'],
      ['other', conf?.other === undefined || typeof conf.other === 'boolean'],
      ...['description', 'date', 'place', 'note', 'programChair', 'generalChair', 'area'].map(field => [field, stringOrNull(conf?.[field])]),
    ])];
  });
}

// ---- public/grants.json ----

const GRANT_FIELDS = new Set(['id', 'name', 'shortName', 'sponsor', 'sponsorCategory', 'targetAudience', 'whoFor', 'deadline',
  'deadlineMonth', 'amount', 'summary', 'eligibility', 'topics', 'url', 'featured', 'estimated', 'status', 'locations',
  'locationLabel', 'lastVerifiedAt']);
export const SPONSOR_CATEGORIES = ['Government', 'Industry', 'Non-Profit / Foundation', 'Professional Society'];
export const AUDIENCES = ['Faculty', 'PhD Students', "Master's Students", 'Undergraduate Students', 'Postdocs'];
const nonEmpty = value => typeof value === 'string' && value.length > 0;
const stringList = (value, allowed) => Array.isArray(value) && value.length > 0 && value.every(item => nonEmpty(item) && (!allowed || allowed.includes(item)));

export function grantProblems(grants) {
  if (!Array.isArray(grants)) return ['grants.json is not an array'];
  const seen = new Set();
  return grants.flatMap((grant, index) => {
    const label = typeof grant?.id === 'string' ? grant.id : `record #${index}`;
    const duplicate = seen.has(grant?.id) ? [`${label}: duplicate id`] : [];
    seen.add(grant?.id);
    return [...duplicate, ...recordProblems(label, grant ?? {}, GRANT_FIELDS, [
      ...['id', 'name', 'shortName', 'sponsor', 'whoFor', 'deadline', 'amount', 'summary'].map(field => [field, nonEmpty(grant?.[field])]),
      [`sponsorCategory (one of ${SPONSOR_CATEGORIES.join(' | ')})`, SPONSOR_CATEGORIES.includes(grant?.sponsorCategory)],
      [`targetAudience (non-empty, from ${AUDIENCES.join(' | ')})`, stringList(grant?.targetAudience, AUDIENCES)],
      ['deadlineMonth (0 = none, 1-12)', Number.isInteger(grant?.deadlineMonth) && grant.deadlineMonth >= 0 && grant.deadlineMonth <= 12],
      ['eligibility', stringList(grant?.eligibility)],
      ['topics', stringList(grant?.topics)],
      ['url (https)', typeof grant?.url === 'string' && grant.url.startsWith('https://') && isUrl(grant.url)],
      ['featured', grant?.featured === undefined || typeof grant.featured === 'boolean'],
      ['estimated', grant?.estimated === undefined || typeof grant.estimated === 'boolean'],
      ['status (omit, or "historical")', grant?.status === undefined || grant.status === 'historical'],
      ['locations', grant?.locations === undefined || stringList(grant.locations)],
      ['lastVerifiedAt (YYYY-MM-DD)', grant?.lastVerifiedAt === undefined || isIsoDay(grant.lastVerifiedAt)],
    ])];
  });
}

// ---- scripts/data/jobs-sources.json ----

const SOURCE_FIELDS = new Set(['school', 'homepage', 'facultyCount', 'jobsUrl', 'state', 'lastCheckedAt', 'outcome', 'summary',
  'checkedUrls', 'deferredUntil', 'relatedUnits', 'relatedCheckedAt', 'country', 'region', 'kind', 'csrankings']);
/** The crawl outcomes TASKS/jobs.md defines; null = never crawled. */
export const OUTCOMES = ['complete', 'incomplete', 'blocked', 'not_found'];
const REGIONS = ['northamerica', 'europe', 'asia', 'southamerica', 'australasia', 'africa'];

export function sourceProblems(sources) {
  if (!Array.isArray(sources)) return ['jobs-sources.json is not an array'];
  const seen = new Set();
  return sources.flatMap((source, index) => {
    const label = typeof source?.school === 'string' ? source.school : `row #${index}`;
    const duplicate = seen.has(source?.school) ? [`${label}: duplicate school`] : [];
    seen.add(source?.school);
    return [...duplicate, ...recordProblems(label, source ?? {}, SOURCE_FIELDS, [
      ['school', nonEmpty(source?.school)],
      [`outcome (null or one of ${OUTCOMES.join(' | ')})`, source?.outcome === null || OUTCOMES.includes(source?.outcome)],
      ['homepage', isUrlOrNull(source?.homepage)],
      ['jobsUrl', isUrlOrNull(source?.jobsUrl)],
      ['lastCheckedAt (YYYY-MM-DD or ISO time)', isTimeOrNull(source?.lastCheckedAt)],
      ['deferredUntil (YYYY-MM-DD or ISO time)', isTimeOrNull(source?.deferredUntil)],
      ['relatedCheckedAt (YYYY-MM-DD or ISO time)', isTimeOrNull(source?.relatedCheckedAt)],
      ['facultyCount', source?.facultyCount === null || (Number.isInteger(source?.facultyCount) && source.facultyCount >= 0)],
      ['country (2-letter code)', /^[A-Z]{2}$/.test(String(source?.country))],
      [`region (one of ${REGIONS.join(' | ')})`, REGIONS.includes(source?.region)],
      ['checkedUrls', Array.isArray(source?.checkedUrls) && source.checkedUrls.every(isUrl)],
      ['relatedUnits', Array.isArray(source?.relatedUnits)],
      ['csrankings', source?.csrankings === undefined || typeof source.csrankings === 'boolean'],
    ])];
  });
}

// ---- public/manual_affiliations.csv ----

export function manualAffiliationProblems(text) {
  const lines = String(text).split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (lines[0] !== 'name,school,start,end') return ['manual_affiliations.csv: header must be name,school,start,end'];
  return lines.slice(1).flatMap((line, index) => {
    const match = /^"([^"]+)","([^"]+)",(\d{4}),(\d{4})?$/.exec(line);
    if (!match) return [`manual_affiliations.csv row ${index + 1}: expected "name","school",start,end (end blank for a current position)`];
    return match[4] && Number(match[4]) < Number(match[3]) ? [`manual_affiliations.csv row ${index + 1}: end before start`] : [];
  });
}

// ---- warnings (npm run lint:data) ----

// Country-code domains that are widely used generically (hiring platforms, the EU), so they say nothing about the school.
const GENERIC_TLDS = new Set(['eu', 'io', 'im', 'ai', 'co', 'me', 'tv', 'ly', 'to', 'cc', 'gl']);

/** Last DNS label when it is a country code (".cn", ".vn"); null for .edu, .com, .org, and generic-use codes. */
function countryTld(url) {
  try {
    const label = new URL(url).hostname.split('.').pop();
    return label && label.length === 2 && !GENERIC_TLDS.has(label) ? label : null;
  } catch { return null; }
}

const titleKey = title => (String(title).toLowerCase().match(/[a-z0-9]+/g) || []).join(' ');

export function dataWarnings({ conferences = [], grants = [], sources = [], jobs = [], now = new Date() }) {
  const warnings = [];
  const year = now.getUTCFullYear();

  for (const conf of conferences) {
    if (conf.year < year) continue; // past editions are historical backfill
    const label = `conferences.json ${conf.name} ${conf.year}${conf.note ? ` (${conf.note})` : ''}`;
    const rebuttalStart = REBUTTAL_RANGE.exec(String(conf.rebuttalDate))?.[1] ?? conf.rebuttalDate;
    const order = [['abstractDeadline', conf.abstractDeadline], ['deadline', conf.deadline], ['rebuttalDate', rebuttalStart], ['notificationDate', conf.notificationDate]]
      .filter(([, value]) => isIsoDay(value));
    for (let index = 1; index < order.length; index++) {
      if (order[index][1] < order[index - 1][1]) warnings.push(`${label}: ${order[index][0]} ${order[index][1]} is before ${order[index - 1][0]} ${order[index - 1][1]}`);
    }
    for (const field of ['link', 'seriesLink']) if (String(conf[field] ?? '').startsWith('http://')) warnings.push(`${label}: ${field} is http (check for an https version)`);
  }

  for (const grant of grants) {
    if (grant.status === 'historical') continue;
    const years = (grant.deadline.match(/\b20\d{2}\b/g) || []).map(Number);
    if (years.length && Math.max(...years) < year - 1) warnings.push(`grants.json ${grant.id}: newest date in deadline is ${Math.max(...years)}; check whether the program still runs (else status: historical)`);
    if (/not (currently )?(being )?offered|discontinued|no longer (offered|accepting)|program (has )?ended/i.test(`${grant.deadline} ${grant.summary}`)) warnings.push(`grants.json ${grant.id}: text says the program is not offered; mark status: historical if the official page agrees`);
  }

  const homepages = new Map();
  for (const source of sources) {
    const label = `jobs-sources.json ${source.school}`;
    const home = countryTld(source.homepage);
    const jobsTld = countryTld(source.jobsUrl);
    if (jobsTld && home && jobsTld !== home && jobsTld !== String(source.country).toLowerCase() && !(jobsTld === 'uk' && source.country === 'GB')) {
      warnings.push(`${label}: jobsUrl is on .${jobsTld} but the school is in ${source.country} (wrong school?)`);
    }
    const key = String(source.homepage ?? '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
    if (key) {
      if (homepages.has(key)) warnings.push(`${label}: same homepage as ${homepages.get(key)} (duplicate school?)`);
      else homepages.set(key, source.school);
    }
    if (/github\.io|sites\.google\.com|linkedin\.com/.test(String(source.homepage))) warnings.push(`${label}: homepage looks personal, not the department`);
  }

  const open = jobs.filter(job => !job.closedAt);
  for (let i = 0; i < open.length; i++) {
    for (let k = i + 1; k < open.length; k++) {
      const [a, b] = [open[i], open[k]];
      if (a.school !== b.school || a.track !== b.track || (a.level ?? null) !== (b.level ?? null)) continue;
      // Departments often run several area searches with one deadline, so dates alone mean nothing; one search recorded
      // twice (department page + ATS) keeps the same title, department, and deadline.
      if (titleKey(a.title) === titleKey(b.title) && a.department === b.department && (a.deadline ?? null) === (b.deadline ?? null)) {
        warnings.push(`jobs.json ${a.id} / ${b.id}: same school, department, title, level, and deadline (one search posted twice?)`);
      }
    }
  }
  return warnings;
}

const readJson = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));

async function main() {
  const [conferences, grants, sources, jobs, manual] = await Promise.all([
    readJson('../csconfs/data/conferences.json'), readJson('../public/grants.json'), readJson('./data/jobs-sources.json'),
    readJson('../public/jobs.json'), fs.readFile(new URL('../public/manual_affiliations.csv', import.meta.url), 'utf8'),
  ]);
  const errors = [...conferenceProblems(conferences), ...grantProblems(grants), ...sourceProblems(sources), ...manualAffiliationProblems(manual)];
  const warnings = dataWarnings({ conferences, grants, sources, jobs });
  for (const line of errors) console.error(`error: ${line}`);
  for (const line of warnings) console.log(`warning: ${line}`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s). Errors fail npm test; warnings are for the auditor (TASKS/audit.md).`);
  if (errors.length) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) await main();
