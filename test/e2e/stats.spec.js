import { expect, test } from '@playwright/test';

const PAGES = ['index.html', 'simulator.html', 'csconfs.html', 'csconfs-submit.html', 'grants.html', 'grants-submit.html', 'jobs.html', 'jobs-submit.html', 'nsf.html', 'stats.html'];

const csrankings = `name,affiliation,homepage,scholarid,orcid
Alice Example,George Mason University,https://example.test/alice,alice,0000-0000-0000-0001
Bob Example,University of Oxford,https://example.test/bob,bob,0000-0000-0000-0002
Idle Example,George Mason University,,,
`;
const authorInfo = `name,area,year,count,adjustedcount
Alice Example,icse,2025,2,1
Bob Example,pldi,2024,1,0.5
`;
const institutions = `institution,region,countryabbrv,homepage
George Mason University,northamerica,us,https://cs.gmu.test/
University of Oxford,europe,uk,https://cs.oxford.test/
`;
const jobs = [
  { id: 'a', school: 'George Mason University', department: 'CS', title: 'Assistant Professor', track: 'tenure-track', level: 'assistant', areas: [], state: 'VA', deadline: '2099-01-01', lastSeenAt: '2026-10-01', url: 'https://example.test/a', source: 'crawl', verified: true },
  { id: 'b', school: 'George Mason University', department: 'CS', title: 'Lecturer', track: 'teaching', level: null, areas: [], state: 'VA', deadline: '2020-01-01', lastSeenAt: '2020-01-01', url: 'https://example.test/b', source: 'crawl', verified: true }
];
const grants = [
  { id: 'g1', name: 'Grant One', shortName: 'G1', sponsor: 'NSF', sponsorCategory: 'Government', targetAudience: ['Faculty'], whoFor: 'Faculty', deadline: 'Annual', deadlineMonth: 1, amount: '$1', summary: 's', eligibility: [], topics: [], url: 'https://example.test/g1' },
  { id: 'g2', name: 'Grant Two', shortName: 'G2', sponsor: 'Google', sponsorCategory: 'Industry', targetAudience: ['Faculty'], whoFor: 'Faculty', deadline: 'Annual', deadlineMonth: 2, amount: '$2', summary: 's', eligibility: [], topics: [], url: 'https://example.test/g2', status: 'historical' }
];
const conferences = [
  { name: 'PLDI', year: 2099, venueKeys: ['pldi'], verified: true, deadline: '2098-11-01' },
  { name: 'ICSE', year: 2020, venueKeys: ['icse'], verified: false, deadline: '2019-08-01' }
];
const commit = (n, message) => ({ sha: `${n}`.repeat(40).slice(0, 40), html_url: `https://github.com/dynaroars/cspicks/commit/${n}`, commit: { message, author: { name: 'Tester', date: new Date(Date.now() - 3600000).toISOString() }, committer: { date: new Date(Date.now() - 3600000).toISOString() } } });

const traffic = {
  schemaVersion: 3, source: 'cloudflare-rum', generatedAt: '2026-10-13T12:00:00.000Z', timezone: 'UTC', status: 'ok', stale: false,
  measurementStartedAt: '2026-10-06',
  coverage: { firstDate: '2026-10-06', lastCompleteDate: '2026-10-12', completeDays7: 7, availableDays30: 7 },
  today: { date: '2026-10-13', pageViews: 12, visits: 4, complete: false, collected: true },
  last7Complete: { pageViews: 700, visits: 210, days: 7, avgPageViews: 100, avgVisits: 30 },
  last30Available: { pageViews: 700, visits: 210, days: 7 },
  daily: [
    { date: '2026-10-12', pageViews: 100, visits: 30, status: 'complete' },
    { date: '2026-10-13', pageViews: 12, visits: 4, status: 'partial' }
  ],
  countries: [{ code: 'US', name: 'United States', flag: '🇺🇸', pageViews: 700, pct: 100 }],
  categories: [{ key: 'search', label: 'Search', pageViews: 500, pct: 71.4 }, { key: 'other', label: 'Other', pageViews: 200, pct: 28.6 }],
  categoryTotal: 700,
  categoryPeriod: { startDate: '2026-10-06', endDate: '2026-10-12', days: 7 },
  historicalTransition: { newSeriesStartedAt: '2026-10-06', oldSeriesRetainedInternally: true }
};

let nsfRequested = false;

