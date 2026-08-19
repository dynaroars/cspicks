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
  await expect(page.locator('#end-year option')).toHaveCount(2);
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
  await expect(page.locator('#verified')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Send by email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit as a GitHub issue' })).toBeVisible();
});
