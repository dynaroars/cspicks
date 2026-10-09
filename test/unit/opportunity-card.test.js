import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardDeadlineTone } from '../../src/opportunity-card.js';

const now = new Date('2026-10-08T12:00:00Z');
test('award deadline colors distinguish primary dates, estimates, historical records, and uncertain cycles', () => {
  assert.equal(awardDeadlineTone('October 10, 2026 (Annual)', false, false, now), 'is-urgent');
  assert.equal(awardDeadlineTone('October 30, 2026 at 5:00 PM ET', false, false, now), 'is-soon');
  assert.equal(awardDeadlineTone('December 1, 2026', false, false, now), 'is-confirmed');
  assert.equal(awardDeadlineTone('October 1, 2026', false, false, now), 'is-passed');
  assert.equal(awardDeadlineTone('October 10, 2026', true, false, now), 'is-estimated');
  assert.equal(awardDeadlineTone('October 10, 2026', true, true, now), 'is-passed');
  for (const text of ['Rolling', 'Annual fall call', 'Pre-application: October 10, 2026; full proposal: December 1, 2026', 'February 30, 2026']) {
    assert.equal(awardDeadlineTone(text, false, false, now), '');
  }
});
