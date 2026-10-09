import { openDetails } from './helpers/disclosures.js';
import { checkSearchHelp } from './helpers/search-help.js';
import { expect, test } from '@playwright/test';

// Keep fixture contents stable across calendar-year boundaries. The app's
// default ten-year window includes this year for the foreseeable future.
const fixtureYear = 2026;
const csrankings = `name,affiliation,homepage,scholarid,orcid
Hai Duong 0001,George Mason University,https://example.test/hai,hai,0000-0001-2345-6789
Alice Example,Univ. of Illinois at Urbana-Champaign,https://example.test/alice,alice,0000-0000-0000-0000
Erin Europe,University of Oxford,https://example.test/erin,erin,0000-0000-0000-0000
`;
const authorInfo = `name,area,year,count,adjustedcount
Hai Duong 0001 [Tech],icse,${fixtureYear},2,1
Hai Duong 0001 [Tech],ase,${fixtureYear},1,0.5
Alice Example,pldi,${fixtureYear},2,1
Erin Europe,nips,${fixtureYear},1,0.5
,icse,not-a-year,broken,broken
`;
const institutions = `institution,region,countryabbrv,homepage
George Mason University,northamerica,us,https://cs.gmu.test/
Univ. of Illinois at Urbana-Champaign,northamerica,us,https://cs.illinois.test/
University of Oxford,europe,uk,https://cs.oxford.test/
`;
const countries = `name,alpha_2
United States of America,US
United Kingdom,UK
`;
const dblpAliases = `alias,name
H. Duong,Hai Duong 0001
`;
const nameChanges = `uid,old_name,new_name,orcid
12/345-1,Hai Old Name,Hai Duong 0001,0000-0001-2345-6789
`;
const turing = `name,year
Hai Duong 0001,2025
Alice Example,2012
`;
const acmFellows = `name,year
Hai Duong 0001,2024
Alice Example,2019
`;
const history = JSON.stringify({
  'Hai Duong 0001': [{ school: 'George Mason University', start: fixtureYear - 5, end: fixtureYear }]
});
const dblpXml = `<?xml version="1.0" encoding="UTF-8"?>
<dblpperson><person><author>Exact DBLP Person</author></person><r><inproceedings key="conf/icse/Exact${fixtureYear}"><author>Exact DBLP Person</author><author>Coauthor</author><title>Exact paper</title><pages>1-12</pages><year>${fixtureYear}</year><booktitle>ICSE</booktitle></inproceedings></r></dblpperson>`;

async function mockUpstreams(page) {
  await page.route('https://raw.githubusercontent.com/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/csrankings.csv')) return route.fulfill({ body: csrankings, contentType: 'text/csv' });
    if (url.endsWith('/generated-author-info.csv')) return route.fulfill({ body: authorInfo, contentType: 'text/csv' });
    if (url.endsWith('/institutions.csv')) return route.fulfill({ body: institutions, contentType: 'text/csv' });
    if (url.endsWith('/turing.csv')) return route.fulfill({ body: turing, contentType: 'text/csv' });
    if (url.endsWith('/acm-fellows.csv')) return route.fulfill({ body: acmFellows, contentType: 'text/csv' });
    if (url.endsWith('/countries.csv')) return route.fulfill({ body: countries, contentType: 'text/csv' });
    if (url.endsWith('/dblp-aliases.csv')) return route.fulfill({ body: dblpAliases, contentType: 'text/csv' });
    if (url.endsWith('/name-changes.csv')) return route.fulfill({ body: nameChanges, contentType: 'text/csv' });
    if (url.endsWith('/professor_history_openalex.json')) return route.fulfill({ body: history, contentType: 'application/json' });
    if (url.endsWith('/school-aliases.json')) return route.fulfill({ body: '{}', contentType: 'application/json' });
    if (url.endsWith('/manual_affiliations.csv')) return route.fulfill({ body: 'name,school,start,end\n', contentType: 'text/csv' });
    return route.abort();
  });
  await page.route('https://dblp.org/**', route => {
    const url = route.request().url();
    if (url.endsWith('/pid/99/9999.xml')) return route.fulfill({ body: dblpXml, contentType: 'application/xml' });
    return route.fulfill({ body: JSON.stringify({ result: { hits: {} } }), contentType: 'application/json' });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(year => {
    const NativeDate = Date;
    const fixedNow = new NativeDate(`${year}-08-17T12:00:00Z`).valueOf();
    globalThis.Date = class extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() { return fixedNow; }
    };
  }, fixtureYear);
  await mockUpstreams(page);
});

