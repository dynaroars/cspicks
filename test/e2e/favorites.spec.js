import { expect, test } from '@playwright/test';

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const jobs = ['alpha', 'bravo', 'charlie'].map((name, index) => ({
  id: `job-${name}`, school: 'George Mason University', department: 'Computer Science', title: `Assistant Professor ${name}`,
  track: 'tenure-track', level: 'assistant', areas: [], state: 'VA', city: 'Fairfax', deadline: day(10 + index), lastSeenAt: day(-1),
  url: `https://example.edu/${name}`, source: 'crawl'
}));

test('US Jobs lists favorites first and supports favorites-only keywords without a dropdown', async ({ page }) => {
  await page.route('**/jobs.json', route => route.fulfill({ json: jobs }));
  await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('jobs.html');
  await expect(page.locator('.job-card')).toHaveCount(3);
  await expect(page.locator('#favorites-select')).toHaveCount(0);

  await page.locator('.job-card', { hasText: 'charlie' }).locator('.favorite-toggle').click();
  // Stars move to the top immediately and persist across reloads.
  await expect(page.locator('.job-title').first()).toContainText('charlie');
  await page.reload();
  await expect(page.locator('.job-title').first()).toContainText('charlie');

  await page.locator('#jobs-search').fill('favorites: only');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await page.locator('.favorite-toggle').click();
  await expect(page.locator('.job-card')).toHaveCount(0);
  await expect(page.locator('.jobs-empty')).toContainText('No starred');

  await page.locator('#jobs-search').fill('');
  await expect(page.locator('.job-card')).toHaveCount(3);
  await page.locator('.job-card', { hasText: 'bravo' }).locator('.favorite-toggle').click();
  await page.goto('jobs.html?favorites=only');
  await expect(page.locator('#jobs-search')).toHaveValue('favorites: only');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card')).toContainText('bravo');
});

test('Awards & Grants and CS Confs have the favorites filter and the keyword', async ({ page }) => {
  await page.goto('grants.html');
  await expect(page.locator('.grant-card').first()).toBeVisible();
  await page.locator('.grant-card').nth(2).locator('.favorite-toggle').click();
  await page.locator('#favorites-select').selectOption('only');
  await expect(page.locator('.grant-card')).toHaveCount(1);
  await page.locator('#favorites-select').selectOption('all');
  await page.locator('#grants-search').fill('favorites: only');
  await expect(page.locator('.grant-card')).toHaveCount(1);

  await page.goto('csconfs.html');
  await expect(page.locator('.schedule-card').first()).toBeVisible();
  await page.locator('.schedule-card').nth(1).locator('.favorite-toggle').click();
  await page.locator('#favorites-select').selectOption('only');
  await expect(page.locator('.schedule-card')).toHaveCount(1);
  await expect(page).toHaveURL(/favorites=only/);
});
