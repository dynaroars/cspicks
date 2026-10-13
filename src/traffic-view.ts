/**
 * Shared visitor-traffic view for the /api/stats Worker (src/worker.ts), which serves every roars.dev site.
 * Used by VietProfs' stats page and copied verbatim into cspicks (src/traffic-view.ts): keep it free of
 * site-specific imports and wording, and pass anything site-specific in through the render options.
 */

export interface DailyBrowserStat {
  date: string;
  pageViews: number | null;
  visits: number | null;
  status: 'complete' | 'partial' | 'missing';
}

export interface BrowserStatsResponse {
  schemaVersion: 3;
  source: 'cloudflare-rum';
  generatedAt: string;
  servedAt?: string;
  timezone: 'UTC';
  status: 'ok' | 'stale' | 'demo';
  stale: boolean;
  notice?: string;
  measurementStartedAt: string | null;
  coverage: { firstDate: string | null; lastCompleteDate: string; completeDays7: number; availableDays30: number };
  today: { date: string; pageViews: number | null; visits: number | null; complete: false; collected: boolean };
  last7Complete: { pageViews: number; visits: number; days: number; avgPageViews: number | null; avgVisits: number | null };
  last30Available: { pageViews: number; visits: number; days: number };
  daily: DailyBrowserStat[];
  countries: Array<{ code: string; name: string; flag: string; pageViews: number; pct: number }>;
  categories: Array<{ key: string; label: string; pageViews: number; pct: number }>;
  categoryTotal: number;
  categoryPeriod: { startDate: string; endDate: string; days: number };
  historicalTransition: { newSeriesStartedAt: string | null; oldSeriesRetainedInternally: true };
  isDemo?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function formatNumber(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

export function formatDate(value: string | null, withYear = true, withWeekday = false): string {
  if (!value) return 'Not available';
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { weekday: withWeekday ? 'short' : undefined, month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' }).format(date);
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(date)} UTC`;
}

function days(count: number, noun = 'complete day'): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function renderMetrics(data: BrowserStatsResponse): string {
  const countries = data.countries.filter(country => country.pageViews > 0).length;
  const week = days(data.last7Complete.days);
  const today = data.today.collected ? ` · ${formatNumber(data.today.pageViews)} today so far` : '';
  const cards: Array<[label: string, value: string, detail: string]> = [
    ['Average daily page views', formatNumber(data.last7Complete.avgPageViews), `${week}${today}`],
    ['Browser page views', formatNumber(data.last7Complete.pageViews), week],
    ['Browser visits', formatNumber(data.last7Complete.visits), `${week} · not unique people · excludes direct mobile Chrome`],
    ['Countries reached', formatNumber(countries), week],
  ];
  return `<div class="browser-metric-grid">${cards.map(([label, value, detail]) => `<article class="browser-metric-card">
    <p class="browser-metric-label">${escapeHtml(label)}</p>
    <p class="browser-metric-value">${escapeHtml(value)}</p>
    <p class="browser-metric-detail">${escapeHtml(detail)}</p>
  </article>`).join('')}</div>`;
}

export function renderChart(daily: DailyBrowserStat[]): string {
  const available = daily.filter(row => row.pageViews !== null);
  if (!available.length) return '<p class="no-data">No browser-traffic days have been collected yet.</p>';
  const width = 800;
  const height = 230;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maximum = Math.max(1, ...available.map(row => row.pageViews || 0));
  const segments: string[] = [];
  let active: string[] = [];
  daily.forEach((row, index) => {
    if (row.pageViews === null) {
      if (active.length) segments.push(active.join(' '));
      active = [];
      return;
    }
    const x = left + index / Math.max(1, daily.length - 1) * chartWidth;
    const y = top + chartHeight - row.pageViews / maximum * chartHeight;
    active.push(`${active.length ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  });
  if (active.length) segments.push(active.join(' '));
  const grid = [0, 0.25, 0.5, 0.75, 1].map(fraction => {
    const y = top + chartHeight - fraction * chartHeight;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3 3"/><text x="${left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="currentColor" opacity="0.65">${Math.round(maximum * fraction)}</text>`;
  }).join('');
  const labelStep = Math.max(1, Math.ceil(daily.length / 6));
  const labels = daily.map((row, index) => {
    if (index % labelStep !== 0 && index !== daily.length - 1) return '';
    const x = left + index / Math.max(1, daily.length - 1) * chartWidth;
    const suffix = row.status === 'partial' ? '*' : '';
    return `<text x="${x}" y="${height - 12}" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.65">${escapeHtml(formatDate(row.date, false) + suffix)}</text>`;
  }).join('');
  return `<div class="stats-chart-container">
    <p class="chart-legend"><span class="legend-item"><span class="legend-dot dot-views"></span> Browser page views</span></p>
    <div class="svg-wrap"><svg viewBox="0 0 ${width} ${height}" class="stats-svg" role="img" aria-label="Daily browser page views" preserveAspectRatio="xMidYMid meet">${grid}${segments.map(path => `<path d="${path}" class="path-views" fill="none" stroke-width="2.5"/>`).join('')}${labels}</svg></div>
  </div>`;
}

export function renderDailyTable(daily: DailyBrowserStat[]): string {
  return `<details class="stats-secondary-details"><summary><strong>View day-by-day browser traffic</strong></summary>
    <div class="stats-table-wrapper"><table class="stats-table"><thead><tr><th>Date (UTC)</th><th class="num-col">Page views</th><th class="num-col">Browser visits</th></tr></thead>
    <tbody>${[...daily].reverse().map(row => `<tr class="${row.status === 'partial' ? 'partial-row' : ''}">
      <td><strong>${escapeHtml(formatDate(row.date, true, true))}</strong>${row.status === 'partial' ? ' (In progress)' : ''}</td><td class="num-col">${formatNumber(row.pageViews)}</td><td class="num-col">${formatNumber(row.visits)}</td></tr>`).join('')}</tbody></table></div>
  </details>`;
}

export function renderCountries(data: BrowserStatsResponse): string {
  const rows = data.countries.filter(country => country.pageViews > 0);
  const intro = `<p class="stat-sub">Based only on browser page views during the last ${days(data.last7Complete.days, 'complete UTC day')}.</p>`;
  if (!rows.length) return `${intro}<p class="no-data">No country-level browser data is available for this period.</p>`;
  return `${intro}<div class="stats-table-wrapper"><table class="stats-table"><thead><tr><th>Country</th><th class="num-col">Browser page views</th><th class="num-col">Share</th></tr></thead>
    <tbody>${rows.map(country => `<tr><td><span class="country-cell"><span class="flag-icon" aria-hidden="true">${escapeHtml(country.flag)}</span><span>${escapeHtml(country.name)}</span></span></td><td class="num-col">${formatNumber(country.pageViews)}</td><td class="num-col">${country.pct.toFixed(1)}%</td></tr>`).join('')}</tbody></table></div>`;
}

export function renderCategories(data: BrowserStatsResponse): string {
  const total = data.categoryTotal;
  const rows = data.categories.map(category => `<tr><td>${escapeHtml(category.label)}</td><td class="num-col">${formatNumber(category.pageViews)}</td><td class="num-col">${category.pct.toFixed(1)}%</td></tr>`).join('');
  return `<p class="stat-sub">Page categories for ${escapeHtml(formatDate(data.categoryPeriod.startDate))}–${escapeHtml(formatDate(data.categoryPeriod.endDate))}. Cloudflare's path aggregation counted ${formatNumber(total)} browser page views; its independently aggregated daily total may differ slightly.</p>
    <div class="stats-table-wrapper"><table class="stats-table"><thead><tr><th>Page category</th><th class="num-col">Browser page views</th><th class="num-col">Share</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderNotice(data: BrowserStatsResponse): string {
  if (data.stale) return `<div class="stats-status-notice stats-status-warning" role="status"><strong>Data temporarily unavailable.</strong> ${escapeHtml(data.notice || 'Showing the last successful snapshot.')}</div>`;
  if (data.isDemo) return '<div class="stats-status-notice" role="status"><strong>Preview data.</strong> Cloudflare credentials are not configured in this environment.</div>';
  return '';
}

/** `seriesNote` is trusted HTML appended to the paragraph, for anything about this site's own history. */
export function renderMethodology(seriesNote = ''): string {
  return `<div class="privacy-note">
    <p>These statistics come from privacy-preserving Cloudflare Web Analytics browser beacons, not raw server logs — no cookies, IPs, or individual visitor records are collected. Crawlers Cloudflare recognizes are excluded, and readers who block JavaScript go uncounted. A "page view" is a browser load; a "visit" is a page view that arrived from another site or directly rather than from another page here, so it is not a unique-visitor count. Since Oct 2, 2026, an automated crawler posing as mobile Chrome has been loading pages directly, so mobile-Chrome page loads count only when another site linked to them; real visitors who reach the site directly on mobile Chrome are not counted. Dates use complete UTC days only.${seriesNote ? ` ${seriesNote}` : ''}</p>
  </div>`;
}

export function renderLoadError(message: string): string {
  return `<div class="stats-error-box" role="alert"><p class="error-title">Browser statistics are temporarily unavailable.</p><p class="error-detail">${escapeHtml(message)}</p><button type="button" id="retry-btn" class="retry-btn">Retry</button></div>`;
}

/** Tries each endpoint in turn (same-origin first, then the production host for local previews). */
export async function fetchTrafficStats(endpoints: string[], force = false): Promise<BrowserStatsResponse> {
  let lastError = new Error('Unable to connect to the statistics service.');
  for (const endpoint of endpoints) {
    try {
      const url = force ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}refresh=${Date.now()}` : endpoint;
      const response = await fetch(url, { cache: force ? 'no-store' : 'default' });
      const body = await response.json() as BrowserStatsResponse & { error?: string; detail?: string };
      if (!response.ok) throw new Error([body.error, body.detail].filter(Boolean).join(' — ') || `HTTP ${response.status}`);
      if (body.schemaVersion !== 3 || body.source !== 'cloudflare-rum') throw new Error('The statistics service returned an unsupported or request-based dataset.');
      return body;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError;
}
