/**
 * Stats page: what CS Picks tracks (faculty, universities, conferences, awards, jobs), data health and completeness
 * (mirrors VietProfs' `?view=health`), and repository activity. It deliberately skips the 14 MB NSF snapshot so the page stays fast.
 * The summarize* functions are pure so unit tests can check them; the page controller at the bottom only runs in a browser.
 */
import { loadData } from './data.js';
import { numAreas } from './data/conference-sets.js';
import { loadGrantsData } from './grants/grants-data.js';
import { isActive, loadJobsData } from './jobs/jobs-data.js';
import { escapeHtml, formatRelativeTime } from './shared.js';
import type { Chart } from 'chart.js';
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
    { label: 'Faculty', value: count(active), note: 'with papers in tracked venues', help: 'Faculty with at least one paper in a tracked conference. Alternate name spellings and people without tracked papers are not counted.' },
    { label: 'Universities', value: count(schools.length), note: `${count(us)} in the US` },
    { label: 'Countries', value: count(countries), help: 'Countries with at least one listed institution.' },
    { label: 'Research areas', value: count(numAreas) }
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
    { label: 'Hiring universities', value: count(new Set(active.map(job => job.school)).size), note: `in ${count(new Set(active.map(job => job.state)).size)} states` }
  ];
}

// ==== Data health & completeness ====

const DAY = 86400000;

export interface Completeness { label: string, count: number, total: number, description: string }

/** Crawl freshness and daily dataset snapshots, written at build time by scripts/build-stats-history.mjs. */
export interface CrawlFreshness { schools: number, withHiringUrl: number, checked7: number, checked30: number, checked90: number }
export interface HistoryPoint { date: string, activeJobs: number | null, grants: number | null, conferences: number | null, crawledSchools: number | null, codeLines: number }
export interface StatsHistory { generatedAt: string, crawl: CrawlFreshness, history: HistoryPoint[] }
export interface SeoPages { schools: number, areas: number }

function metric<T>(label: string, items: T[], has: (item: T) => unknown, description: string): Completeness {
  return { label, count: items.filter(has).length, total: items.length, description };
}
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function rosterCompleteness(data: RawData): Completeness[] {
  const active = Object.values(data.professors).filter(prof => prof.pubs.length > 0);
  return [
    metric('Faculty homepages', active, prof => prof.homepage, 'Faculty with papers in tracked venues who list a homepage.'),
    metric('Google Scholar profiles', active, prof => prof.scholarid && prof.scholarid !== 'NOSCHOLARPAGE', 'Faculty linked to a Google Scholar profile.'),
    metric('ORCID iDs', active, prof => prof.orcid, 'Faculty with a well-formed ORCID iD.')
  ];
}

export function conferenceCompleteness(conferences: ConferenceRecord[], now = Date.now()): Completeness[] {
  const year = new Date(now).getUTCFullYear();
  const upcoming = conferences.filter(conf => conf.year >= year);
  const past = conferences.filter(conf => conf.year < year);
  return [
    metric('Upcoming editions verified', upcoming, conf => conf.verified, `Editions from ${year} on whose dates were checked on the official site.`),
    metric('Upcoming exact deadlines', upcoming, conf => isDate(conf.deadline) && !conf.estimated, 'Editions from this year on with an announced (not estimated) paper deadline.'),
    metric('Past acceptance rates', past, conf => conf.acceptanceRate != null, `Editions before ${year} with a published acceptance rate.`)
  ];
}

export function jobCompleteness(jobs: Job[], now = Date.now()): Completeness[] {
  const active = jobs.filter(job => isActive(job, now));
  return [
    metric('Deadlines stated', active, job => isDate(job.deadline) || job.rolling, 'Active postings with an application deadline or rolling review.'),
    metric('Research areas tagged', active, job => job.areas.length || job.anyArea, 'Active postings tagged with research areas, or open to any area.'),
    metric('Visa sponsorship stated', active, job => job.visaSponsorship && job.visaSponsorship !== 'not-stated', 'Active postings that say whether they sponsor visas.'),
    metric('Confirmed in 30 days', active, job => now - Date.parse(job.lastSeenAt) <= 30 * DAY, 'Active postings re-read on the hiring page in the past 30 days.')
  ];
}

export function grantCompleteness(grants: Grant[]): Completeness[] {
  const current = grants.filter(grant => grant.status !== 'historical');
  return [metric('Award amounts stated', current, grant => grant.amount && !/^not (announced|stated)|^varies|^unknown|^tbd/i.test(grant.amount), 'Current awards and grants whose listing states an amount, prize, or honor.')];
}

export function crawlCompleteness(crawl: CrawlFreshness): Completeness[] {
  return [
    { label: 'Hiring pages on file', count: crawl.withHiringUrl, total: crawl.schools, description: 'Schools in the jobs crawl with a recorded faculty-hiring page.' },
    { label: 'Schools crawled in 90 days', count: crawl.checked90, total: crawl.schools, description: 'Schools whose hiring pages the jobs crawl read in the past 90 days (as of the last site build).' }
  ];
}

