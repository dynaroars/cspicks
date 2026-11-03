import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const longDate = offset => new Date(Date.now() + offset * 86400000)
  .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const grants = [
  {
    id: 'staged-yip', name: 'Staged Young Investigator Program', shortName: 'Staged YIP', sponsor: 'AFOSR', sponsorCategory: 'Government',
    targetAudience: ['Faculty'], whoFor: 'Early-career faculty', deadline: `White paper: ${longDate(-3)}; Full proposal: ${longDate(30)} (Annual)`,
    deadlineMonth: 10, amount: '$450,000', summary: 'Two-stage call.', eligibility: ['US citizens or permanent residents'], topics: ['AI/ML'],
    url: 'https://example.org/yip', addedAt: day(-1), citizenship: 'us-citizen-or-pr',
    deadlines: [{ stage: 'White paper', date: day(-3), required: true }, { stage: 'Full proposal', date: day(30) }]
  },
  {
    id: 'open-fellowship', name: 'Open Fellowship', shortName: 'Open', sponsor: 'Example Foundation', sponsorCategory: 'Non-Profit / Foundation',
    targetAudience: ['PhD Students'], whoFor: 'PhD students', deadline: 'Rolling', deadlineMonth: 0, amount: '$1', summary: 'Open to all.',
    eligibility: ['International students may apply'], topics: ['Theory'], url: 'https://example.org/open', addedAt: day(-100),
    lastVerifiedAt: day(-2), citizenship: 'open'
  }
];

const jobs = [
  { id: 'gmu-soft', school: 'George Mason University', department: 'Computer Science', title: 'Assistant Professor, Software Engineering',
    track: 'tenure-track', level: 'assistant', areas: ['soft'], state: 'VA', city: 'Fairfax', deadline: day(20), reviewBegins: day(5),
    lastSeenAt: day(-2), addedAt: day(-1), url: 'https://example.edu/gmu', source: 'crawl', verified: true }
];

test('awards show stages, eligibility, freshness, and export starred deadlines to a calendar', async ({ page }) => {
  await page.route('**/grants.json', route => route.fulfill({ json: grants }));
  await page.goto('grants.html');
  const card = page.locator('#staged-yip');
  await expect(card.locator('.opportunity-new-badge')).toHaveText('New');
  await expect(card.locator('.opportunity-chip-eligibility')).toHaveText('US citizens or permanent residents');
  await expect(card.locator('.opportunity-stage.is-passed')).toContainText('White paper');
  await expect(card.locator('.opportunity-stage.is-next')).toContainText('Full proposal');
  await expect(card.locator('.opportunity-freshness.is-stale')).toContainText('Not re-verified');
  await expect(page.locator('#open-fellowship .opportunity-freshness')).toContainText('✓ Verified');
  await expect(page.locator('.context-note')).toBeVisible();

  await page.locator('#grants-search').fill('citizenship: international');
  await expect(page.locator('.grant-card')).toHaveCount(1);
  await page.goto('grants.html');

  await expect(page.locator('#favorites-actions')).toBeHidden();
  await card.locator('.favorite-toggle').click();
  await expect(page.locator('#favorites-actions')).toBeVisible();
  await page.locator('#favorites-actions summary').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-favorites-calendar').click()]);
  expect(download.suggestedFilename()).toBe('cspicks-starred-award-deadlines.ics');
  const ics = await readFile(await download.path(), 'utf8');
  expect(ics).toContain(`DTSTART;VALUE=DATE:${day(30).replace(/-/g, '')}`);
  expect(ics).toContain('SUMMARY:Staged YIP: Full proposal');
  expect(ics).not.toContain('SUMMARY:Staged YIP: White paper');
});

test('starred jobs track application status and export dates to a calendar', async ({ page }) => {
  await page.route('**/jobs.json', route => route.fulfill({ json: jobs }));
  await page.route('**/labs.json', route => route.fulfill({ json: [] }));
  await page.goto('jobs.html');
  const card = page.locator('#gmu-soft');
  await expect(card.locator('.opportunity-new-badge')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Faculty in Search' })).toBeVisible();
  await expect(card.locator('[data-progress-id]')).toHaveCount(0);

  await card.locator('.favorite-toggle').click();
  const picker = page.locator('#gmu-soft [data-progress-id]');
  await picker.selectOption('applied');
  await page.reload();
  await expect(page.locator('#gmu-soft [data-progress-id]')).toHaveValue('applied');
  await page.locator('#jobs-search').fill('progress: applied');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await page.locator('#jobs-search').fill('progress: offer');
  await expect(page.locator('.job-card')).toHaveCount(0);
  await page.goto('jobs.html');

  await page.locator('#gmu-soft .result-actions summary').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#gmu-soft [data-calendar-job]').click()]);
  const ics = await readFile(await download.path(), 'utf8');
  expect(ics).toContain(`DTSTART;VALUE=DATE:${day(5).replace(/-/g, '')}`);
  expect(ics).toContain(`DTSTART;VALUE=DATE:${day(20).replace(/-/g, '')}`);
});
