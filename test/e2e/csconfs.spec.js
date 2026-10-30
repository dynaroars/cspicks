import { openDetails } from './helpers/disclosures.js';
import { checkSearchHelp } from './helpers/search-help.js';
import { useDataFixtures } from './helpers/data-fixtures.js';
import { expect, test } from '@playwright/test';
import { fixtureYear, mockUpstreams } from './helpers/upstream-mocks.js';

test.beforeEach(async ({ page }) => {
  // Mid-year, so the schedule defaults to this conference year and next.
  await page.clock.setFixedTime(new Date(`${fixtureYear}-08-17T12:00:00Z`));
  await useDataFixtures(page, ['conferences']);
  await mockUpstreams(page);
});

test('CS Confs reuses search behavior and defaults to this and next conference year', async ({ page }) => {
  await page.goto('./csconfs.html');
  await expect(page.getByRole('link', { name: '📅 CS Confs' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#start-year')).toHaveValue(String(fixtureYear));
  await expect(page.locator('#end-year')).toHaveValue(String(fixtureYear + 1));
  // The year range reaches back to the earliest year in the dataset (not just
  // this year and next), so there are far more than two selectable options.
  const endYearOptionCount = await page.locator('#end-year option').count();
  expect(endYearOptionCount).toBeGreaterThan(2);
  await expect(page.locator('#end-year option').first()).not.toHaveText(String(fixtureYear));
  await expect(page.locator('#csconfs-results .schedule-card').first()).toBeVisible();
  await expect(page.locator('.search-examples')).toContainText('Try:');
  await expect(page.locator('#csconfs-examples button')).toHaveCount(4);

  await page.locator('#csconfs-search').fill('PLD');
  await expect(page.locator('#universal-suggestions')).toBeVisible();
  await expect(page.locator('#universal-suggestions')).toContainText('PLDI');
  await page.getByRole('option', { name: /PLDI/ }).click();
  await expect(page.locator('#csconfs-results .schedule-card')).toHaveCount(1);
  await expect(page.locator('#csconfs-results')).toContainText(`PLDI ${fixtureYear + 1}`);
  await expect(page).toHaveURL(/q=PLDI/);

  await page.locator('#csconfs-search').fill('Security');
  await expect(page.locator('#universal-suggestions')).toContainText('Research areas');
  await expect(page.locator('#csconfs-results .schedule-card').first()).toBeVisible();
  await expect(page).toHaveURL(/q=Security/);
});

test('CS Confs submission page prefills an existing entry and offers email or GitHub delivery', async ({ page }) => {
  await page.goto('./csconfs-submit.html');
  await page.getByLabel('Correct an existing entry').check();
  await page.locator('#target').fill('PLDI');
  await expect(page.locator('#conference-correction-suggestions')).toBeVisible();
  await page.locator('#conference-correction-suggestions button', { hasText: 'PLDI 2027' }).click();
  await expect(page.locator('#name')).toHaveValue('PLDI');
  await expect(page.locator('#venueKeys')).toHaveValue('pldi');
  await expect(page.locator('#acceptanceRate')).toHaveValue('');
  await expect(page.locator('#submissions')).toHaveValue('');
  await expect(page.locator('#estimated')).not.toBeChecked();
  await expect(page.locator('#verified')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Send by email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit as a GitHub issue' })).toBeVisible();
});

test('CS Confs new submission is a single free-text box, with optional detailed fields', async ({ page }) => {
  await page.goto('./csconfs-submit.html');
  await expect(page.locator('#quick')).toBeVisible();
  await expect(page.locator('#structured-fields')).toBeHidden();
  await page.locator('#quick').fill('Please add a filter by location. https://example.org/conf');
  await page.evaluate(() => { window.open = (u) => { window.__opened = String(u); return null; }; });
  await page.getByRole('button', { name: 'Submit as a GitHub issue' }).click();
  const url = new URL(await page.evaluate(() => window.__opened));
  expect(url.searchParams.get('title')).toContain('https://example.org/conf');
  expect(url.searchParams.get('body')).toContain('filter by location');

  await page.locator('#quick-details-toggle').click();
  await expect(page.locator('#structured-fields')).toBeVisible();
  await expect(page.locator('#name')).toBeEnabled();
});

test('CS Confs location and deadline keywords narrow schedules and survive reloads', async ({ page }) => {
  await page.goto('csconfs.html');
  await expect(page.locator('#csconfs-search')).toBeEnabled();
  await expect(page.locator('#location-select, #deadline-mode, #favorites-select')).toHaveCount(0);
  await page.locator('#csconfs-search').fill('loc: europe deadline: passed');
  await expect(page).toHaveURL(/q=loc/);
  await page.reload();
  await expect(page.locator('#csconfs-search')).toHaveAttribute('data-query', 'loc: europe deadline: passed');
  await page.goto('csconfs.html?loc=europe&deadline=all&favorites=only');
  await expect(page.locator('#csconfs-search')).toHaveAttribute('data-query', 'loc: europe deadline: all favorites: only');
});

test('csconfs.html uses the Jobs-style clickable search help', async ({ page }) => {
  await checkSearchHelp(page, { path: 'csconfs.html', inputId: 'csconfs-search', panelId: 'search-help-panel', example: 'area: security loc: europe' });
});

test('conference keywords complete values and the secondary menu prefills a correction', async ({ page }) => {
  await page.goto('csconfs.html');
  const input = page.locator('#csconfs-search');
  await expect(input).toBeEnabled();
  await input.fill('loc: europe area: sec');
  await page.getByRole('option', { name: /Security/ }).click();
  await expect(input).toHaveAttribute('data-query', 'loc: europe area: sec');
  await input.press('Escape');
  await input.blur();
  const card = page.locator('.schedule-card').first();
  const label = await card.locator('h2').textContent();
  await card.locator('.result-actions summary').click();
  await card.getByRole('link', { name: 'Suggest update' }).click();
  await expect(page.locator('input[name="kind"][value="correction"]')).toBeChecked();
  await expect(page.locator('#target')).toHaveValue(new RegExp(label.trim().split(' ')[0]));
});
