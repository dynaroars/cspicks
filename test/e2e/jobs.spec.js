import { expect, test } from '@playwright/test';

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const jobs = [
  { id: 'gmu-soft', school: 'George Mason University', department: 'Computer Science', title: 'Assistant Professor, Software Engineering', track: 'tenure-track', level: 'assistant', areas: ['soft'], state: 'VA', city: 'Fairfax', deadline: day(20), lastSeenAt: day(-2), url: 'https://example.edu/gmu', source: 'crawl', verified: true },
  { id: 'uiuc-teach', school: 'Univ. of Illinois at Urbana-Champaign', department: 'Siebel School', title: 'Teaching Professor', track: 'teaching', level: null, areas: [], state: 'IL', city: 'Urbana', deadline: null, rolling: true, lastSeenAt: day(-5), url: 'https://example.edu/uiuc', source: 'crawl' },
  { id: 'gmu-old', school: 'George Mason University', department: 'Computer Science', title: 'Postdoctoral Fellow', track: 'postdoc', level: null, areas: ['sec'], state: 'VA', city: 'Fairfax', deadline: day(-60), lastSeenAt: day(-90), url: 'https://example.edu/gmu-old', source: 'crawl' }
];
const csrankings = `name,affiliation,homepage,scholarid,orcid
Hai Duong,George Mason University,https://example.test/hai,hai,0000-0001-2345-6789
Alice Example,Univ. of Illinois at Urbana-Champaign,https://example.test/alice,alice,0000-0000-0000-0000
`;
const authorInfo = `name,area,year,count,adjustedcount
Hai Duong,icse,${new Date().getFullYear()},2,1
Alice Example,pldi,${new Date().getFullYear()},2,1
`;
const institutions = `institution,region,countryabbrv,homepage
George Mason University,northamerica,us,https://cs.gmu.test/
Univ. of Illinois at Urbana-Champaign,northamerica,us,https://cs.illinois.test/
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/jobs.json', route => route.fulfill({ json: jobs }));
  await page.route('https://raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    if (url.endsWith('/csrankings.csv')) return route.fulfill({ body: csrankings, contentType: 'text/csv' });
    if (url.endsWith('/generated-author-info.csv')) return route.fulfill({ body: authorInfo, contentType: 'text/csv' });
    if (url.endsWith('/institutions.csv')) return route.fulfill({ body: institutions, contentType: 'text/csv' });
    return route.fulfill({ status: 404, body: '' });
  });
});

test('US Jobs shows only active postings by default and reveals older ones on request', async ({ page }) => {
  await page.goto('jobs.html');
  await expect(page.getByRole('link', { name: '🎓 US Jobs' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#jobs-search')).toBeEnabled();
  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(page.locator('.job-title').first()).toContainText('Software Engineering');
  await expect(page.locator('.job-card', { hasText: 'Teaching Professor' })).toContainText('Rolling review');

  await page.locator('#status-select').selectOption('closed');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card')).toContainText('Postdoctoral Fellow');
  await expect(page.locator('.job-deadline')).toContainText('Closed');
  await expect(page).toHaveURL(/status=closed/);

  await page.locator('#status-select').selectOption('all');
  await expect(page.locator('.job-card')).toHaveCount(3);
});

test('search, filters, and the state map narrow the list', async ({ page }) => {
  await page.goto('jobs.html');
  await page.locator('#jobs-search').fill('teaching');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await page.locator('#jobs-search').fill('');

  const track = page.locator('#track-select');
  await track.locator('summary').click();
  await track.getByLabel('Tenure-track').check();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(track.locator('summary')).toHaveText('Tenure-track');
  // A second choice widens the filter instead of replacing it.
  await track.getByLabel('Teaching track').check();
  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(track.locator('summary')).toHaveText('2 position types');
  await expect(page).toHaveURL(/track=tenure-track%2Cteaching|track=tenure-track,teaching/);
  await page.keyboard.press('Escape');
  await expect(track).not.toHaveAttribute('open', '');
  await track.locator('summary').click();
  await track.getByRole('button', { name: 'Clear' }).click();
  await expect(track.locator('summary')).toHaveText('All Position Types');
  await page.locator('#jobs-status').click();
  await expect(track).not.toHaveAttribute('open', '');

  const virginia = page.locator('.job-map-tile[data-state="VA"]');
  await expect(virginia).toHaveAttribute('aria-label', 'Virginia: 1 position');
  await virginia.click();
  await expect(page.locator('#state-select summary')).toHaveText('Virginia');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page).toHaveURL(/state=VA/);
  // Other states keep their counts while one is selected, and clicking another adds it.
  await expect(page.locator('.job-map-tile[data-state="IL"]')).toHaveAttribute('aria-label', 'Illinois: 1 position');
  await page.locator('.job-map-tile[data-state="IL"]').click();
  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(page.locator('#state-select summary')).toHaveText('2 states');
  await expect(page.locator('.job-map-tile[aria-pressed="true"]')).toHaveCount(2);
  await page.locator('.job-map-tile[data-state="VA"]').click();
  await page.locator('.job-map-tile[data-state="IL"]').click();
  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(page.locator('#state-select summary')).toHaveText('All States');
});

test('several filter values restore from the URL, and older single-value links still work', async ({ page }) => {
  await page.goto('jobs.html?state=VA,IL&track=teaching');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card')).toContainText('Teaching Professor');
  await expect(page.locator('#state-select summary')).toHaveText('2 states');
  await expect(page.locator('#state-select').getByLabel('Illinois', { exact: true })).toBeChecked();

  await page.goto('jobs.html?state=VA');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('#state-select summary')).toHaveText('Virginia');
});

test('sorts by CSRankings rank in either direction', async ({ page }) => {
  // George Mason publishes more, so it outranks Illinois in this fixture.
  await page.route('**/generated-author-info.csv', route => route.fulfill({ contentType: 'text/csv', body: `name,area,year,count,adjustedcount
