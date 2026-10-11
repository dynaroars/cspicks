/**
 * Stats page: what CS Picks tracks (faculty, universities, conferences, awards, jobs) and repository activity.
 * It deliberately skips the 14 MB NSF snapshot so the page stays fast.
 * The summarize* functions are pure so unit tests can check them; the page controller at the bottom only runs in a browser.
 */
import { DEFAULT_END_YEAR, DEFAULT_START_YEAR, filterByYears, loadData } from './data.js';
import { numAreas } from './data/conference-sets.js';
import { loadGrantsData } from './grants/grants-data.js';
import { isActive, loadJobsData } from './jobs/jobs-data.js';
import { calculateParityReport } from './metrics.js';
import { escapeHtml, formatRelativeTime } from './shared.js';
import type { ConferenceRecord, Grant, Job, RawData } from './types.js';

export interface Stat { label: string, value: string, note?: string, help?: string }

const count = (n: number) => n.toLocaleString('en-US');
const percent = (part: number, whole: number) => whole ? `${Math.round(part / whole * 100)}%` : '0%';

export function summarizeRoster(data: RawData): Stat[] {
  const professors = Object.values(data.professors);
  const schools = Object.values(data.schools);
  const active = professors.filter(prof => prof.pubs.length > 0).length;
  const countries = new Set(schools.map(school => school.country).filter(Boolean)).size;
  const us = schools.filter(school => school.country === 'us').length;
  return [
    { label: 'Faculty', value: count(active), note: `${count(professors.length)} on the CSRankings roster`, help: 'Faculty with at least one CSRankings-tracked publication.' },
    { label: 'Universities', value: count(schools.length), note: `${count(us)} in the US`, help: 'Institutions listed in CSRankings.' },
    { label: 'Countries', value: count(countries), help: 'Countries with at least one listed institution.' },
    { label: 'Research areas', value: count(numAreas), help: 'CSRankings top-level research areas.' }
  ];
}

/** Recomputes the US ranking with CSRankings' default rules and checks it is internally consistent. */
export function summarizeDataChecks(data: RawData): Stat[] {
  const filtered = filterByYears(data, DEFAULT_START_YEAR, DEFAULT_END_YEAR, 'us', null, null, 'csrankings-default');
  const report = calculateParityReport(data, filtered, 'csrankings-default');
  return [
    { label: 'Matches CSRankings default', value: report.matchesCsrankings ? 'Yes' : 'No', note: `US, ${DEFAULT_START_YEAR}–${DEFAULT_END_YEAR}`, help: 'Rankings recomputed with the official default venues and current affiliations have no total or rank-order inconsistencies.' },
    { label: 'Institution metadata', value: `${report.institutionCoverage.toFixed(0)}%`, note: 'country or region present' },
    { label: 'Author profile links', value: `${report.profileCoverage.toFixed(0)}%`, note: 'homepage or Scholar ID' }
  ];
}

export function summarizeConferences(conferences: ConferenceRecord[], now = Date.now()): Stat[] {
  const editions = new Set(conferences.map(conf => `${conf.name}|${conf.year}`));
  const verified = new Set(conferences.filter(conf => conf.verified).map(conf => `${conf.name}|${conf.year}`));
  const today = new Date(now).toISOString().slice(0, 10);
  const upcoming = conferences.filter(conf => typeof conf.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(conf.deadline) && conf.deadline >= today).length;
  return [
    { label: 'Conference series', value: count(new Set(conferences.map(conf => conf.name)).size) },
    { label: 'Editions', value: count(editions.size), note: `${percent(verified.size, editions.size)} verified on official sites` },
    { label: 'Upcoming deadlines', value: count(upcoming), note: 'submission cycles not yet passed' }
  ];
}

export function summarizeGrants(grants: Grant[]): Stat[] {
  const historical = grants.filter(grant => grant.status === 'historical').length;
  return [
    { label: 'Awards & grants', value: count(grants.length), note: `${count(grants.length - historical)} current, ${count(historical)} historical` },
    { label: 'Sponsors', value: count(new Set(grants.map(grant => grant.sponsor)).size) }
  ];
}

export function summarizeJobs(jobs: Job[], now = Date.now()): Stat[] {
  const active = jobs.filter(job => isActive(job, now));
  return [
    { label: 'Active job postings', value: count(active.length), note: `${count(jobs.length)} listed including closed` },
    { label: 'Hiring schools', value: count(new Set(active.map(job => job.school)).size), note: `in ${count(new Set(active.map(job => job.state)).size)} states` }
  ];
}

