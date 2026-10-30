import { expect, test } from '@playwright/test';
import { mockUpstreams, pinFixtureDate } from './helpers/upstream-mocks.js';

test.beforeEach(async ({ page }) => {
  await pinFixtureDate(page);
  await mockUpstreams(page);
});

test('simulator preserves CSRankings suffixes and accepts an exact DBLP profile link', async ({ page }) => {
  await page.goto('simulator.html');
  await expect(page.getByRole('link', { name: '☠️ Simulator' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.simulator-disclaimer')).toContainText('Experimental simulator.');
  await expect(page.locator('.simulator-disclaimer')).toHaveClass(/context-note/);
  await expect(page.locator('.simulator-disclaimer')).toHaveCSS('border-left-style', 'solid');
  // The former footer links now live beside the title as icons.
  await expect(page.locator('footer')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'ROARS Lab' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View CS Picks on GitHub' })).toHaveAttribute('href', 'https://github.com/dynaroars/cspicks');
  await page.locator('#sim-univ-search').fill('George Mason');
  await page.locator('#sim-univ-results .sim-item').click();

  const faculty = page.locator('.sim-faculty-option', { hasText: 'Hai Duong' });
  await faculty.locator('input').check();
  await expect(page.locator('#sim-candidates-input')).toHaveValue('Hai Duong 0001');

  await page.locator('#sim-candidates-input').fill('https://dblp.org/pid/99/9999.html');
  await expect(page).toHaveURL(/univ=George\+Mason\+University/);
  await page.locator('#sim-analyze-btn').click();
  await expect(page.locator('#sim-candidates-results')).toContainText('Exact DBLP Person');
  await expect(page.locator('#sim-candidates-results')).toContainText('1 rank-counted paper');
  await expect(page.locator('#sim-candidates-results')).not.toContainText('authors');
  await expect(page).toHaveURL(/candidates=https/);
  await expect(page).toHaveTitle(/George Mason University ranking simulation/);
});

test('a shared simulator link restores the university and candidates for one-click analysis', async ({ page }) => {
  await page.goto('simulator.html?univ=George+Mason+University&candidates=Hai+Duong+0001');
  await expect(page.locator('#step-candidates')).toBeVisible();
  await expect(page.locator('#selected-univ-display')).toContainText('George Mason University');
  await expect(page.locator('#sim-candidates-input')).toHaveValue('Hai Duong 0001');
  await page.locator('#sim-analyze-btn').click();
  await expect(page.locator('#sim-candidates-results')).toContainText('Hai Duong');
});
