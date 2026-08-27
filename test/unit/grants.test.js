import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { filterGrants, grantsSuggestions } from '../../src/grants/grants-data.js';

test('grants dataset contains required schema fields and is non-empty', async () => {
  const fileContent = await fs.readFile(new URL('../../public/grants.json', import.meta.url), 'utf8');
  const grants = JSON.parse(fileContent);

  assert.ok(Array.isArray(grants));
  assert.ok(grants.length >= 40, `Expected at least 40 grants, found ${grants.length}`);

  const requiredFields = ['id', 'name', 'sponsor', 'sponsorCategory', 'targetAudience', 'whoFor', 'deadline', 'summary', 'url'];
  const ids = new Set();

  for (const grant of grants) {
    for (const field of requiredFields) {
      assert.ok(grant[field] !== undefined && grant[field] !== null && grant[field] !== '',
        `Grant missing field "${field}": ${JSON.stringify(grant)}`);
    }
    assert.ok(!ids.has(grant.id), `Duplicate grant ID "${grant.id}"`);
    ids.add(grant.id);
    assert.ok(Array.isArray(grant.targetAudience) && grant.targetAudience.length > 0,
      `Grant ${grant.id} targetAudience should be a non-empty array`);
  }
});

test('grants filtering filters by audience and sponsor category', async () => {
  const fileContent = await fs.readFile(new URL('../../public/grants.json', import.meta.url), 'utf8');
  const grants = JSON.parse(fileContent);

  // Filter by Faculty
  const facultyGrants = filterGrants(grants, { audience: 'faculty' });
  assert.ok(facultyGrants.length > 0);
  assert.ok(facultyGrants.every(g => (g.targetAudience || []).some(a => a.toLowerCase().includes('faculty'))));

  // Filter by PhD Students
  const phdGrants = filterGrants(grants, { audience: 'phd' });
  assert.ok(phdGrants.length > 0);
  assert.ok(phdGrants.every(g => (g.targetAudience || []).some(a => a.toLowerCase().includes('phd'))));

  // Filter by Industry sponsor
  const industryGrants = filterGrants(grants, { sponsorCategory: 'industry' });
  assert.ok(industryGrants.length > 0);
  assert.ok(industryGrants.every(g => g.sponsorCategory.toLowerCase().includes('industry')));

  // Filter by Government sponsor
  const govGrants = filterGrants(grants, { sponsorCategory: 'government' });
  assert.ok(govGrants.length > 0);
  assert.ok(govGrants.every(g => g.sponsorCategory.toLowerCase().includes('government')));
});

test('grants filtering performs text query search across name, sponsor, topics and summary', async () => {
  const fileContent = await fs.readFile(new URL('../../public/grants.json', import.meta.url), 'utf8');
  const grants = JSON.parse(fileContent);

  const nsfMatches = filterGrants(grants, { query: 'NSF' });
  assert.ok(nsfMatches.length >= 3);
  assert.ok(nsfMatches.some(g => g.id === 'nsf-career'));

  const googleMatches = filterGrants(grants, { query: 'Google' });
  assert.ok(googleMatches.length >= 2);
  assert.ok(googleMatches.some(g => g.id === 'google-phd-fellowship'));

  const darpaMatches = filterGrants(grants, { query: 'DARPA' });
  assert.ok(darpaMatches.length >= 2);
  assert.ok(darpaMatches.some(g => g.id === 'darpa-yfa'));
});

test('grants suggestions extract awards, sponsors, topics, and audiences', async () => {
  const fileContent = await fs.readFile(new URL('../../public/grants.json', import.meta.url), 'utf8');
  const grants = JSON.parse(fileContent);

  const suggestions = grantsSuggestions(grants);
  assert.ok(Array.isArray(suggestions.awards) && suggestions.awards.length > 0);
  assert.ok(Array.isArray(suggestions.sponsors) && suggestions.sponsors.length > 0);
  assert.ok(Array.isArray(suggestions.topics) && suggestions.topics.length > 0);
  assert.ok(Array.isArray(suggestions.audiences) && suggestions.audiences.length > 0);

  assert.ok(suggestions.sponsors.some(s => s.label.includes('NSF') || s.label.includes('Google') || s.label.includes('DARPA')));
});
