import { expect, test } from '@playwright/test';
import { useDataFixtures } from './helpers/data-fixtures.js';

test.beforeEach(async ({ page }) => {
  await useDataFixtures(page, ['grants', 'conferences']);
});

test('one submission page switches types and creates the matching draft', async ({ page }) => {
  await page.goto('submit.html');
  for (const [type, label] of [['job', 'job'], ['grant', 'award'], ['conference', 'conference']]) {
    await page.getByLabel('What are you submitting?').selectOption(type);
    await expect(page.locator('#quick')).toBeVisible();
    await expect(page.locator('#structured-fields')).toBeHidden();
    await page.locator('#quick').fill(`Please add this ${type}: https://example.org/${type}`);
    await page.evaluate(() => { window.open = url => { window.__opened = String(url); return null; }; });
    await page.getByRole('button', { name: 'Submit as a GitHub issue' }).click();
    const draft = new URL(await page.evaluate(() => window.__opened));
    expect(draft.searchParams.get('title')).toContain(`CS Picks ${label} submission`);
    expect(draft.searchParams.get('body')).toContain(`Please add this ${type}`);
  }
});

test('legacy award edit links preserve their target and switching types clears it', async ({ page }) => {
  await page.goto('grants-submit.html?edit=nsf-career');
  await expect(page).toHaveURL(/submit\.html\?edit=nsf-career&type=grant/);
  await expect(page.getByLabel('What are you submitting?')).toHaveValue('grant');
  await expect(page.locator('input[name="kind"][value="correction"]')).toBeChecked();
  await expect(page.locator('#name')).toHaveValue(/CAREER/);
  await expect(page.locator('#quick')).toBeVisible();
  await page.getByLabel('What are you submitting?').selectOption('conference');
  await expect(page).toHaveURL(/submit\.html\?type=conference$/);
  await expect(page.locator('input[name="kind"][value="new"]')).toBeChecked();
  await expect(page.locator('#quick')).toBeVisible();
});

test('legacy conference edit links preserve the edition and include free-text changes', async ({ page }) => {
  await page.goto('csconfs-submit.html?name=PLDI&year=2027');
  await expect(page.getByLabel('What are you submitting?')).toHaveValue('conference');
  await expect(page.locator('input[name="kind"][value="correction"]')).toBeChecked();
  await expect(page.locator('#name')).toHaveValue('PLDI');
  await page.locator('#quick').fill('Please check the submission timezone.');
  await page.locator('#attest').check();
  await page.evaluate(() => { window.open = url => { window.__opened = String(url); return null; }; });
  await page.getByRole('button', { name: 'Submit as a GitHub issue' }).click();
  const draft = new URL(await page.evaluate(() => window.__opened));
  expect(draft.searchParams.get('body')).toContain('Please check the submission timezone.');
  expect(draft.searchParams.get('body')).toContain('PLDI');
});
