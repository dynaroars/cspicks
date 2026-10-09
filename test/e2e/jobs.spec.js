import { expect, test } from '@playwright/test';

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const jobs = [
  { id: 'gmu-soft', school: 'George Mason University', department: 'Computer Science', title: 'Assistant Professor, Software Engineering', track: 'tenure-track', level: 'assistant', areas: ['soft'], state: 'VA', city: 'Fairfax', deadline: day(20), lastSeenAt: day(-2), url: 'https://example.edu/gmu', source: 'crawl', verified: true, visaSponsorship: 'yes' },
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
  await expect(page.locator('.job-card', { hasText: 'Software Engineering' }).locator('.job-chip-visa')).toHaveText('✅ Visa sponsorship available');
  await expect(page.locator('.job-card', { hasText: 'Teaching Professor' }).locator('.job-chip-visa')).toHaveCount(0, { timeout: 1000 });

  await page.locator('#jobs-search').fill('status: closed');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card')).toContainText('Postdoctoral Fellow');
  await expect(page.locator('.job-deadline')).toContainText('Closed');
  await expect(page).toHaveURL(/q=status/);

  await page.locator('#jobs-search').fill('status: all');
  await expect(page.locator('.job-card')).toHaveCount(3);
});

test('search, filters, and the state map narrow the list', async ({ page }) => {
  await page.goto('jobs.html');
  await page.locator('#jobs-search').fill('teaching');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await page.locator('#jobs-search').fill('');

  await page.locator('#jobs-search').fill('track: tenure-track');
  await expect(page.locator('.job-card')).toHaveCount(1);
  // Comma-separated alternatives preserve the old multi-choice filters.
  await page.locator('#jobs-search').fill('track: tenure-track,teaching');
  await expect(page.locator('.job-card')).toHaveCount(2);
  await page.locator('#jobs-search').fill('');
  await page.locator('#jobs-status').click();

  // States are picked on the map only; there is no state dropdown.
  await expect(page.locator('#state-select')).toHaveCount(0);
  const clearStates = page.locator('#clear-map-states');
  await expect(clearStates).toBeHidden();
  const virginia = page.locator('.job-map-tile[data-state="VA"]');
  await expect(virginia).toHaveAttribute('aria-label', 'Virginia: 1 position');
  await virginia.click();
  await expect(clearStates).toHaveText('Clear Virginia');
  await expect(page.locator('#jobs-search')).toHaveValue('loc: VA');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page).toHaveURL(/q=loc/);
  // Other states keep their counts while one is selected, and clicking another adds it.
  await expect(page.locator('.job-map-tile[data-state="IL"]')).toHaveAttribute('aria-label', 'Illinois: 1 position');
  await page.locator('.job-map-tile[data-state="IL"]').click();
  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(clearStates).toHaveText('Clear 2 states');
  await expect(page.locator('#jobs-search')).toHaveValue(/loc: VA,IL/);
  await expect(page.locator('.job-map-tile[aria-pressed="true"]')).toHaveCount(2);
  await page.locator('.job-map-tile[data-state="VA"]').click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await clearStates.click();
  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(page.locator('.job-map-tile[aria-pressed="true"]')).toHaveCount(0);
  await expect(clearStates).toBeHidden();
  await expect(page).not.toHaveURL(/state=/);
});

test('visa filter and keyword narrow to what postings say about sponsorship', async ({ page }) => {
  await page.goto('jobs.html');
  await page.locator('#jobs-search').fill('visa: yes');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card')).toContainText('Software Engineering');
  await page.locator('#jobs-search').fill('visa: yes,unknown');
  await expect(page.locator('.job-card')).toHaveCount(2);

  await page.locator('#jobs-search').fill('visa: no');
  await expect(page.locator('.job-card')).toHaveCount(0);
  await page.locator('#jobs-search').fill('visa: possible');
  await expect(page.locator('.job-card')).toHaveCount(2);
});

