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

  // Test Search Suggestions
  const suggestionsBox = page.locator('#universal-suggestions');
  await input.fill('Google');
  await expect(suggestionsBox).toBeVisible();
  await expect(suggestionsBox).toContainText('Google');

  // Clear search
  await input.fill('');

  // Test Audience Filter: Faculty
  const audienceSelect = page.locator('#audience-select');
  await audienceSelect.selectOption('faculty');
  const facultyCount = await page.locator('.grant-card').count();
  expect(facultyCount).toBeGreaterThan(0);
  expect(facultyCount).toBeLessThan(initialCount);

  // Test Sponsor Filter: Industry
  const sponsorSelect = page.locator('#sponsor-category-select');
  await sponsorSelect.selectOption('industry');
  const indCount = await page.locator('.grant-card').count();
  expect(indCount).toBeGreaterThan(0);

  // Test Examples Chip Click
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
