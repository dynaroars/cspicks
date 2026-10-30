import { checkSearchHelp } from './helpers/search-help.js';
import { expect, test } from '@playwright/test';
import { mockUpstreams, pinFixtureDate } from './helpers/upstream-mocks.js';

test.beforeEach(async ({ page }) => {
  await pinFixtureDate(page);
  await mockUpstreams(page);
});

test('NSF funding beta searches nationwide data and aggregates fractional awards', async ({ page }) => {
  await page.goto('nsf.html');
  await expect(page.getByRole('link', { name: '🇺🇸 NSF Funding' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.funding-warning')).toHaveCount(0);
  await expect(page.locator('#funding-award-count')).toContainText(/[\d,]+ NSF CS awards during/);
  await expect(page.locator('.funding-filters')).not.toContainText('NSF · USA');
  await expect(page.locator('#start-year')).toHaveCSS('border-top-style', 'solid');
  await expect(page.locator('#start-year')).toHaveClass(/field-select/);
  const countLabelBox = await page.locator('#funding-award-count').boundingBox();
  const startYearBox = await page.locator('#start-year').boundingBox();
  expect(Math.abs((countLabelBox.y + countLabelBox.height / 2) - (startYearBox.y + startYearBox.height / 2))).toBeLessThan(2);
  await expect(page.locator('#funding-status')).toBeHidden();

  // Like Search: universities left, people right, cards collapsed to names.
  await expect(page.locator('#funding-status')).toBeHidden();
  await expect(page.locator('#funding-school-results')).toContainText('Carnegie Mellon University');
  await expect(page.locator('#funding-school-results .funding-card').first()).toHaveClass(/collapsed/);
  await expect(page.locator('#funding-school-results .section-title')).toHaveCount(0);
  await expect(page.locator('#funding-school-results .result-position')).toHaveCount(0);
  const columns = await page.evaluate(() => {
    const schools = document.querySelector('#funding-school-results').getBoundingClientRect();
    const people = document.querySelector('#funding-faculty-results').getBoundingClientRect();
    return { sameRow: Math.abs(schools.y - people.y) < 5, schoolsFirst: schools.x < people.x };
  });
  expect(columns).toEqual({ sameRow: true, schoolsFirst: true });

  await page.locator('#funding-search').fill('George Mason University');
  await expect(page.locator('#funding-school-results')).toContainText('George Mason University');
  await expect(page.locator('#funding-school-results')).toContainText('attributed');
  await expect(page.locator('#funding-faculty-results .funding-card').first()).toBeVisible();
  // Details live behind the card header, as on Search.
  await page.locator('#funding-faculty-results .card-header').first().click();
  await expect(page.locator('#funding-faculty-results .funding-award-period').first()).toContainText('Project:');
  await expect(page.locator('#funding-faculty-results .funding-award-period').first()).toContainText(/–.*·.*(?:year|month)/);

  await page.locator('#funding-search').fill('ThanhVu Nguyen');
  await expect(page.locator('#funding-faculty-results')).toContainText('ThanhVu');
  await expect(page.locator('#funding-faculty-results')).toContainText('NSF awards');
  await expect(page.locator('#funding-faculty-results .card-stats')).toContainText('full project value');
  await expect(page.locator('#funding-faculty-results')).toContainText('$174,975');
  await expect(page.locator('#funding-faculty-results')).toContainText('$32,798 obligated to GMU');
  await expect(page.locator('#funding-faculty-results')).toContainText('$1.2M collaborative intended total');
  await expect(page.locator('#funding-faculty-results')).toContainText('$399,879 local intended award');
  await expect(page.locator('#funding-faculty-results')).toContainText('Program manager:');
  await expect(page.locator('#funding-faculty-results .funding-award')).toHaveCount(5);
  await expect(page.locator('#funding-faculty-results .funding-summary')).toHaveCount(0);
  await expect(page.locator('#funding-faculty-results')).not.toContainText('more awards');

  await page.locator('#funding-search').fill('CAREER');
  await expect(page.locator('#funding-school-results')).toBeEmpty();
  await expect(page.locator('#funding-faculty-results .funding-card').first()).toBeVisible();

  await page.locator('#funding-search').fill('Hoang-Dung Tran');
  await expect(page.locator('#funding-school-results')).toBeEmpty();
  await expect(page.locator('#funding-faculty-results')).toContainText('3 NSF awards');
  await expect(page.locator('#funding-faculty-results')).toContainText('$1.4M intended share');

  for (const alias of ['Dung Tran', 'Hoang Tran', 'Tran']) {
    await page.locator('#funding-search').fill(alias);
    await expect(page.locator('#funding-faculty-results .funding-card').first()).toContainText('Hoang-Dung Tran');
    await expect(page.locator('#funding-school-results')).toBeEmpty();
  }
});

test('funding compares two universities with vs', async ({ page }) => {
  await page.goto('nsf.html?q=George%20Mason%20University%20vs%20Univ.%20of%20Illinois%20at%20Urbana-Champaign');
  const comparison = page.locator('#funding-comparison');
  await expect(comparison).toBeVisible();
  await expect(comparison.locator('.comparison-scoreboard')).toContainText('NSF awards');
  await expect(comparison.locator('.comparison-scoreboard')).toContainText('CS faculty with awards');
  await expect(comparison.locator('.comparison-cards .funding-card')).toHaveCount(2);
  // The comparison replaces the ranked columns, and the cards open in full.
  await expect(page.locator('#funding-school-results .funding-card')).toHaveCount(0);
  await expect(comparison.locator('.funding-card.collapsed')).toHaveCount(0);

  await page.goto('nsf.html?q=George%20Mason%20University%20vs%20Nowhere%20Tech');
  await expect(comparison).toContainText('No match found');

  await page.goto('nsf.html?q=George%20Mason%20University');
  await expect(page.locator('#funding-school-results .funding-card').first()).toBeVisible();
  await expect(comparison).toBeHidden();
});

test('funding suggestions complete both sides of a vs query', async ({ page }) => {
  await page.goto('nsf.html');
  const listbox = page.locator('#universal-suggestions');
  // A comparison chip advertises the mode before anything is typed.
  await expect(page.locator('#funding-examples button', { hasText: ' vs ' })).toHaveCount(1);
  await page.locator('#funding-search').fill('CAREER');
  await expect(listbox).toBeVisible();
  await expect(listbox).toContainText('NSF programs');

  // Comparing only accepts universities and people, so programs drop out.
  await page.locator('#funding-search').fill('George Mason University vs Illinois');
  await expect(listbox).not.toContainText('NSF programs');
  const option = listbox.locator('.search-suggestion', { hasText: 'Univ. of Illinois' }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator('#funding-search')).toHaveAttribute('data-query', 'George Mason University vs Univ. of Illinois at Urbana-Champaign');
  await expect(page.locator('#funding-comparison .comparison-scoreboard')).toContainText('CS faculty with awards');
  await expect(listbox).toBeHidden();
});

test('funding stays off search results but appears in the Discoveries cards', async ({ page }) => {
  await page.goto('./?q=Hai%20Duong');
  await expect(page.locator('#prof-results .card-stats')).toContainText('papers');
  await expect(page.locator('#prof-results')).not.toContainText('NSF');
  await expect(page.locator('#integrated-analysis')).not.toContainText('NSF');

  await page.goto('./?view=discoveries&q=Hai%20Duong');
  await expect(page.locator('#prof-results .card-stats')).toContainText('papers');
  await expect(page.locator('#prof-results')).not.toContainText('NSF');

  await page.goto('./?view=discoveries');
  await expect(page.getByRole('heading', { name: 'NSF funding patterns across US universities' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Largest attributed NSF portfolios/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Largest matched collaborative projects/ })).toBeVisible();
});

test('nsf.html uses the Jobs-style clickable search help', async ({ page }) => {
  await checkSearchHelp(page, { path: 'nsf.html', inputId: 'funding-search', panelId: 'search-help-panel', example: 'institution: MIT program: CAREER' });
});

test('funding keywords autocomplete their values while preserving other filters', async ({ page }) => {
  await page.goto('nsf.html');
  const input = page.locator('#funding-search');
  await expect(input).toBeEnabled();
  await input.fill('institution: "George Mason University" program: ');
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible();
  const label = await option.locator('.search-suggestion-label').textContent();
  await option.click();
  await expect(input).toHaveAttribute('data-query', new RegExp('^institution: "George Mason University" program: '));
  expect(await input.getAttribute('data-query')).toContain(label);
  await page.reload();
  await expect(input).toBeEnabled(); // the query is restored once the NSF data has loaded
  expect(await input.getAttribute('data-query')).toContain(label);
});