export interface RepoCommit { sha: string, message: string, author: string, date: string, url: string }

/** Total item count from a GitHub `per_page=1` response's Link header (the `last` page number). */
export function countFromLink(link: string | null, fallback: number) {
  const match = link?.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return match ? Number(match[1]) : fallback;
}

export function renderStatGrid(stats: Stat[]) {
  return `<div class="diagnostic-grid stats-grid">${stats.map(stat => `<div class="diagnostic-stat${stat.help ? ' tooltip-trigger' : ''}">
    <span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(stat.value)}</strong>${stat.note ? `<small>${escapeHtml(stat.note)}</small>` : ''}
    ${stat.help ? `<span class="tooltip-content" role="tooltip">${escapeHtml(stat.help)}</span>` : ''}
  </div>`).join('')}</div>`;
}

export function renderCommits(commits: RepoCommit[], now = Date.now()) {
  return `<ol class="stats-commits">${commits.map(commit => `<li>
    <a href="${escapeHtml(commit.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(commit.message)}</a>
    <small><code>${escapeHtml(commit.sha.slice(0, 7))}</code> · ${escapeHtml(commit.author)} · ${escapeHtml(formatRelativeTime(commit.date, now))}</small>
  </li>`).join('')}</ol>`;
}

const REPO_API = 'https://api.github.com/repos/dynaroars/cspicks';

async function githubJson(path: string) {
  const response = await fetch(`${REPO_API}${path}`);
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return { body: await response.json(), link: response.headers.get('Link') };
}

async function loadRepoStats() {
  const [repo, recent, total, contributors] = await Promise.all([
    githubJson(''), githubJson('/commits?per_page=8'), githubJson('/commits?per_page=1'), githubJson('/contributors?per_page=1&anon=true')
  ]);
  type ApiCommit = { sha: string, html_url: string, commit: { message: string, author?: { name?: string, date?: string }, committer?: { date?: string } } };
  const commits: RepoCommit[] = (recent.body as ApiCommit[]).map(item => ({
    sha: item.sha,
    message: item.commit.message.split('\n')[0] || '',
    author: item.commit.author?.name || 'unknown',
    date: item.commit.committer?.date || item.commit.author?.date || '',
    url: item.html_url
  }));
  const info = repo.body as { stargazers_count: number, forks_count: number, open_issues_count: number, created_at: string };
  const stats: Stat[] = [
    { label: 'Commits', value: count(countFromLink(total.link, commits.length)), note: `since ${info.created_at.slice(0, 10)}` },
    { label: 'Contributors', value: count(countFromLink(contributors.link, (contributors.body as unknown[]).length)) },
    { label: 'Last commit', value: commits[0] ? formatRelativeTime(commits[0].date) : 'Unknown' },
    { label: 'Open issues & PRs', value: count(info.open_issues_count), note: `${count(info.stargazers_count)} stars · ${count(info.forks_count)} forks` }
  ];
  return { stats, commits };
}

function fill(id: string, html: string) {
  const element = document.getElementById(id);
  if (element) element.innerHTML = html;
}

function section<T>(id: string, load: Promise<T>, render: (value: T) => string) {
  return load
    .then(value => fill(id, render(value)))
    .catch(error => {
      console.error(`Stats section ${id} failed:`, error);
      fill(id, '<p class="load-error">This section could not be loaded. Please try again later.</p>');
    });
}

async function fetchJson(url: URL | string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function init() {
  const roster = loadData();
  section('stats-roster', roster, data => renderStatGrid(summarizeRoster(data)));
  section('stats-checks', roster, data => renderStatGrid(summarizeDataChecks(data)));
  section('stats-confs', fetchJson(new URL('../csconfs/data/conferences.json', import.meta.url)), confs => renderStatGrid(summarizeConferences(confs as ConferenceRecord[])));
  section('stats-grants', loadGrantsData(), grants => renderStatGrid(summarizeGrants(grants)));
  section('stats-jobs', loadJobsData(), jobs => renderStatGrid(summarizeJobs(jobs)));
  section('stats-repo', loadRepoStats(), ({ stats, commits }) => `${renderStatGrid(stats)}<h3>Recent commits</h3>${renderCommits(commits)}`);
}

if (typeof document !== 'undefined' && document.getElementById('stats-roster')) init();
