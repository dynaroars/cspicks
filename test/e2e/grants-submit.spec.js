import { expect, test } from '@playwright/test';

test('Grants submit page supports both new award submission and existing award editing', async ({ page }) => {
  await page.goto('grants-submit.html');

  // Verify elements
  await expect(page.locator('h2')).toContainText('Submit or update an award / grant');
  const form = page.locator('#grants-submit-form');
  await expect(form).toBeVisible();

  // Test mode radio toggle
  const newRadio = form.locator('input[value="new"]');
  const editRadio = form.locator('input[value="correction"]');
  const targetRow = page.locator('#correction-target-row');

  await expect(newRadio).toBeChecked();
  await expect(targetRow).toBeHidden();

  await editRadio.check();
  await expect(targetRow).toBeVisible();

  // Test URL prefilling via query param ?id=nsf-career
  await page.goto('grants-submit.html?id=nsf-career');
  await expect(editRadio).toBeChecked();
  await expect(page.locator('#name')).toHaveValue(/CAREER/);
  await expect(page.locator('#sponsor')).toHaveValue(/NSF/);
  await expect(page.locator('#url')).toHaveValue(/nsf\.gov/);

  // Edit mode shows the structured fields and delivers straight to a GitHub draft
  await expect(page.locator('#structured-fields')).toBeVisible();
  await page.evaluate(() => { window.open = (u) => { window.__opened = String(u); return null; }; });
  await page.getByRole('button', { name: 'Submit as a GitHub issue' }).click();
  const url = new URL(await page.evaluate(() => window.__opened));
  expect(url.href).toMatch(/github\.com\/dynaroars\/cspicks\/issues\/new/);
  expect(url.searchParams.get('body')).toContain('nsf.gov');
});

test('grants new submission is a single free-text box, with optional detailed fields', async ({ page }) => {
  await page.goto('grants-submit.html');
  await expect(page.locator('#quick')).toBeVisible();
  await expect(page.locator('#structured-fields')).toBeHidden();
  await page.locator('#quick').fill('https://example.org/award - also please add a filter for international students');
  await page.evaluate(() => { window.open = (u) => { window.__opened = String(u); return null; }; });
  await page.getByRole('button', { name: 'Submit as a GitHub issue' }).click();
  const url = new URL(await page.evaluate(() => window.__opened));
  expect(url.searchParams.get('title')).toContain('https://example.org/award');
  expect(url.searchParams.get('body')).toContain('international students');

  await page.locator('#quick-details-toggle').click();
  await expect(page.locator('#structured-fields')).toBeVisible();
  await expect(page.locator('#quick')).toBeHidden();
  await page.locator('#quick-back-button').click();
  await expect(page.locator('#quick')).toBeVisible();
});
