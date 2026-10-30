import { readFileSync } from 'node:fs';

// Frozen snapshots of the data files the scheduled routines edit, so routine data changes can't break e2e.
// Rebuild one only when a test needs a record it lacks; data validity is the unit tests' job.
const fixture = name => JSON.parse(readFileSync(new URL(`../../fixtures/${name}.json`, import.meta.url), 'utf8'));
const FIXTURES = { grants: fixture('grants'), conferences: fixture('conferences'), labs: fixture('labs') };

/** Serve the named fixtures (`grants`, `conferences`, `labs`) in place of the live files. */
export async function useDataFixtures(page, names) {
  for (const name of names) await page.route(`**/${name}.json`, route => route.fulfill({ json: FIXTURES[name] }));
}
