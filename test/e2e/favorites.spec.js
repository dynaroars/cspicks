import { expect, test } from '@playwright/test';

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const jobs = ['alpha', 'bravo', 'charlie'].map((name, index) => ({
  id: `job-${name}`, school: 'George Mason University', department: 'Computer Science', title: `Assistant Professor ${name}`,
  track: 'tenure-track', level: 'assistant', areas: [], state: 'VA', city: 'Fairfax', deadline: day(10 + index), lastSeenAt: day(-1),
  url: `https://example.edu/${name}`, source: 'crawl'
}));

test('US Jobs: star postings, show favorites only, and the choice persists', async ({ page }) => {
  await page.route('**/jobs.json', route => route.fulfill({ json: jobs }));
  await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('jobs.html');
  await expect(page.locator('.job-card')).toHaveCount(3);
  await expect(page.locator('#favorites-select option[value="only"]')).toHaveText('★ Favorites only (0)');

  await page.locator('.job-card', { hasText: 'charlie' }).locator('.favorite-toggle').click();
  await expect(page.locator('#favorites-select option[value="only"]')).toHaveText('★ Favorites only (1)');
  // A reload shows the starred posting first even though it has the latest deadline.
  await page.reload();
  await expect(page.locator('.job-title').first()).toContainText('charlie');

  await page.locator('#favorites-select').selectOption('only');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page).toHaveURL(/favorites=only/);
  // Un-starring while filtered removes the card.
  await page.locator('.favorite-toggle').click();
  await expect(page.locator('.job-card')).toHaveCount(0);
  await expect(page.locator('.jobs-empty')).toContainText('No starred');

  await page.locator('#favorites-select').selectOption('all');
  await expect(page.locator('.job-card')).toHaveCount(3);
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
