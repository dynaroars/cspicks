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

test('default view ranks universities and people side by side, and clears stale analysis after a region change', async ({ page }) => {
  // Pinned to the CSRankings ordering: per-capita is the default, and it omits
  // departments below five publishing faculty, which this fixture is.
  await page.goto('./?percapita=false');
  await expect(page.getByRole('link', { name: '🔎 Search' })).toHaveAttribute('aria-current', 'page');
  // The ranking columns use short institution names where one exists.
  await expect(page.locator('#school-results')).toContainText('GMU');
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
  // The score breakdown opens with the card; collapsing is the reader's choice.
  const contributions = page.locator('#school-results .attribution-details');
  await expect(contributions).toHaveAttribute('open', '');
  await expect(contributions.locator('.attribution-content')).toBeVisible();
  await contributions.locator('summary').click();
  await expect(contributions.locator('.attribution-content')).toBeHidden();
  await contributions.locator('summary').click();
  // The department roster and the subfield list each carry the professor, and
  // here their totals coincide because this professor has one counted area.
  await expect(page.locator('#school-results .school-faculty-roster .faculty-tag')).toContainText('Hai Duong 3 papers (1.5 adjusted)');
  await expect(page.locator('#school-results .school-area-section .faculty-tag')).toContainText('Hai Duong 3 papers (1.5 adjusted)');
  await expect(page.locator('#school-results .school-area-header')).toContainText('3 papers (1.5 adjusted)');

  await page.locator('#region-select').selectOption('europe');
  await expect(page.locator('#integrated-analysis')).toBeHidden();
  await expect(page).not.toHaveURL(/target=/);
});

test('malformed shared filter parameters fall back to valid controls', async ({ page }) => {
  await page.goto('./?region=unknown&start=not-a-year&end=99999&percapita=false');
  await expect(page.locator('#region-select')).toHaveValue('us');
  await expect(page.locator('#start-year')).toHaveValue('2016');
  await expect(page.locator('#end-year')).toHaveValue('2027');
  await expect(page.locator('#school-results')).toContainText('GMU');
});

test('the shared filter bar stays a single roomy row', async ({ page }) => {
  const measurements = async () => page.locator('#filter-bar').evaluate(bar => ({
    toggleWidths: [...bar.querySelectorAll('.filter-checkbox')].map(label => Math.round(label.getBoundingClientRect().width)),
    wraps: new Set([...bar.querySelectorAll('.filter-group')].map(group => Math.round(group.getBoundingClientRect().top))).size
  }));

  await page.goto('./?percapita=false');
  await expect(page.locator('#school-results')).toContainText('GMU');
  const layout = await measurements();
  expect(layout.toggleWidths.every(width => width >= 80)).toBe(true);
  expect(layout.wraps).toBe(1);
});

