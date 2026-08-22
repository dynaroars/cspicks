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

  // Test Submitting review preview
  const generateBtn = page.locator('#generate-button');
  await generateBtn.click();

  const reviewCard = page.locator('#submit-review-card');
  await expect(reviewCard).toBeVisible();
  await expect(page.locator('#review-json')).toContainText('nsf.gov');

  const githubLink = page.locator('#github-issue-link');
  await expect(githubLink).toHaveAttribute('href', /github\.com\/dynaroars\/cspicks\/issues\/new/);

  const emailLink = page.locator('#email-submit-link');
  await expect(emailLink).toHaveAttribute('href', /mailto:root@roars\.dev/);
});
