import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../../scripts/generate-seo-pages.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

describe('SEO static landing pages', () => {
  it('slugify converts school and area names to URL-safe slugs', () => {
    assert.equal(slugify('Carnegie Mellon University'), 'carnegie-mellon-university');
    assert.equal(slugify('ETH Zurich'), 'eth-zurich');
    assert.equal(slugify('University of California - Berkeley'), 'university-of-california-berkeley');
    assert.equal(slugify('Programming Languages'), 'programming-languages');
    assert.equal(slugify('AI & Machine Learning'), 'ai-machine-learning');
  });

  it('sitemap includes static school and area routes alongside canonical pages', () => {
    const sitemapPath = path.join(ROOT_DIR, 'public/sitemap.xml');
    assert.ok(fs.existsSync(sitemapPath), 'sitemap.xml must exist');
    const content = fs.readFileSync(sitemapPath, 'utf8');

    // Canonical root pages
    assert.ok(content.includes('https://cspicks.roars.dev/'));
    assert.ok(content.includes('https://cspicks.roars.dev/simulator.html'));
    assert.ok(content.includes('https://cspicks.roars.dev/csconfs.html'));
    assert.ok(content.includes('https://cspicks.roars.dev/grants.html'));
    assert.ok(content.includes('https://cspicks.roars.dev/nsf.html'));

    // School landing pages
    assert.ok(content.includes('https://cspicks.roars.dev/schools/carnegie-mellon-university/'));
    assert.ok(content.includes('https://cspicks.roars.dev/schools/massachusetts-inst-of-technology/'));
    assert.ok(content.includes('https://cspicks.roars.dev/schools/stanford-university/'));

    // Area landing pages
    assert.ok(content.includes('https://cspicks.roars.dev/areas/programming-languages/'));
    assert.ok(content.includes('https://cspicks.roars.dev/areas/computer-vision/'));
  });

  it('seo.css exists and provides dark/light theme variables and layout rules', () => {
    const cssPath = path.join(ROOT_DIR, 'public/seo.css');
    assert.ok(fs.existsSync(cssPath), 'public/seo.css must exist');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('--font-heading'));
    assert.ok(css.includes('--bg-color'));
    assert.ok(css.includes('prefers-color-scheme: dark'));
    assert.ok(css.includes('.hero-card'));
    assert.ok(css.includes('.faculty-card'));
  });
});
