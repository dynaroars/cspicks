import { expect, test } from '@playwright/test';

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const job = { id: 'shared-job', school: 'Example University', department: 'Computer Science', title: 'Assistant Professor of Computer Science', track: 'tenure-track', level: 'assistant', areas: ['ai'], state: 'VA', city: 'Fairfax', deadline: day(3), lastSeenAt: day(-1), url: 'https://example.edu/job', source: 'crawl', summary: 'Research and teaching in computer science.' };
const grant = { id: 'shared-award', name: 'Computer Science Research Fellowship', shortName: 'CS Fellowship', sponsor: 'Example Foundation', sponsorCategory: 'Foundation', targetAudience: ['Faculty'], whoFor: 'Early-career faculty', deadline: new Date(day(3)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), deadlineMonth: 0, amount: '$50,000 research funding', summary: 'Support for research and teaching in computer science.', eligibility: ['Early-career faculty at an eligible institution.'], topics: ['AI'], url: 'https://example.edu/award', estimated: false };

for (const colorScheme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`awards and jobs share a readable card hierarchy at ${width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme });
      await page.route('**/jobs.json', route => route.fulfill({ json: [job] }));
      await page.route('**/grants.json', route => route.fulfill({ json: [grant] }));
      await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, body: '' }));
      const styles = [];
      for (const kind of ['grants', 'jobs']) {
        await page.goto(`${kind}.html`);
        const card = page.locator('.opportunity-card').first();
        await expect(card).toBeVisible();
        await expect(card.locator('.opportunity-title a')).toHaveAttribute('href', kind === 'grants' ? grant.url : job.url);
        const star = card.getByRole('button', { name: /favorite/i });
        await expect(star).toBeVisible();
        await star.click();
        await expect(star).toHaveAttribute('aria-pressed', 'true');
        const positions = await card.evaluate(element => {
          const top = selector => element.querySelector(selector).getBoundingClientRect().top;
          return ['.opportunity-title', '.opportunity-organization', '.opportunity-deadline', '.opportunity-meta', '.opportunity-summary', '.opportunity-topics'].map(top);
        });
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        styles.push(await card.evaluate(element => {
          const properties = (selector, keys) => {
            const style = getComputedStyle(element.querySelector(selector));
            return keys.map(key => style[key]);
          };
          return { title: properties('.opportunity-title', ['fontSize', 'fontFamily', 'color']), type: properties('.opportunity-chip-type', ['color', 'backgroundColor', 'borderRadius']), summary: properties('.opportunity-summary', ['fontSize', 'color']), deadline: properties('.opportunity-deadline-value', ['fontSize', 'color']) };
        }));
        await card.locator('.result-actions summary').click();
        const update = card.getByRole('link', { name: 'Suggest update' });
        await expect(update).toBeVisible();
        await update.click();
        await expect(page).toHaveURL(new RegExp(`${kind}-submit.html\\?id=shared-`));
      }
      expect(styles[0]).toEqual(styles[1]);
    });
  }
}