test('several filter values restore from the URL, and older single-value links still work', async ({ page }) => {
  await page.goto('jobs.html?state=VA,IL&track=teaching');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card')).toContainText('Teaching Professor');
  await expect(page.locator('#jobs-search')).toHaveValue(/loc: VA,IL/);
  await expect(page.locator('#jobs-search')).toHaveValue('track: teaching loc: VA,IL');
  await page.reload();
  await expect(page.locator('.job-card')).toHaveCount(1);

  await page.goto('jobs.html?state=VA');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('#jobs-search')).toHaveValue('loc: VA');
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

test('favorites actions hide export until multiple postings are starred, and restore an export', async ({ page }) => {
  await page.goto('jobs.html');
  const actions = page.locator('#favorites-actions');
  const exportButton = page.locator('#export-favorites');
  await expect(actions).not.toHaveAttribute('open', '');
  await actions.locator('summary').click();
  await expect(exportButton).toBeHidden();
  await expect(page.locator('#restore-favorites')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(actions).not.toHaveAttribute('open', '');
  await expect(actions.locator('summary')).toBeFocused();

  await page.locator('.job-card', { hasText: 'Teaching Professor' }).locator('.favorite-toggle').click();
  await actions.locator('summary').click();
  await expect(exportButton).toBeHidden();
  await page.locator('#jobs-status').click();
  await expect(actions).not.toHaveAttribute('open', '');

  // Closed favorites also count, independently of which postings are shown.
  await page.locator('#jobs-search').fill('status: all');
  await page.locator('.job-card', { hasText: 'Postdoctoral Fellow' }).locator('.favorite-toggle').click();
  await page.reload();
  await actions.locator('summary').click();
  await expect(exportButton).toBeVisible();
  await expect(exportButton).toHaveText('Export 2 favorites');
  const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
  await expect(actions).not.toHaveAttribute('open', '');
  expect(download.suggestedFilename()).toMatch(/^cspicks-starred-jobs-\d{4}-\d{2}-\d{2}\.md$/);
  const text = await (await download.createReadStream()).toArray().then(chunks => Buffer.concat(chunks).toString('utf8'));
  expect(text).toContain('# Starred US academic CS jobs');
  expect(text).toContain('Teaching Professor — Univ. of Illinois at Urbana-Champaign');
  expect(text).toContain('Postdoctoral Fellow — George Mason University');
  expect(text).not.toContain('Software Engineering');

  // Falling below two hides export; restore replaces the stars with those in the file.
  await page.locator('.job-card', { hasText: 'Teaching Professor' }).locator('.favorite-toggle').click();
  await actions.locator('summary').click();
  await expect(exportButton).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('.job-card', { hasText: 'Postdoctoral Fellow' }).locator('.favorite-toggle').click();
  await page.locator('.job-card', { hasText: 'Software Engineering' }).locator('.favorite-toggle').click();
  await actions.locator('summary').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#restore-favorites').click()]);
  await chooser.setFiles({ name: 'starred.md', mimeType: 'text/markdown', buffer: Buffer.from(text) });
  await expect(actions).not.toHaveAttribute('open', '');
  await expect(page.locator('#jobs-restore-note')).toContainText('Restored 2 postings from “starred.md”; removed 1 other star.');
  await expect(page.locator('.favorite-toggle[aria-pressed="true"]')).toHaveCount(2);
  await expect(page.locator('.job-card', { hasText: 'Teaching Professor' }).locator('.favorite-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.job-card', { hasText: 'Postdoctoral Fellow' }).locator('.favorite-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.job-card', { hasText: 'Software Engineering' }).locator('.favorite-toggle')).toHaveAttribute('aria-pressed', 'false');
  await actions.locator('summary').click();
  await expect(exportButton).toBeVisible();

  await page.locator('#restore-favorites-file').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\n') });
  await expect(page.locator('#jobs-restore-note')).toContainText('No CS Picks postings found in “notes.md”, so your stars were not changed.');
  await expect(page.locator('.favorite-toggle[aria-pressed="true"]')).toHaveCount(2);
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

test('keyword help opens on click and keyboard, and scoped suggestions preserve the query', async ({ page }) => {
  await page.goto('jobs.html');
  const input = page.locator('#jobs-search');
  await expect(input).toBeEnabled();
  await expect(page.locator('.search-filters select')).toHaveCount(2);
  const help = page.getByRole('button', { name: 'Search keywords and examples' });
  const panel = page.locator('#jobs-search-help');
  await expect(panel).toBeHidden();
  await help.click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('track: teaching');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(help).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.locator('#jobs-status').click();
  await expect(panel).toBeHidden();

  await input.fill('loc: IL track: tea');
  await expect(page.getByRole('option', { name: /Teaching track/ })).toBeVisible();
  await page.getByRole('option', { name: /Teaching track/ }).click();
  await expect(input).toHaveValue('loc: IL track: teaching');
  await expect(page.locator('.job-card')).toHaveCount(1);

  await page.goto('jobs.html?status=all');
  await expect(input).toHaveValue('status: all');
  await expect(page.locator('.job-card')).toHaveCount(3);
});