const pct = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : 0;

export function renderCompleteness(metrics: Completeness[]) {
  return `<div class="completeness-grid">${metrics.map(m => `<div class="completeness-card">
    <div class="completeness-header"><span class="completeness-label">${escapeHtml(m.label)}</span><strong class="completeness-pct">${pct(m.count, m.total)}%</strong></div>
    <div class="progress-bar-bg" role="progressbar" aria-label="${escapeHtml(m.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(m.count, m.total)}"><div class="progress-bar-fill" style="width: ${pct(m.count, m.total)}%"></div></div>
    <div class="completeness-meta"><span>${count(m.count)} of ${count(m.total)} records</span><span class="completeness-desc">${escapeHtml(m.description)}</span></div>
  </div>`).join('')}</div>`;
}

/** The pulse badge: postings confirmed recently and hiring pages crawled this week. */
export function renderRecentUpdates(jobs: Job[] | null, crawl: CrawlFreshness | null, now = Date.now()) {
  const parts: string[] = [];
  if (jobs) {
    const seen = (days: number) => jobs.filter(job => now - Date.parse(job.lastSeenAt) <= days * DAY).length;
    if (seen(30)) parts.push(`<strong>${count(seen(30))} job postings</strong> confirmed on hiring pages in the past 30 days (${count(seen(7))} this week)`);
  }
  if (crawl?.checked7) parts.push(`<strong>${count(crawl.checked7)} schools</strong> crawled this week`);
  if (!parts.length) return '';
  return `<div class="recent-updates-badge"><span class="pulse-dot" aria-hidden="true"></span><span>${parts.join('; ')}.</span><a class="recent-updates-link" href="jobs.html?sort=posted">Browse recent jobs →</a></div>`;
}

/** Standalone pages (one per vite.config.js input) plus the static SEO pages scripts/generate-seo-pages.mjs writes. */
export const STANDALONE_PAGES: [string, string][] = [
  ['index.html', 'Search'], ['simulator.html', 'Simulator'], ['csconfs.html', 'CS Confs'], ['grants.html', 'Awards & Grants'],
  ['jobs.html', 'Jobs'], ['nsf.html', 'NSF Funding'], ['stats.html', 'Stats'], ['csconfs-submit.html', 'Conference form'],
  ['grants-submit.html', 'Award form'], ['jobs-submit.html', 'Job form']
];

