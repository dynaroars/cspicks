import { openDetails } from './helpers/disclosures.js';
import { expect, test } from '@playwright/test';
import { mockUpstreams, pinFixtureDate } from './helpers/upstream-mocks.js';

test.beforeEach(async ({ page }) => {
  await pinFixtureDate(page);
  await mockUpstreams(page);
});

test('the Discoveries view shows insight cards without a separate nav link', async ({ page }) => {
  await page.goto('./?view=discoveries&percapita=false');
  await expect(page.locator('#nav-discoveries')).toHaveCount(0);
  // Same shell as Search - header, filter bar, search box, examples - but the
  // insight-card grid takes the place of the default university/faculty lists.
  await expect(page.locator('#research-settings')).toBeVisible();
  await expect(page.locator('#research-settings')).not.toHaveAttribute('open', '');
  await expect(page.locator('#main-search')).toBeVisible();
  await expect(page.locator('#discovery-stats')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Biggest rank gains' })).toBeVisible();
  await expect(page.locator('#school-results')).toBeEmpty();
  await expect(page.locator('#prof-results')).toBeEmpty();

  // Typing a real search still works exactly like Search, replacing the cards.
  await page.locator('#main-search').fill('George Mason University');
  await expect(page.locator('#school-results')).toContainText('George Mason University');
  await expect(page.locator('#discovery-stats')).toBeHidden();

  await page.locator('#main-search').press('Escape');
  await expect(page.locator('#discovery-stats')).toBeVisible();
  await openDetails(page, '#research-settings');
  await page.locator('#region-select').selectOption('europe');
  await expect(page).toHaveURL(/view=discoveries/);
  await expect(page).toHaveURL(/region=europe/);
  await expect(page.locator('#school-results')).toBeEmpty();
});

test('a discovery card\'s share button copies a link back to that card', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./?view=discoveries');
  await expect(page.locator('#discovery-stats')).toBeVisible();
  const card = page.locator('.discovery-card', { hasText: 'Fastest-growing subfields' });
  await card.locator('.discovery-share').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/\?.*view=discoveries.*#discovery-fastest-growing-subfields$/);
});

test('opening a discovery card\'s link directly scrolls to and highlights it', async ({ page }) => {
  await page.goto('./?view=discoveries&region=us#discovery-fastest-growing-subfields');
  await expect(page.locator('#discovery-stats')).toBeVisible();
  await expect(page.locator('#discovery-fastest-growing-subfields')).toHaveClass(/discovery-highlighted/);
});
