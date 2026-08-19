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

test('NSF funding beta searches nationwide data and aggregates fractional awards', async ({ page }) => {
  await page.goto('funding.html');
  await expect(page.getByRole('link', { name: '🇺🇸 NSF Funding' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.funding-warning')).toHaveCount(0);
  await expect(page.locator('#funding-award-count')).toContainText(/[\d,]+ NSF CS awards during/);
  await expect(page.locator('.funding-filters')).not.toContainText('NSF · USA');
  await expect(page.locator('#start-year')).toHaveCSS('border-top-style', 'solid');
  expect(await page.locator('#start-year').evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe('none');
  const countLabelBox = await page.locator('#funding-award-count').boundingBox();
  const startYearBox = await page.locator('#start-year').boundingBox();
  expect(Math.abs((countLabelBox.y + countLabelBox.height / 2) - (startYearBox.y + startYearBox.height / 2))).toBeLessThan(2);
  await expect(page.locator('#funding-status')).toBeHidden();
  await page.locator('#nsf-data-health-toggle').click();
  await expect(page.locator('#nsf-data-health')).toBeVisible();
  await expect(page.locator('#nsf-data-health-stats')).toContainText('NSF funding data health');
  await expect(page.locator('#nsf-data-health-stats')).toContainText('Program managers');
  // The panel floats over the page rather than extending it, so opening it
  // neither moves the reader nor pushes the results around.
  const floating = await page.evaluate(() => {
    const panel = document.querySelector('#nsf-data-health');
    const box = panel.getBoundingClientRect();
    return {
      position: getComputedStyle(panel).position,
      onScreen: box.top >= 0 && box.bottom <= window.innerHeight + 1,
      scrollY: window.scrollY
    };
  });
  expect(floating.position).toBe('fixed');
  expect(floating.onScreen).toBe(true);
  expect(floating.scrollY).toBe(0);
  await page.locator('#nsf-data-health-toggle').click();
  await expect(page.locator('#nsf-data-health')).toBeHidden();

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
  await page.goto('funding.html?q=George%20Mason%20University%20vs%20Univ.%20of%20Illinois%20at%20Urbana-Champaign');
  const comparison = page.locator('#funding-comparison');
  await expect(comparison).toBeVisible();
  await expect(comparison.locator('.comparison-scoreboard')).toContainText('NSF awards');
  await expect(comparison.locator('.comparison-scoreboard')).toContainText('CS faculty with awards');
  await expect(comparison.locator('.comparison-cards .funding-card')).toHaveCount(2);
  // The comparison replaces the ranked columns, and the cards open in full.
  await expect(page.locator('#funding-school-results .funding-card')).toHaveCount(0);
  await expect(comparison.locator('.funding-card.collapsed')).toHaveCount(0);

  await page.goto('funding.html?q=George%20Mason%20University%20vs%20Nowhere%20Tech');
  await expect(comparison).toContainText('No match found');

  await page.goto('funding.html?q=George%20Mason%20University');
  await expect(page.locator('#funding-school-results .funding-card').first()).toBeVisible();
  await expect(comparison).toBeHidden();
});

test('funding suggestions complete both sides of a vs query', async ({ page }) => {
  await page.goto('funding.html');
  const listbox = page.locator('#universal-suggestions');
  // A comparison chip advertises the mode before anything is typed.
  await expect(page.locator('#funding-examples button', { hasText: ' vs ' })).toHaveCount(1);
  await page.locator('#funding-search').fill('CAREER');
  await expect(listbox).toBeVisible();
  await expect(listbox).toContainText('NSF programs');

  // Comparing only accepts universities and people, so programs drop out.
  await page.locator('#funding-search').fill('George Mason University vs Illinois');
  await expect(listbox).not.toContainText('NSF programs');
  const option = listbox.locator('.universal-suggestion', { hasText: 'Univ. of Illinois' }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator('#funding-search')).toHaveValue('George Mason University vs Univ. of Illinois at Urbana-Champaign');
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
