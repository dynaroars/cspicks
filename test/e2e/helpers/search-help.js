import { expect } from '@playwright/test';

export async function checkSearchHelp(page, { path, inputId, panelId, example }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await expect(page.locator(`#${inputId}`)).toBeEnabled();
  const button = page.getByRole('button', { name: 'Search keywords and examples' });
  const panel = page.locator(`#${panelId}`);
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute('aria-controls', panelId);
  await button.hover();
  await expect(panel).toBeHidden();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(example);
  const bounds = await panel.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await button.click();
  await expect(panel).toBeHidden();
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await page.locator('.search-intro h2').click();
  await expect(panel).toBeHidden();
  await button.click();
  await panel.getByRole('button', { name: 'Close help' }).click();
  await expect(panel).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
}
