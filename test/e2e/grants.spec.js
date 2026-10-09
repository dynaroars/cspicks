import { expect, test } from '@playwright/test';

test('Grants page loads, displays awards, and provides search and filters', async ({ page }) => {
  await page.goto('grants.html');

  // Verify header and navigation
  await expect(page.getByRole('link', { name: '💰 Awards & Grants' })).toHaveAttribute('aria-current', 'page');

  // Check search input
  const input = page.locator('#grants-search');
  await expect(input).toBeEnabled();
  await expect(input).toHaveAttribute('placeholder', /Search awards/);

  // Check cards rendering
  const cards = page.locator('.grant-card');
  const initialCount = await cards.count();
  expect(initialCount).toBeGreaterThanOrEqual(40);

  // Check key badges on cards
  await expect(page.locator('.grant-cat-badge').first()).toBeVisible();
  await expect(page.locator('.grant-title').first()).toBeVisible();

  // Test Search Filter: Sloan Research
  await input.fill('Sloan Research');
  await expect(page.locator('.grant-card')).toHaveCount(1);
  await expect(page.locator('.grant-title')).toContainText('Sloan Research');

  // Estimated annual deadlines remain discoverable and visibly marked.
  await input.fill('ONR CNR Fellows');
  await expect(page.locator('.grant-card')).toHaveCount(1);
  await expect(page.locator('.grant-estimated-badge')).toHaveText('Estimated');
  await expect(page.locator('.grant-meta-val').filter({ hasText: /Estimated July 3, 2027/ })).toBeVisible();

  // State names are indexed for location-specific programs.
  await input.fill('California Space Grant');
  await expect(page.locator('.grant-card')).toHaveCount(1);
  await expect(page.locator('.grant-title')).toContainText('NASA State Space Grant');

  // Test Search Suggestions
  const suggestionsBox = page.locator('#universal-suggestions');
  await input.fill('Google');
  await expect(suggestionsBox).toBeVisible();
  await expect(suggestionsBox).toContainText('Google');

  // Clear search
  await input.fill('');

  // Historical programs are clearly labeled and independently filterable.
  await input.fill('status: historical');
  const historicalCards = page.locator('.grant-card');
  expect(await historicalCards.count()).toBeGreaterThanOrEqual(6);
  await expect(page.locator('.grant-status-badge').first()).toHaveText('Historical');
  await expect(page).toHaveURL(/q=status/);

  await input.fill('audience: faculty');
  const facultyCount = await page.locator('.grant-card').count();
  expect(facultyCount).toBeGreaterThan(0);
  expect(facultyCount).toBeLessThan(initialCount);

  await input.fill('audience: faculty category: industry');
  const indCount = await page.locator('.grant-card').count();
  expect(indCount).toBeGreaterThan(0);

  // Test Examples Chip Click
  await page.keyboard.press('Escape');
  const exampleBtn = page.locator('#grants-examples button').first();
  await exampleBtn.click();
  expect(await input.inputValue()).not.toBe('');

  // Test Empty State and Reset All Filters Button
  await input.fill('nonexistentawardxyz12345');
  await expect(page.locator('.grant-card')).toHaveCount(0);
  const resetBtn = page.locator('#reset-grants-filters');
  await expect(resetBtn).toBeVisible();
  await resetBtn.click();
  await expect(input).toHaveValue('');
  await expect(page.locator('.grant-card')).toHaveCount(initialCount);

  // Test Keyboard Shortcut '/' to focus search input
  await page.locator('.search-intro h2').click();
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
});

test('awards keyword help fits mobile and legacy filters become editable search text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('grants.html?audience=phd&sponsor=industry');
  const input = page.locator('#grants-search');
  await expect(input).toHaveValue('audience: phd category: industry');
  await expect(page.locator('.grant-card').first()).toBeVisible();
  await expect(page.locator('.search-filters select')).toHaveCount(2);
  await page.reload();
  await expect(input).toHaveValue('audience: phd category: industry');

  const help = page.getByRole('button', { name: 'Search keywords and examples' });
  await help.click();
  const panel = page.locator('#grants-search-help');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('deadline: rolling');
  const bounds = await panel.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Close help' }).click();
  await expect(panel).toBeHidden();

  await input.fill('audience: phd sponsor: Goo');
  await page.getByRole('option', { name: /Google/ }).first().click();
  await expect(input).toHaveValue('audience: phd sponsor: Google');
  await expect(page.locator('.grant-card').first()).toBeVisible();
  await input.fill('');
  await expect(page.locator('.grant-card').nth(40)).toBeVisible();
});
