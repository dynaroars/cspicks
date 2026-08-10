import { expect, test } from '@playwright/test';

const currentYear = new Date().getFullYear();
const csrankings = `name,affiliation,homepage,scholarid,orcid
Hai Duong 0001,George Mason University,https://example.test/hai,hai,0000-0001-2345-6789
Alice Example,Univ. of Illinois at Urbana-Champaign,https://example.test/alice,alice,0000-0000-0000-0000
Erin Europe,University of Oxford,https://example.test/erin,erin,0000-0000-0000-0000
`;
const authorInfo = `name,area,year,count,adjustedcount
Hai Duong 0001 [Tech],icse,${currentYear},2,1
Hai Duong 0001 [Tech],ase,${currentYear},1,0.5
Alice Example,pldi,${currentYear},2,1
Erin Europe,nips,${currentYear},1,0.5
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
  'Hai Duong 0001': [{ school: 'George Mason University', start: currentYear - 5, end: currentYear }]
});
const dblpXml = `<?xml version="1.0" encoding="UTF-8"?>
<dblpperson><person><author>Exact DBLP Person</author></person><r><inproceedings key="conf/icse/Exact${currentYear}"><author>Exact DBLP Person</author><author>Coauthor</author><title>Exact paper</title><pages>1-12</pages><year>${currentYear}</year><booktitle>ICSE</booktitle></inproceedings></r></dblpperson>`;

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
  await mockUpstreams(page);
});

test('default view ranks universities and people side by side, and clears stale analysis after a region change', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: '🔎 Search' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#school-results')).toContainText('George Mason University');
  await expect(page.locator('#prof-results')).toContainText('Hai Duong');
  await expect(page.locator('#school-results .card-header').first()).toHaveJSProperty('tagName', 'BUTTON');
  // Universities occupy the left column, people the right.
  const columns = await page.evaluate(() => {
    const schools = document.querySelector('#school-results').getBoundingClientRect();
    const people = document.querySelector('#prof-results').getBoundingClientRect();
    return { sameRow: Math.abs(schools.y - people.y) < 5, schoolsFirst: schools.x < people.x };
  });
  expect(columns).toEqual({ sameRow: true, schoolsFirst: true });

  await page.locator('#main-search').fill('George Mason University');
  await expect(page.locator('#integrated-analysis')).toBeVisible();
  await expect(page.locator('#school-results .card-header')).toHaveJSProperty('tagName', 'DIV');
  await expect(page.locator('#school-results .toggle-icon')).toHaveCount(0);
  await expect(page.locator('#ranking-stats')).toContainText('Profile completeness');
  const analysisCards = page.locator('.analysis-school-metrics .school-metric');
  const analysisWidths = await analysisCards.evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().width)));
  expect(analysisWidths.length).toBeGreaterThan(1);
  expect(new Set(analysisWidths).size).toBe(1);
  const contributions = page.locator('#school-results .attribution-details');
  await expect(contributions).not.toHaveAttribute('open', '');
  await contributions.locator('summary').click();
  await expect(contributions.locator('.attribution-content')).toBeVisible();
  await expect(page.locator('#school-results .faculty-tag')).toContainText('Hai Duong 2 papers (1.0 adjusted)');
  await expect(page.locator('#school-results .school-area-header')).toContainText('2 papers (1.0 adjusted)');

  await page.locator('#region-select').selectOption('europe');
  await expect(page.locator('#integrated-analysis')).toBeHidden();
  await expect(page).not.toHaveURL(/target=/);
});

test('choosing faculty from a university switches analysis to that professor', async ({ page }) => {
  await page.goto('./');
  await page.locator('#main-search').fill('George Mason University');
  await expect(page).toHaveURL(/targetType=school/);
  await page.locator('#school-results .faculty-tag', { hasText: 'Hai Duong' }).click();
  await expect(page.locator('#prof-results')).toContainText('Hai Duong');
  await expect(page).toHaveURL(/targetType=researcher/);
  expect(new URL(page.url()).searchParams.get('target')).toBe('Hai Duong 0001');
  await expect(page.locator('#prof-results .card-header')).toHaveJSProperty('tagName', 'DIV');
  await expect(page.locator('#prof-results .toggle-icon')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Faculty Diversity/ })).toBeHidden();
});

test('professor cards show official CSRankings distinctions', async ({ page }) => {
  await page.goto('./');
  await page.locator('#main-search').fill('Hai Duong');
  const card = page.locator('#prof-results .card');
  await expect(card).toHaveCount(1);
  // One flag per card, with the university and profile links on the name row.
  await expect(card.locator('.country-flag')).toHaveCount(1);
  await expect(card.locator('.card-header-row')).toContainText('George Mason University');
  await expect(card.locator('.card-header-row .profile-link')).toHaveCount(4);
  await expect(card).toContainText('Turing Award · 2025');
  await expect(card).toContainText('ACM Fellow · 2024');
  await expect(card).toContainText('2 papers (1.0 adjusted)');
  await expect(card.getByRole('link', { name: 'ORCID' })).toHaveAttribute('href', 'https://orcid.org/0000-0001-2345-6789');
  await expect(card).toContainText('CSRankings unit: Tech');
  await expect(card.locator('.year-column')).toHaveAttribute('data-tooltip', new RegExp(`${currentYear}: 2 papers \\(1\\.0 adjusted\\)`));
});

test('official aliases resolve professors and schools show country and department links', async ({ page }) => {
  await page.goto('./');
  await page.locator('#main-search').fill('H. Duong');
  await expect(page.locator('#prof-results')).toContainText('Hai Duong');
  await expect(page.locator('#integrated-analysis')).toBeVisible();

  await page.locator('#main-search').fill('George Mason University');
  const school = page.locator('#school-results .card');
  await expect(school).toContainText('United States of America');
  await expect(school.getByRole('link', { name: 'Department website' })).toHaveAttribute('href', 'https://cs.gmu.test/');
});

test('award badges appear on cards but are not searchable', async ({ page }) => {
  await page.goto('./');
  await page.locator('#main-search').fill('Hai Duong');
  await expect(page.locator('#prof-results .card')).toHaveCount(1);
  await expect(page.locator('#prof-results .card')).toContainText('Turing Award · 2025');

  // The distinction filters are gone: these are ordinary text queries now.
  await page.locator('#main-search').fill('Turing Award');
  await expect(page.locator('#prof-results .card')).toHaveCount(0);
});

test('vs syntax compares two targets in place of search results', async ({ page }) => {
  await page.goto('./');
  const comparison = page.locator('#comparison-results');
  const summary = page.locator('#comparison-summary');

  await page.locator('#main-search').fill('George Mason University vs Univ. of Illinois at Urbana-Champaign');
  await expect(comparison).toBeVisible();
  await expect(page.locator('#comparison-title')).toHaveText('George Mason University vs Univ. of Illinois at Urbana-Champaign');
  await expect(summary).toContainText('What explains the rank gap?');
  await expect(summary).toContainText('Software Engineering');
  await expect(page.locator('#comparison-chart-container')).toBeVisible();
  await expect(page.locator('#school-results .card')).toHaveCount(0);
  await expect(page.locator('#integrated-analysis')).toBeHidden();
  await expect(page).not.toHaveURL(/target=/);

  // Researchers compare too, but the rank-gap breakdown is school-only.
  await page.locator('#main-search').fill('Hai Duong vs Alice Example');
  await expect(page.locator('#comparison-title')).toHaveText('Hai Duong vs Alice Example');
  await expect(summary).toContainText('leads in');
  await expect(summary).not.toContainText('What explains the rank gap?');

  await page.locator('#main-search').fill('Hai Duong vs George Mason University');
  await expect(summary).toContainText('Compare two universities or two professors');
  await expect(page.locator('#comparison-chart-container')).toBeHidden();

  await page.locator('#main-search').fill('George Mason University');
  await expect(comparison).toBeHidden();
  await expect(page.locator('#integrated-analysis')).toBeVisible();
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

test('rankings toggle ranks universities and is remembered', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#school-results .card').first()).toBeVisible();
  await expect(page.locator('main .result-position')).toHaveCount(0);

  await page.locator('#show-rankings').check();
  await expect(page).toHaveURL(/rankings=true/);
  // Universities lead with their rank; people are numbered by list position.
  await expect(page.locator('#school-results .result-position').first()).toHaveText('1.');
  await expect(page.locator('#prof-results .result-position').first()).toHaveText('1.');

  // The choice survives a link that carries no filter parameters.
  await page.goto('./?q=George%20Mason%20University');
  await expect(page.locator('#school-results .card')).toBeVisible();
  await expect(page.locator('#show-rankings')).toBeChecked();
  await expect(page.locator('#school-results .result-position')).toHaveCount(1);

  // An explicit parameter still wins over the remembered value.
  await page.goto('./?q=George%20Mason%20University&rankings=false');
  await expect(page.locator('#school-results .card')).toBeVisible();
  await expect(page.locator('#school-results .result-position')).toHaveCount(0);
});

test('area queries rank universities within that area', async ({ page }) => {
  await page.goto('./?q=Software%20Engineering&rankings=true');
  await expect(page.locator('#school-results .card').first()).toBeVisible();
  // The fixture has one Software Engineering school, ranked first in the area
  // rather than by its overall position.
  await expect(page.locator('#school-results .result-position').first()).toHaveText('1.');
  await expect(page.locator('#area-people-results .result-position').first()).toHaveText('1.');
  // Counts are scoped to the area: faculty publishing in it, papers within it.
  await expect(page.locator('#school-results .card-badge')).toHaveText('1 Faculty');
  await expect(page.locator('#area-people-results .card-badge').first()).toContainText('papers');
});

test('conference and area queries list universities beside their people', async ({ page }) => {
  await page.goto('./?q=ICSE');
  await expect(page.locator('#school-results .card').first()).toBeVisible();
  const columns = await page.evaluate(() => {
    const schools = document.querySelector('#school-results').getBoundingClientRect();
    const people = document.querySelector('#area-people-results').getBoundingClientRect();
    return { sameRow: Math.abs(schools.y - people.y) < 5, schoolsFirst: schools.x < people.x };
  });
  expect(columns).toEqual({ sameRow: true, schoolsFirst: true });
  // Lists grow on scroll instead of offering a "see more" button.
  await expect(page.locator('[data-show-more-schools], [data-show-more-people]')).toHaveCount(0);
  await expect(page.locator('#search-context-header')).toContainText('Results for Conference: ICSE');
});

test('CORE A conference trends include a published ASE venue', async ({ page }) => {
  await page.goto('./');
  await page.locator('#conf-set').selectOption('core-a');
  await page.locator('#main-search').fill('George Mason University');
  await expect(page.locator('#integrated-analysis')).toBeVisible();
  await page.getByRole('tab', { name: /Conference Trends/ }).click();
  await expect(page.locator('#conf-checkbox-groups')).toContainText('ASE');
});

test('historical mode loads affiliation data without an extra status box', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#history-warning')).toHaveCount(0);
  await page.locator('#historical-mode').check();
  await expect(page.locator('#historical-mode')).toBeChecked();
});

test('professor analysis shows activity, area, and venue patterns', async ({ page }) => {
  await page.goto('./');
  await page.locator('#main-search').fill('Hai Duong');
  await expect(page.locator('#integrated-analysis')).toBeVisible();
  const visibleTabs = page.locator('.analysis-nav-tabs .nav-tab:visible');
  await expect(visibleTabs).toHaveCount(3);
  const tabWidths = await visibleTabs.evaluateAll(tabs => tabs.map(tab => Math.round(tab.getBoundingClientRect().width)));
  expect(new Set(tabWidths).size).toBe(1);
  await expect(page.locator('#ranking-stats')).toContainText('Active years');
  await expect(page.locator('#ranking-stats')).toContainText('Peak year');
  await expect(page.locator('#researcher-highlights')).toBeVisible();
  const highlightsBox = await page.locator('#researcher-highlights').boundingBox();
  const tabsBox = await page.locator('.analysis-nav-tabs').boundingBox();
  expect(highlightsBox.y).toBeLessThan(tabsBox.y);

  await page.getByRole('tab', { name: /Area Growth/ }).click();
  await expect(page.locator('#area-insights')).toContainText('Primary area');
  await expect(page.locator('#area-insights')).toContainText('Research breadth');

  await page.getByRole('tab', { name: /Conference Trends/ }).click();
  await expect(page.locator('#venue-insights')).toContainText('Venue breadth');
  await expect(page.locator('#venue-insights')).toContainText('Primary venue');
});

test('region defaults are locale-aware and a user choice carries across every tab', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#region-select')).toHaveValue('us');
  await page.locator('#region-select').selectOption('europe');

  await page.goto('discoveries.html');
  await expect(page.locator('#region-select')).toHaveValue('europe');
  await expect(page.locator('#discoveries-history-warning')).toHaveCount(0);
  await expect(page.locator('.tool-intro .eyebrow')).toHaveCount(0);
  await page.goto('simulator.html');
  await expect(page.locator('#region-select')).toHaveValue('europe');
  await expect(page.locator('.tool-intro .eyebrow')).toHaveCount(0);
  await page.goto('funding.html');
  await expect(page.locator('#funding-award-count')).toContainText('NSF CS awards during');

  await page.goto('./?region=world');
  await expect(page.locator('#region-select')).toHaveValue('world');
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
  // Measure both rects in one frame: the toggle smooth-scrolls, and separate
  // boundingBox() calls would sample different points of that animation.
  const stacking = await page.evaluate(() => {
    const results = document.querySelector('.funding-results-container').getBoundingClientRect();
    const health = document.querySelector('#nsf-data-health').getBoundingClientRect();
    return { resultsBottom: results.bottom, healthTop: health.top };
  });
  expect(stacking.healthTop).toBeGreaterThanOrEqual(stacking.resultsBottom);
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

test('funding stays off the search page and on discoveries', async ({ page }) => {
  await page.goto('./?q=Hai%20Duong');
  await expect(page.locator('#prof-results .card-stats')).toContainText('papers');
  await expect(page.locator('#prof-results')).not.toContainText('NSF');
  await expect(page.locator('#integrated-analysis')).not.toContainText('NSF');

  await page.goto('discoveries.html');
  await expect(page.getByRole('heading', { name: 'NSF funding patterns across US universities' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Largest attributed NSF portfolios/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Largest matched collaborative projects/ })).toBeVisible();
});

test('simulator preserves CSRankings suffixes and accepts an exact DBLP profile link', async ({ page }) => {
  await page.goto('simulator.html');
  await expect(page.getByRole('link', { name: '☠️ Simulator' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.simulator-disclaimer')).toContainText('Experimental simulator.');
  await expect(page.locator('.simulator-disclaimer')).toHaveClass(/context-note/);
  await expect(page.locator('.simulator-disclaimer')).toHaveCSS('border-left-style', 'solid');
  // The former footer links now live beside the title as icons.
  await expect(page.locator('footer')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'ROARS Lab' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'FAQ, methods and data' })).toBeVisible();
  await page.locator('#sim-univ-search').fill('George Mason');
  await page.locator('#sim-univ-results .sim-item').click();

  const faculty = page.locator('.sim-faculty-option', { hasText: 'Hai Duong' });
  await faculty.locator('input').check();
  await expect(page.locator('#sim-candidates-input')).toHaveValue('Hai Duong 0001');

  await page.locator('#sim-candidates-input').fill('https://dblp.org/pid/99/9999.html');
  await page.locator('#sim-analyze-btn').click();
  await expect(page.locator('#sim-candidates-results')).toContainText('Exact DBLP Person');
  await expect(page.locator('#sim-candidates-results')).toContainText('1 rank-counted paper');
  await expect(page.locator('#sim-candidates-results')).not.toContainText('authors');
});