export function renderInventory(seo: SeoPages | null) {
  const items: [number, string][] = [[STANDALONE_PAGES.length, 'Interactive pages']];
  if (seo) items.push([seo.schools, 'University pages'], [seo.areas, 'Research-area pages']);
  const total = items.reduce((sum, [n]) => sum + n, 0);
  return `<div class="html-inventory-card">
    <div class="html-inventory-header">
      <div><h4 class="html-inventory-title">Generated HTML inventory</h4><p class="html-inventory-desc">Static university and research-area pages are built from the default ranking for search engines and link previews.</p></div>
      <strong class="html-inventory-total">${count(total)} pages</strong>
    </div>
    <div class="html-inventory-grid">${items.map(([n, label]) => `<div class="html-inventory-item"><strong>${count(n)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>
    <nav class="html-standalone-links" aria-label="Interactive pages"><span>${STANDALONE_PAGES.length} interactive:</span>${STANDALONE_PAGES.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join('')}</nav>
  </div>`;
}

export type GrowthMetric = Exclude<keyof HistoryPoint, 'date'>;
export const GROWTH_METRICS: Record<GrowthMetric, { label: string, description: string }> = {
  activeJobs: { label: 'Active jobs', description: 'Job postings still open on each day' },
  conferences: { label: 'Conference editions', description: 'Conference editions in the schedule' },
  grants: { label: 'Awards & grants', description: 'Current awards, fellowships, and grants' },
  crawledSchools: { label: 'Crawled schools', description: 'Schools whose hiring pages the jobs crawl has read' },
  codeLines: { label: 'Source lines', description: 'Application source lines in src/ (TypeScript, CSS, HTML)' }
};

/** The days a metric was tracked: its points from the first non-null value on. */
export function growthSeries(history: HistoryPoint[], key: GrowthMetric) {
  const start = history.findIndex(point => point[key] != null);
  return start < 0 ? [] : history.slice(start).map(point => ({ date: point.date, value: point[key] }));
}

function formatChange(first: number, last: number) {
  const delta = first > 0 ? Math.round((last - first) / first * 100) : last - first;
  return `${delta >= 0 ? '+' : ''}${delta.toLocaleString('en-US')}${first > 0 ? '%' : ''}`;
}

export function renderGrowth(history: HistoryPoint[], active: GrowthMetric) {
  const buttons = (Object.keys(GROWTH_METRICS) as GrowthMetric[]).map(key => {
    const series = growthSeries(history, key);
    if (series.length < 2) return '';
    const first = series[0]!.value ?? 0;
    const last = series.at(-1)!.value ?? 0;
    return `<button type="button" class="growth-metric-btn${key === active ? ' is-active' : ''}" data-metric="${key}" aria-pressed="${key === active}">
      <span class="growth-metric-label">${escapeHtml(GROWTH_METRICS[key].label)}</span><span class="growth-metric-val">${count(last)}</span><span class="growth-metric-badge">${formatChange(first, last)}</span>
    </button>`;
  }).join('');
  const series = growthSeries(history, active);
  if (!buttons || series.length < 2) return '';
  return `<div class="health-growth-section">
    <h4>Growth history</h4>
    <p class="health-caption">${escapeHtml(GROWTH_METRICS[active].description)}, ${escapeHtml(series[0]!.date)} to ${escapeHtml(series.at(-1)!.date)}; daily repository snapshots, so these describe what CS Picks holds, not the job market.</p>
    <div class="growth-metrics-bar" role="group" aria-label="Growth metrics">${buttons}</div>
    <div class="growth-chart-wrap"><canvas id="growth-chart" role="img" aria-label="Line chart of ${escapeHtml(GROWTH_METRICS[active].label)} over time"></canvas></div>
  </div>`;
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

async function fetchOptionalJson<T>(url: URL | string): Promise<T | null> {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

/** Completeness cards from whichever sources loaded; a failed source just drops its cards. */
async function renderHealth(roster: Promise<RawData>, confs: Promise<ConferenceRecord[]>, grants: Promise<Grant[]>, jobs: Promise<Job[]>) {
  const settle = <T>(promise: Promise<T>) => promise.then(value => value, () => null);
  const [rosterData, confData, grantData, jobData, stats, seo] = await Promise.all([
    settle(roster), settle(confs), settle(grants), settle(jobs),
    fetchOptionalJson<StatsHistory>(new URL('/stats-history.json', location.href)),
    fetchOptionalJson<SeoPages>(new URL('/seo-pages.json', location.href))
  ]);
  const metrics = [
    ...(rosterData ? rosterCompleteness(rosterData) : []),
    ...(confData ? conferenceCompleteness(confData) : []),
    ...(jobData ? jobCompleteness(jobData) : []),
    ...(grantData ? grantCompleteness(grantData) : []),
    ...(stats ? crawlCompleteness(stats.crawl) : [])
  ];
  if (!metrics.length) throw new Error('no data source loaded');
  fill('stats-health', `${renderRecentUpdates(jobData, stats?.crawl ?? null)}${renderCompleteness(metrics)}${renderInventory(seo)}${stats ? renderGrowth(stats.history, 'activeJobs') : ''}`);
  if (stats) wireGrowth(stats.history);
}

function wireGrowth(history: HistoryPoint[]) {
  let chart: Chart | null = null;
  let active: GrowthMetric = 'activeJobs';
  let themeWired = false;
  const draw = async () => {
    const { drawChart, onThemeChange } = await import('./charts.js');
    const series = growthSeries(history, active);
    chart = drawChart('growth-chart', chart, {
      type: 'line',
      data: { labels: series.map(point => point.date), datasets: [{ label: GROWTH_METRICS[active].label, data: series.map(point => point.value), fill: true, tension: 0.25, pointRadius: 0, pointHitRadius: 8, borderWidth: 2, borderColor: '#2e9e64', backgroundColor: 'rgba(46, 158, 100, 0.12)' }] },
      options: { plugins: { legend: { display: false } }, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { beginAtZero: false } } }
    });
    if (!themeWired) { themeWired = true; onThemeChange(() => void draw()); }
  };
  document.getElementById('stats-health')?.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.growth-metric-btn');
    if (!button?.dataset.metric || button.dataset.metric === active) return;
    active = button.dataset.metric as GrowthMetric;
    const section = document.querySelector('.health-growth-section');
    if (section) section.outerHTML = renderGrowth(history, active);
    void draw();
  });
  if (document.getElementById('growth-chart')) void draw();
}

function init() {
  const roster = loadData();
  const confs = fetchJson(new URL('../csconfs/data/conferences.json', import.meta.url)) as Promise<ConferenceRecord[]>;
  const grants = loadGrantsData();
  const jobs = loadJobsData();
  section('stats-roster', roster, data => renderStatGrid(summarizeRoster(data)));
  section('stats-confs', confs, confData => renderStatGrid(summarizeConferences(confData)));
  section('stats-grants', grants, grantData => renderStatGrid(summarizeGrants(grantData)));
  section('stats-jobs', jobs, jobData => renderStatGrid(summarizeJobs(jobData)));
  renderHealth(roster, confs, grants, jobs).catch(error => {
    console.error('Stats section stats-health failed:', error);
    fill('stats-health', '<p class="load-error">This section could not be loaded. Please try again later.</p>');
  });
  section('stats-repo', loadRepoStats(), ({ stats, commits }) => `${renderStatGrid(stats)}<h3>Recent commits</h3>${renderCommits(commits)}`);
}

if (typeof document !== 'undefined' && document.getElementById('stats-roster')) init();