for (const width of [1440, 820, 390]) {
  test(`help panels open beside their own ⓘ at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./?percapita=false');
    await page.locator('#main-search').fill('George Mason University');
    await expect(page.locator('#integrated-analysis')).toBeVisible();
    await expect(page.locator('#ranking-stats')).toContainText('Profile completeness');
    // Dismiss the autocomplete overlay (it sits above everything) without touching
    // any control this test also wants to hover.
    await page.locator('#main-search').blur();
    await expect(page.locator('#universal-suggestions')).toBeHidden();

    const triggers = page.locator([
      '#filter-bar .tooltip-trigger',
      '#integrated-analysis .analysis-tab-info:visible',
      '#integrated-analysis .metric-info:visible',
      '#school-results .card:not(.collapsed) .contribution-tooltip:visible'
    ].join(', '));
    const count = await triggers.count();
    expect(count).toBeGreaterThan(4);
    for (let i = 0; i < count; i++) {
      const trigger = triggers.nth(i);
      await trigger.scrollIntoViewIfNeeded();
      await trigger.hover();
      const panel = trigger.locator('.tooltip-content');
      await expect(panel).toBeVisible();
      const [icon, box] = [await trigger.boundingBox(), await panel.boundingBox()];
      // Filter controls describe themselves through their own text; the
      // analysis/metric triggers are icons carrying an aria-label.
      const label = (await trigger.getAttribute('aria-label'))
        || (await trigger.innerText()).trim().split('\n')[0];
      const iconCenter = icon.x + icon.width / 2;
      // On screen, vertically adjacent to the icon, and horizontally over it —
      // a panel anchored to some ancestor instead drifts away from its trigger.
      expect(box.x, `${label} stays on screen`).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, `${label} stays on screen`).toBeLessThanOrEqual(width + 1);
      expect(iconCenter, `${label} spans its icon`).toBeGreaterThanOrEqual(box.x - 1);
      expect(iconCenter, `${label} spans its icon`).toBeLessThanOrEqual(box.x + box.width + 1);
      const gap = box.y > icon.y ? box.y - (icon.y + icon.height) : icon.y - (box.y + box.height);
      expect(gap, `${label} hugs its icon`).toBeGreaterThanOrEqual(0);
      expect(gap, `${label} hugs its icon`).toBeLessThanOrEqual(16);
      await page.mouse.move(0, 0);
    }
  });
}

test('choosing faculty from a university switches analysis to that professor', async ({ page }) => {
  await page.goto('./');
  await page.locator('#main-search').fill('George Mason University');
  await expect(page).toHaveURL(/targetType=school/);
  await page.locator('#school-results .school-faculty-roster .faculty-tag', { hasText: 'Hai Duong' }).click();
  await expect(page.locator('#prof-results')).toContainText('Hai Duong');
  await expect(page).toHaveURL(/targetType=researcher/);
  expect(new URL(page.url()).searchParams.get('target')).toBe('Hai Duong 0001');
  await expect(page.locator('#prof-results .card-header')).toHaveJSProperty('tagName', 'DIV');
  await expect(page.locator('#prof-results .toggle-icon')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Faculty Diversity/ })).toBeHidden();
});

test('per-capita ordering is off by default and can be turned on', async ({ page }) => {
  await page.goto('./');
  // The default view reproduces CSRankings, which ranks by departmental total.
  await expect(page.locator('#per-capita-mode')).not.toBeChecked();
  await expect(page.locator('#school-results .card').first()).toBeVisible();
  await expect(page).not.toHaveURL(/percapita=true/);
  // Every fixture department is below the five-faculty floor, so switching the
  // ordering on leaves it with nothing to rank.
  await page.locator('#per-capita-mode').check();
  await expect(page.locator('#school-results .card')).toHaveCount(0);
  await expect(page).toHaveURL(/percapita=true/);
});

test('professor cards show official roster distinctions', async ({ page }) => {
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
  await expect(card).toContainText('3 papers (1.5 adjusted)');
  await expect(card.getByRole('link', { name: 'ORCID' })).toHaveAttribute('href', 'https://orcid.org/0000-0001-2345-6789');
  await expect(card).toContainText('Unit: Tech');
  await expect(card.locator('.papers-list')).toBeHidden();
  await card.locator('[data-action="toggle-papers"]').click();
  await expect(card.locator('.papers-list')).toBeVisible();
  await expect(card.locator('.papers-list')).toContainText(`ICSE ${fixtureYear}: 2 paper(s), 1.00 adjusted`);
  await expect(card.locator('.papers-list')).toContainText(`ASE ${fixtureYear}: 1 paper(s), 0.50 adjusted`);
  await card.locator('[data-action="toggle-papers"]').click();
  await expect(card.locator('.papers-list')).toBeHidden();
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

test('example searches run without opening autocomplete', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.search-examples')).toContainText('Try:');
  const example = page.locator('[data-search-example]').first();
  const query = await example.getAttribute('data-search-example');
  await example.click();
  await expect(page.locator('#main-search')).toHaveValue(query);
  await expect(page.locator('#main-search')).toBeFocused();
  await expect(page.locator('#universal-suggestions')).toBeHidden();
  await expect(page).toHaveURL(/q=/);
});

test('rankings toggle ranks universities and is remembered', async ({ page }) => {
  await page.goto('./?percapita=false');
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

test('university card reflects per-capita rank when Show Rankings and Per capita are enabled', async ({ page }) => {
  await page.goto('./?q=George%20Mason%20University&rankings=true&percapita=false');
  await expect(page.locator('#school-results .card')).toBeVisible();
  await expect(page.locator('#school-results .result-position')).toHaveCount(1);
  await page.locator('#main-search').blur();

  await page.locator('#per-capita-mode').check();
  await expect(page).toHaveURL(/percapita=true/);
  // In the test fixture, GMU has < 5 faculty so it has no per-capita rank
  await expect(page.locator('#school-results .result-position')).toHaveCount(0);
});

test('data health audits CSRankings default independently of the selected venue set', async ({ page }) => {
  await page.goto('./?confSet=core&percapita=true');
  await page.locator('#data-health-toggle').click();
  const panel = page.locator('#site-data-health');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Matches CSRankings defaultYes');
  await expect(panel).toContainText('source data, calculations, metadata, and venue rules');
  await expect(panel).toContainText('Current selectionCustomized');
  await expect(panel).toContainText('a non-default venue set, per-capita ranking');
});

test('area queries rank universities within that area', async ({ page }) => {
  await page.goto('./?q=Software%20Engineering&rankings=true');
  await expect(page.locator('#school-results .card').first()).toBeVisible();
  // The fixture has one Software Engineering school, ranked first in the area
  // rather than by its overall position.
  await expect(page.locator('#school-results .result-position').first()).toHaveText('1.');
  await expect(page.locator('#area-people-results .result-position').first()).toHaveText('1.');
  // Counts are scoped to the area: faculty publishing in it, papers within it.
  await expect(page.locator('#school-results .card-badge').first()).toHaveText('1 Faculty');
  await expect(page.locator('#school-results .card-badge').nth(1)).toContainText('adjusted)');
  await expect(page.locator('#area-people-results .card-badge').first()).toContainText('papers (');
  await expect(page.locator('#area-people-results .card-badge').first()).toContainText('adjusted)');
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
  // The header names the venue and spells out the abbreviation.
  await expect(page.locator('#search-context-header')).toHaveText('ICSE (International Conference on Software Engineering)');
});

test('CORE A conference trends include a published ASE venue', async ({ page }) => {
  await page.goto('./');
  await page.locator('#conf-set').selectOption('core-a');
  await page.locator('#main-search').fill('George Mason University');
  await expect(page.locator('#integrated-analysis')).toBeVisible();
  await page.getByRole('tab', { name: /Conference Trends/ }).click();
  await expect(page.locator('#conf-checkbox-groups')).toContainText('ASE');
});

test('university analysis renders Activity, Faculty Diversity, and Publishing Effort tabs without errors', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('./');
  await page.locator('#main-search').fill('George Mason University');
  await expect(page.locator('#integrated-analysis')).toBeVisible();

  // 1. Activity tab (default active tab for schools)
  await expect(page.locator('#school-trends-view')).toBeVisible();
  await expect(page.locator('#ranking-stats')).toContainText('Rank movement');
  await expect(page.locator('#ranking-stats')).toContainText('Momentum');
  await expect(page.locator('#rankingChart')).toBeVisible();

  // 2. Faculty Diversity tab
  await page.getByRole('tab', { name: /Faculty Diversity/ }).click();
  await expect(page.locator('#faculty-diversity-view')).toBeVisible();
  await expect(page.locator('#diversityChart')).toBeVisible();

  // 3. Publishing Effort tab
  await page.getByRole('tab', { name: /Publishing Effort/ }).click();
  await expect(page.locator('#effort-view')).toBeVisible();
  await expect(page.locator('#effortChart')).toBeVisible();

  // 4. Area Growth tab
  await page.getByRole('tab', { name: /Area Growth/ }).click();
  await expect(page.locator('#area-growth-view')).toBeVisible();
  await expect(page.locator('#areaChart')).toBeVisible();

  // 5. Collaboration tab
  await page.getByRole('tab', { name: /Collaboration/ }).click();
  await expect(page.locator('#collaboration-view')).toBeVisible();
  await expect(page.locator('#collaboration-stats')).toBeVisible();

  // 6. Rank Stability tab
  await page.getByRole('tab', { name: /Rank Stability/ }).click();
  await expect(page.locator('#stability-view')).toBeVisible();

  // Verify zero page/console uncaught errors occurred across all tab transitions
  expect(pageErrors).toEqual([]);
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
  // The school-only tabs, including Rank Stability, hide for a researcher.
  const visibleTabs = page.locator('.analysis-nav-tabs .nav-tab:visible');
  await expect(visibleTabs).toHaveCount(3);
  await expect(page.locator('.nav-tab[data-tab="stability"]')).toBeHidden();
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

  await page.goto('./?view=discoveries');
  await expect(page.locator('#region-select')).toHaveValue('europe');
  await page.goto('simulator.html');
  await expect(page.locator('#region-select')).toHaveValue('europe');
  await expect(page.locator('.tool-intro .eyebrow')).toHaveCount(0);
  await page.goto('nsf.html');
  await expect(page.locator('#funding-award-count')).toContainText('NSF CS awards during');

  await page.goto('./?region=world');
  await expect(page.locator('#region-select')).toHaveValue('world');
});
