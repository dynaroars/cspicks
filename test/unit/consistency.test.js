import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

const HTML_PAGES = [
  'index.html',
  'simulator.html',
  'csconfs.html',
  'csconfs-submit.html',
  'grants.html',
  'grants-submit.html',
  'nsf.html'
];

const EXPECTED_NAV_ITEMS = [
  '🔎 Search',
  '☠️ Simulator',
  '📅 CS Confs',
  '💰 Awards & Grants',
  '🇺🇸 NSF Funding'
];

describe('site-wide navigation and markup consistency', () => {
  it('every HTML page has standard header branding and the full top-nav in canonical order', () => {
    for (const file of HTML_PAGES) {
      const filePath = path.join(ROOT_DIR, file);
      assert.ok(fs.existsSync(filePath), `Expected file ${file} to exist`);

      const content = fs.readFileSync(filePath, 'utf-8');

      // Check title-row branding
      assert.ok(content.includes('class="site-title-link"'), `${file} missing .site-title-link`);
      assert.ok(content.includes('class="github-link"'), `${file} missing .github-link`);
      assert.ok(!content.includes('FAQ, methods and data'), `${file} still contains the removed README question-mark link`);
      assert.ok(content.includes('href="https://github.com/dynaroars/cspicks"'), `${file} missing GitHub repository link`);
      assert.ok(content.includes('class="icon-link roars-link"'), `${file} missing ROARS Lab link`);

      // Extract top-nav contents
      const navMatch = content.match(/<nav class="top-nav"[^>]*>([\s\S]*?)<\/nav>/);
      assert.ok(navMatch, `${file} missing <nav class="top-nav">`);

      const navHtml = navMatch[1];
      const linkTexts = Array.from(navHtml.matchAll(/<a[^>]*>(.*?)<\/a>/g)).map(m => m[1].replace(/&amp;/g, '&').trim());

      assert.deepEqual(linkTexts, EXPECTED_NAV_ITEMS, `Navigation items in ${file} do not match expected order`);
    }
  });

  it('sitemap contains all static HTML pages and canonical origins', () => {
    const sitemapPath = path.join(ROOT_DIR, 'public/sitemap.xml');
    assert.ok(fs.existsSync(sitemapPath), 'public/sitemap.xml must exist');
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');

    for (const file of HTML_PAGES) {
      if (file === 'index.html') {
        assert.ok(sitemapContent.includes('https://cspicks.roars.dev/'), 'Sitemap missing root URL');
      } else {
        assert.ok(sitemapContent.includes(`https://cspicks.roars.dev/${file}`), `Sitemap missing ${file}`);
      }
    }
  });
});
