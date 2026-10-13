import { test, expect } from '@playwright/test';

// Each search page enables its box only after data loads, so `autofocus` alone never takes; the page focuses it.
for (const [file, inputId] of [['jobs.html', 'jobs-search'], ['grants.html', 'grants-search'], ['csconfs.html', 'csconfs-search'], ['nsf.html', 'funding-search']]) {
  test(`${file} focuses its search box once loaded`, async ({ page }) => {
    await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, body: '' }));
    await page.goto(file);
    const input = page.locator(`#${inputId}`);
    await expect(input).toBeEnabled({ timeout: 20000 });
    await expect(input).toBeFocused();
  });
}
