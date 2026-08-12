#!/usr/bin/env node
/**
 * Renders scripts/og-card-template.html to public/og-image.png (1200x630),
 * the site-wide OpenGraph/Twitter card fallback. GitHub Pages serves static
 * files only, so a single hand-designed image - not a per-page generated one -
 * is the practical option here; per-page og:title/og:description are still
 * set dynamically in JS (see src/seo.js).
 *
 * Usage: node scripts/generate-og-image.mjs
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = path.join(__dirname, 'og-card-template.html');
const output = path.join(__dirname, '../public/og-image.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${template}`);
await page.screenshot({ path: output });
await browser.close();
console.log(`Wrote ${output}`);
