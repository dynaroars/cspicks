import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  analyzeSeries,
  applyResearchResults,
  failureKind,
  invokeResearchAgent,
  parseChangedPaths,
  parseOptions,
  proposalValidationError,
  selectDueSeries,
} from '../../scripts/csconfs-maintain.mjs';

function record(overrides = {}) {
  return {
    name: 'PLDI',
    venueKeys: ['pldi'],
    year: 2027,
    description: 'Programming Language Design and Implementation',
    link: 'https://pldi27.sigplan.org/',
    seriesLink: 'https://www.sigplan.org/Conferences/PLDI/',
    date: 'June 5–11, 2027',
    place: 'Atlanta, GA, USA',
    abstractDeadline: '2026-11-05',
    deadline: '2026-11-12',
    rebuttalDate: null,
    notificationDate: '2027-02-10',
    note: null,
    generalChair: null,
    programChair: 'Example Chair',
    acceptanceRate: null,
    submissions: null,
    estimated: false,
    verified: true,
    ...overrides,
  };
}

function result(records, overrides = {}) {
  return {
    status: 'complete',
    series: 'PLDI',
    summary: 'Checked the official CFP.',
    checkedUrls: ['https://pldi27.sigplan.org/track/pldi-2027-pldi'],
    proposals: [{
      action: 'update',
      year: 2027,
      records,
      recordsJson: JSON.stringify(records),
      sources: [{
        field: 'deadline',
        url: 'https://pldi27.sigplan.org/track/pldi-2027-pldi',
        evidence: 'The official CFP lists the submission deadline.',
      }],
    }],
    ...overrides,
  };
}

test('CS Confs maintenance options support bounded weekly runs and provider choice', () => {
  const options = parseOptions(['run', '--limit', '4', '--total', '12', '--agent', 'claude', '--no-push']);
  assert.equal(options.limit, 4);
  assert.equal(options.total, 12);
  assert.equal(options.agent, 'claude');
  assert.equal(options.push, false);
  assert.throws(() => parseOptions(['run', '--all', '--total', '12']), /cannot be combined/);
});

test('series analysis prioritizes missing deadlines and suspicious edition URLs', () => {
  const analysis = analyzeSeries('PLDI', [record({
    link: 'https://2026.pldi.example/',
    deadline: null,
    verified: false,
  })], null, { now: Date.parse('2026-09-01T00:00:00Z') });
  assert.equal(analysis.priority, 0);
  assert.ok(analysis.reasons.some((reason) => reason.includes('missing or TBD')));
  assert.ok(analysis.reasons.some((reason) => reason.includes('edition link names 2026')));
});

test('weekly selection honors NOT FOUND deferrals but --all overrides them', () => {
  const conferences = [record(), record({ name: 'POPL', venueKeys: ['popl'], description: 'Principles of Programming Languages' })];
  const checks = {
    version: 1,
    series: {
      PLDI: { lastCheckedAt: '2026-08-31T00:00:00Z', deferredUntil: '2026-09-20T00:00:00Z' },
      POPL: { lastCheckedAt: '2026-08-31T00:00:00Z', deferredUntil: null },
    },
  };
  const normal = selectDueSeries(conferences, checks, { now: Date.parse('2026-09-01T00:00:00Z'), limit: 10 });
  assert.deepEqual(normal.map((item) => item.name), []);
  const all = selectDueSeries(conferences, checks, { now: Date.parse('2026-09-01T00:00:00Z'), limit: 10, all: true });
  assert.deepEqual(all.map((item) => item.name).sort(), ['PLDI', 'POPL']);
});

test('proposal validation accepts a sourced complete-edition deadline correction', () => {
  const before = [record()];
  const after = [record({ deadline: '2026-11-13' })];
  assert.equal(proposalValidationError(result(after), 'PLDI', before, { currentYear: 2026 }), null);
});

test('proposal validation rejects unsourced changes and erasing known dates', () => {
  const before = [record()];
  const unsourced = result([record({ place: 'New York, NY, USA' })]);
  assert.match(proposalValidationError(unsourced, 'PLDI', before, { currentYear: 2026 }), /changed place has no official source/);
  const erased = result([record({ deadline: null, verified: false })], {
    proposals: [{
      action: 'update', year: 2027, records: [record({ deadline: null, verified: false })], recordsJson: '[]',
      sources: [
        { field: 'deadline', url: 'https://pldi27.sigplan.org/', evidence: 'Deadline page.' },
        { field: 'verified', url: 'https://pldi27.sigplan.org/', evidence: 'Verification status.' },
      ],
    }],
  });
  assert.match(proposalValidationError(erased, 'PLDI', before, { currentYear: 2026 }), /cannot erase known deadline/);
});