test('CS Confs reuses search behavior and defaults to this and next conference year', async ({ page }) => {
  await page.goto('./csconfs.html');
  await expect(page.getByRole('link', { name: '📅 CS Confs' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#start-year')).toHaveValue(String(fixtureYear));
  await expect(page.locator('#end-year')).toHaveValue(String(fixtureYear + 1));
  // The year range reaches back to the earliest year in the dataset (not just
  // this year and next), so there are far more than two selectable options.
  const endYearOptionCount = await page.locator('#end-year option').count();
  expect(endYearOptionCount).toBeGreaterThan(2);
  await expect(page.locator('#end-year option').first()).not.toHaveText(String(fixtureYear));
  await expect(page.locator('#csconfs-results .schedule-card').first()).toBeVisible();
  await expect(page.locator('.search-examples')).toContainText('Try:');
  await expect(page.locator('#csconfs-examples button')).toHaveCount(4);

  await page.locator('#csconfs-search').fill('PLD');
  await expect(page.locator('#universal-suggestions')).toBeVisible();
  await expect(page.locator('#universal-suggestions')).toContainText('PLDI');
  await page.getByRole('option', { name: /PLDI/ }).click();
  await expect(page.locator('#csconfs-results .schedule-card')).toHaveCount(1);
  await expect(page.locator('#csconfs-results')).toContainText(`PLDI ${fixtureYear + 1}`);
  await expect(page).toHaveURL(/q=PLDI/);

  await page.locator('#csconfs-search').fill('Security');
  await expect(page.locator('#universal-suggestions')).toContainText('Research areas');
  await expect(page.locator('#csconfs-results .schedule-card').first()).toBeVisible();
  await expect(page).toHaveURL(/q=Security/);
});

test('CS Confs submission page prefills an existing entry and offers email or GitHub delivery', async ({ page }) => {
  await page.goto('./csconfs-submit.html');
  await page.getByLabel('Correct an existing entry').check();
  await page.locator('#target').fill('PLDI');
  await expect(page.locator('#conference-correction-suggestions')).toBeVisible();
  await page.locator('#conference-correction-suggestions button', { hasText: 'PLDI 2027' }).click();
  await expect(page.locator('#name')).toHaveValue('PLDI');
  await expect(page.locator('#venueKeys')).toHaveValue('pldi');
  await expect(page.locator('#acceptanceRate')).toHaveValue('');
  await expect(page.locator('#submissions')).toHaveValue('');
  await expect(page.locator('#estimated')).not.toBeChecked();
  await expect(page.locator('#verified')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Send by email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit as a GitHub issue' })).toBeVisible();
});

test('CS Confs new submission is a single free-text box, with optional detailed fields', async ({ page }) => {
  await page.goto('./csconfs-submit.html');
  await expect(page.locator('#quick')).toBeVisible();
  await expect(page.locator('#structured-fields')).toBeHidden();
  await page.locator('#quick').fill('Please add a filter by location. https://example.org/conf');
  await page.evaluate(() => { window.open = (u) => { window.__opened = String(u); return null; }; });
  await page.getByRole('button', { name: 'Submit as a GitHub issue' }).click();
  const url = new URL(await page.evaluate(() => window.__opened));
  expect(url.searchParams.get('title')).toContain('https://example.org/conf');
  expect(url.searchParams.get('body')).toContain('filter by location');

  await page.locator('#quick-details-toggle').click();
  await expect(page.locator('#structured-fields')).toBeVisible();
  await expect(page.locator('#name')).toBeEnabled();
});

test('CS Confs location and deadline keywords narrow schedules and survive reloads', async ({ page }) => {
  await page.goto('csconfs.html');
  await expect(page.locator('#csconfs-search')).toBeEnabled();
  await expect(page.locator('#location-select, #deadline-mode, #favorites-select')).toHaveCount(0);
  await page.locator('#csconfs-search').fill('loc: europe deadline: passed');
  await expect(page).toHaveURL(/q=loc/);
  await page.reload();
  await expect(page.locator('#csconfs-search')).toHaveValue('loc: europe deadline: passed');
  await page.goto('csconfs.html?loc=europe&deadline=all&favorites=only');
  await expect(page.locator('#csconfs-search')).toHaveValue('loc: europe deadline: all favorites: only');
});

test('csconfs.html uses the Jobs-style clickable search help', async ({ page }) => {
  await checkSearchHelp(page, { path: 'csconfs.html', inputId: 'csconfs-search', panelId: 'csconfs-search-help', example: 'area: security loc: europe' });
});

test('conference keywords complete values and the secondary menu prefills a correction', async ({ page }) => {
  await page.goto('csconfs.html');
  const input = page.locator('#csconfs-search');
  await expect(input).toBeEnabled();
  await input.fill('loc: europe area: sec');
  await page.getByRole('option', { name: /Security/ }).click();
  await expect(input).toHaveValue('loc: europe area: sec');
  await input.fill('');
  await input.blur();
  const card = page.locator('.schedule-card').first();
  const label = await card.locator('h2').textContent();
  await card.locator('.result-actions summary').click();
  await card.getByRole('link', { name: 'Suggest update' }).click();
  await expect(page.locator('input[name="kind"][value="correction"]')).toBeChecked();
  await expect(page.locator('#target')).toHaveValue(new RegExp(label.trim().split(' ')[0]));
});
