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
  await expect(listbox.locator('.universal-suggestion')).toHaveCount(1);

  await page.locator('#main-search').fill('George Mason University vs Univ');
  const option = listbox.locator('.universal-suggestion', { hasText: 'Univ. of Illinois' });
  await expect(option).toBeVisible();
  await expect(page.locator('#comparison-results')).toBeVisible();
  await option.click();
  await expect(page.locator('#main-search')).toHaveValue('George Mason University vs Univ. of Illinois at Urbana-Champaign');
  await expect(page.locator('#comparison-chart-container')).toBeVisible();
});
