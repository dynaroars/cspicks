import { openDetails } from './helpers/disclosures.js';
import { expect, test } from '@playwright/test';
import { mockUpstreams, pinFixtureDate } from './helpers/upstream-mocks.js';

test.beforeEach(async ({ page }) => {
  await pinFixtureDate(page);
  await mockUpstreams(page);
});

test('vs syntax compares two targets in place of search results', async ({ page }) => {
  await page.goto('./');
  const comparison = page.locator('#comparison-results');
  const summary = page.locator('#comparison-summary');

  await page.locator('#main-search').fill('George Mason University vs Univ. of Illinois at Urbana-Champaign');
  await expect(comparison).toBeVisible();
  await expect(page.locator('#comparison-title')).toHaveText('George Mason University vs Univ. of Illinois at Urbana-Champaign');
  // The verdict leads, the chart closes: summary before detail. These two tie
  // on score and each lead one area, so the verdict reports an even match.
  await expect(summary.locator('.comparison-verdict')).toContainText('evenly matched');
  await expect(summary).toContainText('Software Engineering');
  await expect(page.locator('#comparison-chart-container')).toBeVisible();
  const order = await page.locator('#comparison-results').evaluate(el => {
    const box = sel => el.querySelector(sel).getBoundingClientRect().top;
    return {
      verdictFirst: box('.comparison-verdict') < box('.comparison-scoreboard'),
      chartLast: box('.comparison-leads') < box('#comparison-chart-container')
    };
  });
  expect(order).toEqual({ verdictFirst: true, chartLast: true });
  await expect(page.locator('#school-results .card')).toHaveCount(0);
  await expect(page.locator('#integrated-analysis')).toBeHidden();
  await expect(page).not.toHaveURL(/target=/);

  // Researchers compare too, but the rank-gap breakdown is school-only.
  await page.locator('#main-search').fill('Hai Duong vs Alice Example');
  await expect(page.locator('#comparison-title')).toHaveText('Hai Duong vs Alice Example');
  // Researchers are judged on adjusted output rather than rank (the school
  // verdict above quotes "#1 vs #1"), and get no gap breakdown.
  await expect(summary.locator('.comparison-verdict')).toContainText('adjusted');
  await expect(summary).toContainText('lead in');
  await expect(summary).not.toContainText('What explains the rank gap?');

  await page.locator('#main-search').fill('Hai Duong vs George Mason University');
  await expect(summary).toContainText('Compare two universities, two professors, two research areas, or two conferences');
  await expect(page.locator('#comparison-chart-container')).toBeHidden();

  await page.locator('#main-search').fill('George Mason University');
  await expect(comparison).toBeHidden();
  await expect(page.locator('#integrated-analysis')).toBeVisible();
  await openDetails(page, '#integrated-analysis');
});

test('vs syntax also compares two research areas, region-wide', async ({ page }) => {
  await page.goto('./');
  const summary = page.locator('#comparison-summary');

  // Hai Duong publishes in Software Engineering (icse, ase) only; Alice in
  // Programming Languages (pldi) only - no overlap in this fixture, so the
  // "bridges both fields" list should legitimately come back empty.
  await page.locator('#main-search').fill('Software Engineering vs Programming Languages');
  await expect(page.locator('#comparison-title')).toHaveText('Software Engineering vs Programming Languages');
  await expect(summary).toContainText('Region-wide adjusted count');
  await expect(summary).toContainText('Growth vs. prior period');
  const adjustedMeasure = summary.getByLabel('About Region-wide adjusted count');
  await adjustedMeasure.hover();
  await expect(adjustedMeasure.locator('.tooltip-content')).toBeVisible();
  await expect(adjustedMeasure.locator('.tooltip-content')).toContainText('Fractional publication credit');
  const growthMeasure = summary.getByLabel('About Growth vs. prior period');
  await growthMeasure.focus();
  await expect(growthMeasure.locator('.tooltip-content')).toContainText('immediately preceding period of equal length');
  await expect(summary).toContainText('Bridges both fields');
  await expect(summary).toContainText('No researcher has active output in both fields this period.');
  await expect(page.locator('#comparison-chart-container')).toBeHidden();
  await expect(page.locator('#school-results .card')).toHaveCount(0);

  // Mixing an area with a university or professor is still rejected.
  await page.locator('#main-search').fill('Software Engineering vs George Mason University');
  await expect(summary).toContainText('Compare two universities, two professors, two research areas, or two conferences');
});

test('suggestions list every match and complete the second side of a vs query', async ({ page }) => {
  await page.goto('./');
  await page.locator('#main-search').fill('Duong');
  const listbox = page.locator('#universal-suggestions');
  await expect(listbox).toBeVisible();
  await expect(listbox.locator('.search-suggestion')).toHaveCount(1);

  await page.locator('#main-search').fill('George Mason University vs Univ');
  const option = listbox.locator('.search-suggestion', { hasText: 'Univ. of Illinois' });
  await expect(option).toBeVisible();
  await expect(page.locator('#comparison-results')).toBeVisible();
  await option.click();
  await expect(page.locator('#main-search')).toHaveAttribute('data-query', 'George Mason University vs Univ. of Illinois at Urbana-Champaign');
  await expect(page.locator('#comparison-chart-container')).toBeVisible();
});