async function mockData(page) {
  nsfRequested = false;
  await page.route('https://raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    if (url.endsWith('/csrankings.csv')) return route.fulfill({ body: csrankings, contentType: 'text/csv' });
    if (url.endsWith('/generated-author-info.csv')) return route.fulfill({ body: authorInfo, contentType: 'text/csv' });
    if (url.endsWith('/institutions.csv')) return route.fulfill({ body: institutions, contentType: 'text/csv' });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route('**/jobs.json', route => route.fulfill({ json: jobs }));
  await page.route('**/grants.json', route => route.fulfill({ json: grants }));
  await page.route('**/conferences.json', route => route.fulfill({ json: conferences }));
  await page.route('**/api/stats*', route => route.fulfill({ json: traffic }));
  // The stats page must never download the large NSF snapshot.
  await page.route('**/nsf-awards.json', route => { nsfRequested = true; return route.fulfill({ json: { awards: [] } }); });
  await page.route('https://api.github.com/**', route => {
    const url = new URL(route.request().url());
    const last = (n) => ({ Link: `<${url.origin}${url.pathname}?per_page=1&page=${n}>; rel="last"`, 'Access-Control-Expose-Headers': 'Link' });
    if (url.pathname.endsWith('/contributors')) return route.fulfill({ json: [{}], headers: last(8) });
    if (url.pathname.endsWith('/commits') && url.searchParams.get('per_page') === '1') return route.fulfill({ json: [commit(1, 'latest')], headers: last(534) });
    if (url.pathname.endsWith('/commits')) return route.fulfill({ json: [commit(1, 'stats: add <b>page</b>'), commit(2, 'docs: brief README')] });
    return route.fulfill({ json: { stargazers_count: 11, forks_count: 1, open_issues_count: 5, created_at: '2025-11-26T00:00:00Z' } });
  });
}

test('stats page lists what CS Picks tracks and recent repository activity', async ({ page }) => {
  await mockData(page);
  await page.goto('stats.html');
  await expect(page.locator('.search-intro h2')).toHaveText('CS Picks by the numbers');
  await expect(page.locator('.health-link')).toHaveAttribute('aria-current', 'page');

  await expect(page.locator('#stats-roster')).toContainText('Faculty2');
  await expect(page.locator('#stats-roster')).toContainText('with papers in tracked venues');
  await expect(page.locator('main')).not.toContainText('CSRankings');
  await expect(page.locator('#stats-roster')).toContainText('1 in the US');
  await expect(page.locator('#stats-checks')).toHaveCount(0);
  // Every section header links to its page.
  expect(await page.locator('.stats-section h3 a').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(['index.html', 'csconfs.html', 'grants.html', 'jobs.html', 'https://github.com/dynaroars/cspicks']);
  await expect(page.locator('#stats-confs')).toContainText('Conference series2');
  await expect(page.locator('#stats-confs')).toContainText('Upcoming deadlines1');
  await expect(page.locator('#stats-grants')).toContainText('1 current, 1 historical');
  await expect(page.locator('#stats-jobs')).toContainText('Active job postings1');
  await expect(page.locator('#stats-nsf')).toHaveCount(0);

  const repo = page.locator('#stats-repo');
  await expect(repo).toContainText('Commits534');
  await expect(repo).toContainText('Contributors8');
  await expect(repo.locator('.stats-commits li')).toHaveCount(2);
  await expect(repo.locator('.stats-commits li').first()).toContainText('stats: add <b>page</b>');
  await expect(repo.locator('.stats-commits b')).toHaveCount(0);
  expect(nsfRequested).toBe(false);

  const visitors = page.locator('#stats-traffic');
  await expect(visitors.locator('.browser-metric-card')).toHaveCount(4);
  await expect(visitors.locator('.browser-metric-card').first()).toContainText('12 today so far');
  await expect(visitors.locator('.browser-metric-card').nth(2)).toContainText('excludes direct mobile Chrome');
  await expect(visitors).toContainText('Search');
  await expect(visitors.locator('.privacy-note')).toContainText('browser beacons');
});

test('a failed source shows an error in its own section only', async ({ page }) => {
  await mockData(page);
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 403, body: '' }));
  await page.goto('stats.html');
  await expect(page.locator('#stats-repo .load-error')).toBeVisible();
  await expect(page.locator('#stats-grants')).toContainText('Awards & grants2');
});

test('unavailable visitor traffic shows a retry button in its own section only', async ({ page }) => {
  await mockData(page);
  await page.route('**/api/stats*', route => route.fulfill({ status: 503, json: { error: 'Browser statistics are temporarily unavailable.' } }));
  await page.goto('stats.html');
  await expect(page.locator('#stats-traffic .retry-btn')).toBeVisible();
  await expect(page.locator('#stats-jobs')).toContainText('Active job postings1');
});

for (const file of PAGES) {
  test(`${file} header shows GitHub, stats, and ROARS icons at one size`, async ({ page }) => {
    await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, body: '' }));
    await page.route('https://api.github.com/**', route => route.fulfill({ status: 404, body: '' }));
    await page.goto(file);
    const icons = page.locator('.title-row .icon-link');
    await expect(icons).toHaveCount(3);
    expect(await icons.evaluateAll(els => els.map(el => el.classList[1]))).toEqual(['github-link', 'health-link', 'roars-link']);
    await expect(page.locator('.health-link')).toHaveAttribute('href', 'stats.html');
    const boxes = await icons.evaluateAll(els => els.map(el => {
      const box = el.getBoundingClientRect();
      return { width: box.width, height: box.height, top: box.top };
    }));
    for (const box of boxes) {
      expect(box.width).toBe(boxes[0].width);
      expect(box.height).toBe(boxes[0].height);
      expect(Math.abs(box.top - boxes[0].top)).toBeLessThan(1);
    }
    expect(boxes[0].width).toBeGreaterThanOrEqual(28);
    await expect(page.locator('[id*="data-health"]')).toHaveCount(0);
  });
}

test('the stats icon navigates to the stats page', async ({ page }) => {
  await mockData(page);
  await page.goto('jobs.html');
  await page.locator('.health-link').click();
  await expect(page).toHaveURL(/stats\.html$/);
  await expect(page.locator('.search-intro h2')).toHaveText('CS Picks by the numbers');
});

for (const [file, target] of [['csconfs.html', 'csconfs-submit.html'], ['grants.html', 'grants-submit.html'], ['jobs.html', 'jobs-submit.html']]) {
  test(`${file} has one "Add or update info" button linking to its form`, async ({ page }) => {
    await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, body: '' }));
    await page.goto(file);
    const button = page.locator('.search-intro .submission-link');
    await expect(button).toHaveCount(1);
    await expect(button).toHaveText('Add or update info');
    await expect(button).toHaveAttribute('href', target);
    await expect(page.locator(`.search-intro a[href="${target}"]`)).toHaveCount(1);
    expect(await button.evaluate(el => getComputedStyle(el).borderRadius)).toBe('999px');
  });
}