Hai Duong,icse,${new Date().getFullYear()},9,6
Alice Example,pldi,${new Date().getFullYear()},2,1
` }));
  await page.goto('jobs.html');
  await expect(page.locator('.job-chip-rank').first()).toBeVisible();
  await page.locator('#sort-select').selectOption('rank');
  await expect(page.locator('.job-school strong').first()).toHaveText('George Mason University');
  await expect(page).toHaveURL(/sort=rank/);
  await page.locator('#sort-select').selectOption('rank-desc');
  await expect(page.locator('.job-school strong').first()).toHaveText('Univ. of Illinois at Urbana-Champaign');
});

test('exports starred postings as a Markdown file', async ({ page }) => {
  await page.goto('jobs.html');
  const exportButton = page.locator('#export-favorites');
  await expect(exportButton).toBeDisabled();
  await page.locator('.job-card', { hasText: 'Teaching Professor' }).locator('.favorite-toggle').click();
  await expect(exportButton).toBeEnabled();

  const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
  expect(download.suggestedFilename()).toMatch(/^cspicks-starred-jobs-\d{4}-\d{2}-\d{2}\.md$/);
  const text = await (await download.createReadStream()).toArray().then(chunks => Buffer.concat(chunks).toString('utf8'));
  expect(text).toContain('# Starred US academic CS jobs');
  expect(text).toContain('## 1. Teaching Professor — Univ. of Illinois at Urbana-Champaign');
  expect(text).toContain('<https://example.edu/uiuc>');
  expect(text).not.toContain('Software Engineering');
});

test('by-school view groups postings and links into Search and Simulator, with rank chips', async ({ page }) => {
  await page.goto('jobs.html?view=school&status=all');
  await expect(page.locator('.job-school-card')).toHaveCount(2);
  const gmu = page.locator('.job-school-card', { hasText: 'George Mason University' });
  await expect(gmu).toContainText('2 positions');
  await expect(gmu.getByRole('link', { name: /Faculty & rank in Search/ })).toHaveAttribute('href', /index\.html\?q=George/);
  await expect(gmu.getByRole('link', { name: /Simulate a hire/ })).toHaveAttribute('href', /simulator\.html\?univ=George/);
  await expect(gmu.locator('.job-chip-rank').first()).toContainText('CSRankings');
});

test('submit form is reachable and prefills a correction', async ({ page }) => {
  await page.goto('jobs.html');
  await page.getByRole('link', { name: 'Submit or update a posting.' }).click();
  await expect(page).toHaveURL(/jobs-submit\.html/);
  await expect(page.locator('#quick')).toBeVisible();

  await page.goto('jobs-submit.html?id=gmu-soft');
  await expect(page.locator('input[name="kind"][value="correction"]')).toBeChecked();
  await expect(page.locator('#title')).toHaveValue('Assistant Professor, Software Engineering');
  await expect(page.locator('#state')).toHaveValue('VA');
});