test('proposal validation preserves existing cycles and historical statistics', () => {
  const cycleOne = record({ note: 'Cycle 1/2', acceptanceRate: 24.5, submissions: 800 });
  const cycleTwo = record({ note: 'Cycle 2/2', deadline: '2027-01-12', abstractDeadline: '2027-01-05', notificationDate: '2027-04-10', acceptanceRate: 24.5, submissions: 800 });
  const removedCycle = result([cycleOne]);
  assert.match(proposalValidationError(removedCycle, 'PLDI', [cycleOne, cycleTwo], { currentYear: 2026 }), /cannot remove an existing submission cycle/);

  const changedStatistics = result([record({ acceptanceRate: 99 })]);
  assert.match(proposalValidationError(changedStatistics, 'PLDI', [record()], { currentYear: 2026 }), /cannot change historical acceptanceRate/);
});

test('proposal validation rejects impossible date ordering and unsupported new editions', () => {
  const before = [record()];
  const temporal = result([record({ notificationDate: '2026-10-01' })], {
    proposals: [{
      action: 'update', year: 2027, records: [record({ notificationDate: '2026-10-01' })], recordsJson: '[]',
      sources: [{ field: 'notificationDate', url: 'https://pldi27.sigplan.org/', evidence: 'Notification date.' }],
    }],
  });
  assert.match(proposalValidationError(temporal, 'PLDI', before, { currentYear: 2026 }), /notification precedes submission deadline/);

  const added = record({ year: 2028, link: 'https://pldi28.sigplan.org/', date: 'June 2028', deadline: '2027-11-10', notificationDate: '2028-02-01' });
  const addition = result([added], {
    proposals: [{
      action: 'add', year: 2028, records: [added], recordsJson: JSON.stringify([added]),
      sources: [{ field: 'deadline', url: added.link, evidence: 'Deadline.' }],
    }],
  });
  assert.match(proposalValidationError(addition, 'PLDI', before, { currentYear: 2026 }), /needs an official edition source/);
});

test('applying research updates an edition atomically and records evidence', () => {
  const before = [record(), record({ year: 2026, link: 'https://pldi26.sigplan.org/', date: 'June 2026', deadline: '2025-11-10', notificationDate: '2026-02-01' })];
  const research = result([record({ deadline: '2026-11-13' })]);
  const applied = applyResearchResults(before, { version: 1, series: {} }, [{ name: 'PLDI', research }], '2026-09-01T12:00:00.000Z');
  assert.equal(applied.conferences.find((entry) => entry.year === 2027).deadline, '2026-11-13');
  assert.equal(applied.conferences.find((entry) => entry.year === 2026).deadline, '2025-11-10');
  assert.equal(applied.checks.series.PLDI.outcome, 'complete');
  assert.equal(applied.checks.series.PLDI.proposals[0].sources[0].field, 'deadline');
});

test('fake-agent adapter returns checkpointable structured research without tokens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'csconfs-agent-'));
  const previous = process.env.CSCONFS_MAINTENANCE_FAKE_AGENT_DIR;
  try {
    const fake = result([record()]);
    await writeFile(join(directory, 'pldi.json'), `${JSON.stringify(fake)}\n`);
    process.env.CSCONFS_MAINTENANCE_FAKE_AGENT_DIR = directory;
    assert.deepEqual(await invokeResearchAgent('codex', { name: 'PLDI', jobId: 'test', reasons: [] }, [record()]), fake);
  } finally {
    if (previous === undefined) delete process.env.CSCONFS_MAINTENANCE_FAKE_AGENT_DIR;
    else process.env.CSCONFS_MAINTENANCE_FAKE_AGENT_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('agent failure and Git status helpers recognize resumable conditions', () => {
  assert.equal(failureKind({ stdout: 'You have hit your weekly token limit', stderr: '' }), 'rate');
  assert.equal(failureKind({ stdout: '', stderr: 'not logged in' }), 'auth');
  assert.deepEqual(parseChangedPaths(' M csconfs/data/conferences.json\nR  old -> new\n'), [
    'csconfs/data/conferences.json',
    'new',
  ]);
});
