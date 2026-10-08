#!/usr/bin/env node
/**
 * Render JavaScript-heavy hiring pages (Interfolio, Workday, PeopleAdmin, PeopleSoft, NEOGOV, ...) with a
 * headless Chromium so the US jobs crawl can read them. Plain fetch tools see only the empty app shell.
 * This is an ordinary browser session: no user-agent spoofing and no bot-check bypass. If a site answers
 * 403 or shows a challenge page, record the school as `blocked` instead of working around it.
 *
 * One-time setup (cloud runs need it after `npm ci`):  npx playwright install --with-deps chromium
 *
 *   npm run render:jobs -- <url> [<url> ...]            print each page's visible text
 *   npm run render:jobs -- --links <url> [<url> ...]    print likely hiring/posting links (the second hop
 *                                                       from a department homepage to its hiring page)
 *   npm run render:jobs -- --out DIR <url> ...          write DIR/<n>.txt instead of printing
 *   options: --concurrency N (default 4), --max-chars N (default 6000 per page),
 *            --wait MS extra settle time for slow apps such as PeopleSoft (default 2500),
 *            --expand click accordions and collapsed sections before reading the text
 */
import fs from 'node:fs';
import path from 'node:path';

const HIRING_LINK = /(open (faculty )?positions?|faculty (positions?|openings?|search(es)?|recruit\w*|hiring|jobs?)|employment|careers?|jobs?|join (us|our)|opportunit\w+|work (with us|for us)|hiring|we.re hiring|open recruit\w*|vacanc\w+|professor|lecturer|postdoc)/i;
const NOT_HIRING = /(student|undergrad|graduate (program|admission)|ph\.?d\.? (program|admission)|alumni|giving|donate|research opportunit|internship|news|event|calendar|seminar|scholarship|financial|advis|career (fair|services|preparation|center)|equal (opportunity|employ)|title ix)/i;

/** Keep anchors whose text looks like a hiring or posting link; drop student-career and boilerplate links. */
export function pickHiringLinks(anchors, limit = 12) {
  const seen = new Set();
  const picked = [];
  for (const [text, href] of anchors) {
    const label = String(text || '').trim().replace(/\s+/g, ' ');
    if (label.length < 3 || label.length > 120 || !/^https?:/i.test(href)) continue;
    if (!HIRING_LINK.test(label) || NOT_HIRING.test(label) || seen.has(href)) continue;
    seen.add(href);
    picked.push([label, href]);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** Trim a rendered page to its useful text: collapse blank runs and cap the length. */
export function condenseText(text, maxChars = 6000) {
  return String(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxChars);
}

function parseArgs(argv) {
  const args = { urls: [], links: false, out: null, concurrency: 4, maxChars: 6000, wait: 2500, expand: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--links') args.links = true;
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--concurrency') args.concurrency = Number(argv[++i]) || 4;
    else if (arg === '--max-chars') args.maxChars = Number(argv[++i]) || 6000;
    else if (arg === '--wait') args.wait = Number(argv[++i]) || 2500;
    else if (arg === '--expand') args.expand = true;
    else if (/^https?:/i.test(arg)) args.urls.push(arg);
  }
  return args;
}

async function renderOne(browser, url, { links, maxChars, wait, expand }) {
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByText(/accept only necessary cookies/i).click({ timeout: 3000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(wait);
    if (expand) {
      // Open accordions and collapsed sections (never links, never site navigation).
      await page.evaluate(() => {
        document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        document.querySelectorAll('[aria-expanded="false"], .accordion-header, .accordion-button, .elementor-tab-title, .et_pb_toggle_title')
          .forEach(el => { if (el.tagName !== 'A' && !el.closest('nav, header, a')) el.click(); });
      });
      await page.waitForTimeout(1200);
    }
    const status = response ? response.status() : 0;
    if (links) {
      const anchors = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
        .map(a => [(a.innerText || a.getAttribute('aria-label') || '').trim(), a.href]));
      return `URL: ${page.url()} (HTTP ${status})\n${pickHiringLinks(anchors).map(([t, h]) => `${t}\t${h}`).join('\n')}`;
    }
    let text = await page.evaluate(() => document.body.innerText);
    if (expand) {
      // innerText omits content hidden by CSS; textContent includes collapsed panels.
      const hidden = await page.evaluate(() => [...document.querySelectorAll('main, [role="main"], article, .entry-content')].map(el => el.textContent.replace(/\s+/g, ' ').trim()).join('\n'));
      text = `${text}\n\n--- full text including collapsed sections ---\n${hidden}`;
    }
    return `URL: ${page.url()} (HTTP ${status})\n${condenseText(text, maxChars)}`;
  } catch (error) {
    return `URL: ${url}\nERROR: ${String(error.message).slice(0, 120)}`;
  } finally {
    await page.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.urls.length) {
    console.error('Usage: npm run render:jobs -- [--links] [--out DIR] <url> [<url> ...]');
    process.exitCode = 2;
    return;
  }
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    ({ chromium } = await import('@playwright/test'));
  }
  const browser = await chromium.launch().catch(error => {
    console.error(`Could not start Chromium (${error.message.split('\n')[0]}). Run: npx playwright install --with-deps chromium`);
    process.exit(1);
  });
  if (args.out) fs.mkdirSync(args.out, { recursive: true });
  const results = new Array(args.urls.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(args.concurrency, args.urls.length) }, async () => {
    while (next < args.urls.length) {
      const index = next++;
      results[index] = await renderOne(browser, args.urls[index], args);
    }
  }));
  await browser.close();
  results.forEach((text, index) => {
    if (args.out) fs.writeFileSync(path.join(args.out, `${index + 1}.txt`), `${text}\n`);
    else console.log(`${index ? '\n' : ''}===== ${args.urls[index]}\n${text}`);
  });
  if (args.out) console.log(`Wrote ${results.length} file(s) to ${args.out}`);
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) await main();
