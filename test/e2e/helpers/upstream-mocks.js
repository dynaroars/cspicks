// Tiny stand-ins for the CSRankings CSVs, Historical Mode files, and DBLP that Search-style pages load at runtime.
// Fixture publications are dated fixtureYear. pinFixtureDate() puts "today" early the next year, so fixtureYear is
// the last complete year and inside the app's default window (which ends at the last complete year).
export const fixtureYear = 2026;

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
// With { coreExtra: true }: Cora Coreman / Alan Astar have zero rows in `authorInfo` (no CSRankings-tracked
// publications) but one row in core-extra-author-info.csv — Cora in a CORE-A-only venue (aistats), Alan in a
// CORE-A*-only venue (aamas) — exercising the CORE A/A* extra-publications merge for both the `core` and `core-a`
// conference sets. The `area` column there is a venue key, matching generated-author-info.csv's own convention.
const coreExtraRoster = `Cora Coreman,Core Extra University,https://example.test/cora,cora,
Alan Astar,Star Extra University,https://example.test/alan,alan,
`;
const coreExtraInstitutions = `Core Extra University,northamerica,us,https://cs.coreextra.test/
Star Extra University,northamerica,us,https://cs.starextra.test/
`;
const coreExtraAuthorInfo = `name,area,count,adjustedcount,year
Cora Coreman,aistats,1,1,${fixtureYear}
Alan Astar,aamas,1,1,${fixtureYear}
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

export async function pinFixtureDate(page) {
  await page.clock.setFixedTime(new Date(`${fixtureYear + 1}-02-15T12:00:00Z`));
}

export async function mockUpstreams(page, { coreExtra = false } = {}) {
  const csv = body => ({ body, contentType: 'text/csv' });
  const files = {
    'csrankings.csv': csv(csrankings + (coreExtra ? coreExtraRoster : '')),
    'generated-author-info.csv': csv(authorInfo),
    'institutions.csv': csv(institutions + (coreExtra ? coreExtraInstitutions : '')),
    'turing.csv': csv(turing),
    'acm-fellows.csv': csv(acmFellows),
    'countries.csv': csv(countries),
    'dblp-aliases.csv': csv(dblpAliases),
    'name-changes.csv': csv(nameChanges),
    'professor_history_openalex.json': { body: history, contentType: 'application/json' },
    'school-aliases.json': { body: '{}', contentType: 'application/json' },
    'manual_affiliations.csv': csv('name,school,start,end\n'),
    ...(coreExtra ? { 'core-extra-author-info.csv': csv(coreExtraAuthorInfo) } : {}),
  };
  // CSRankings files come from GitHub; Historical Mode and CORE A/A* files from the site itself.
  const fileName = url => url.pathname.split('/').pop();
  await page.route(url => url.hostname === 'raw.githubusercontent.com' || Boolean(files[fileName(url)]), route => {
    const file = files[fileName(new URL(route.request().url()))];
    return file ? route.fulfill(file) : route.abort();
  });
  await page.route('https://dblp.org/**', route => {
    const url = route.request().url();
    if (url.endsWith('/pid/99/9999.xml')) return route.fulfill({ body: dblpXml, contentType: 'application/xml' });
    return route.fulfill({ body: JSON.stringify({ result: { hits: {} } }), contentType: 'application/json' });
  });
}
