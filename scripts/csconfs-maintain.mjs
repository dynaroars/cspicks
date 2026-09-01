#!/usr/bin/env node

/**
 * Resumable, LLM-assisted maintenance for the local CS Confs schedule.
 *
 * The controller owns every write. Codex or Claude runs with read-only tools and
 * returns schema-constrained research. State defaults to
 * ~/.local/state/cspicks-csconfs-maintenance and can be overridden with
 * CSCONFS_MAINTENANCE_STATE_DIR.
 */

import { createWriteStream } from 'node:fs';
import {
  access,
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const DATA_FILE = join(REPO_ROOT, 'csconfs', 'data', 'conferences.json');
const CHECKS_FILE = join(REPO_ROOT, 'csconfs', 'maintenance', 'checks.json');
const STATE_HOME = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
const STATE_DIR = process.env.CSCONFS_MAINTENANCE_STATE_DIR
  || join(STATE_HOME, 'cspicks-csconfs-maintenance');
const STATE_FILE = join(STATE_DIR, 'state.json');
const LOCK_FILE = join(STATE_DIR, 'controller.json');
const STOP_FILE = join(STATE_DIR, 'stop-requested');
const SCHEMA_FILE = join(STATE_DIR, 'research-schema.json');
const DEFAULT_LIMIT = 6;
const DEFAULT_STALE_DAYS = 30;
const DEFAULT_DEFER_DAYS = 21;
const DEFAULT_TIMEOUT_MINUTES = 45;
const MAX_CAPTURE_CHARS = 2_000_000;
const MAINTAINED_PATHS = new Set([
  'csconfs/data/conferences.json',
  'csconfs/maintenance/checks.json',
]);
const SHARED_FIELDS = [
  'name', 'venueKeys', 'year', 'description', 'link', 'seriesLink', 'date', 'place',
  'generalChair', 'programChair', 'estimated', 'verified',
];
const SOURCE_FIELDS = new Set([
  'edition', 'link', 'seriesLink', 'date', 'place', 'abstractDeadline', 'deadline',
  'rebuttalDate', 'notificationDate', 'generalChair', 'programChair', 'estimated', 'verified',
]);
const DATE_FIELDS = ['abstractDeadline', 'deadline', 'rebuttalDate', 'notificationDate'];
const NULLABLE_STRING_FIELDS = [
  'seriesLink', 'date', 'place', 'abstractDeadline', 'deadline', 'rebuttalDate',
  'notificationDate', 'note', 'generalChair', 'programChair',
];
const RECORD_FIELDS = new Set([
  'name', 'venueKeys', 'year', 'description', 'link', 'seriesLink', 'date', 'place',
  'abstractDeadline', 'deadline', 'rebuttalDate', 'notificationDate', 'note',
  'generalChair', 'programChair', 'acceptanceRate', 'submissions', 'estimated', 'verified',
]);

let state = null;
let activeChild = null;
let stopRequested = false;
let lockOwned = false;
let runLogFile = null;

class StopRequestedError extends Error {}
class PausedError extends Error {}
class BlockedError extends Error {}

function nowIso() {
  return new Date().toISOString();
}

function compact(value, limit = 30_000) {
  const text = String(value ?? '');
  return text.length <= limit ? text : `${text.slice(0, limit)}\n[truncated]`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function hasErrorCode(error, code) {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return fallback;
    throw error;
  }
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const body = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(temporary, body, 'utf8');
  await rename(temporary, path);
}

async function log(message) {
  const line = `[${nowIso()}] ${message}`;
  console.log(line);
  if (runLogFile) await appendFile(runLogFile, `${line}\n`).catch(() => {});
}

async function saveState() {
  if (!state) return;
  state.updatedAt = nowIso();
  await writeAtomic(STATE_FILE, state);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return hasErrorCode(error, 'EPERM');
  }
}

function terminateGroup(pid, signal = 'SIGTERM') {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The process already exited.
    }
  }
}

function requestStop(signal) {
  if (stopRequested) {
    if (activeChild?.pid) terminateGroup(activeChild.pid, 'SIGKILL');
    return;
  }
  stopRequested = true;
  void writeFile(STOP_FILE, `${signal}\n`, 'utf8').catch(() => {});
  if (state) {
    state.status = 'pausing';
    void saveState().catch(() => {});
  }
  if (activeChild?.pid) terminateGroup(activeChild.pid);
}

async function acquireLock() {
  await mkdir(STATE_DIR, { recursive: true });
  const prior = await readJson(LOCK_FILE, null);
  if (prior?.host === hostname() && processIsAlive(prior.pid)) {
    throw new BlockedError(`maintenance is already running as PID ${prior.pid}`);
  }
  if (prior) await unlink(LOCK_FILE).catch(() => {});
  const handle = await open(LOCK_FILE, 'wx');
  await handle.writeFile(`${JSON.stringify({ pid: process.pid, host: hostname(), startedAt: nowIso() }, null, 2)}\n`);
  await handle.close();
  lockOwned = true;
}

async function releaseLock() {
  if (lockOwned) await unlink(LOCK_FILE).catch(() => {});
  lockOwned = false;
}

function capture(previous, chunk) {
  const next = previous + chunk;
  return next.length <= MAX_CAPTURE_CHARS ? next : next.slice(-MAX_CAPTURE_CHARS);
}

async function runProcess(command, args, {
  label = command,
  logFile = null,
  timeoutMinutes = 0,
  allowFailure = false,
} = {}) {
  if (stopRequested) throw new StopRequestedError('stop requested');
  await log(`Starting ${label}.`);
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    detached: true,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeChild = { pid: child.pid, label };
  const outputStream = logFile ? createWriteStream(logFile, { flags: 'a' }) : null;
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout = capture(stdout, text);
    outputStream?.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr = capture(stderr, text);
    outputStream?.write(text);
  });
  const closed = new Promise((resolveResult, rejectResult) => {
    child.once('error', rejectResult);
    child.once('close', (code, signal) => resolveResult({
      code: code ?? 1,
      signal,
      stdout,
      stderr,
      timedOut,
    }));
  });
  if (state) {
    state.activeChild = activeChild;
    await saveState();
  }
  let timeout;
  if (timeoutMinutes > 0) {
    timeout = setTimeout(() => {
      timedOut = true;
      terminateGroup(child.pid);
      setTimeout(() => terminateGroup(child.pid, 'SIGKILL'), 10_000).unref();
    }, timeoutMinutes * 60_000);
    timeout.unref();
  }
  const result = await closed;
  if (timeout) clearTimeout(timeout);
  outputStream?.end();
  activeChild = null;
  if (state) {
    state.activeChild = null;
    await saveState();
  }
  if (stopRequested) throw new StopRequestedError('stop requested');
  if (!allowFailure && result.code !== 0) {
    throw new Error(`${label} failed: ${compact(result.stderr || result.stdout, 4_000)}`);
  }
  return result;
}

async function git(args, options = {}) {
  return runProcess('git', args, { ...options, label: options.label || `git ${args[0]}` });
}

async function gitText(args, options = {}) {
  return (await git(args, options)).stdout.trim();
}

export function parseOptions(argv) {
  const options = {
    command: 'run',
    limit: DEFAULT_LIMIT,
    total: null,
    staleDays: DEFAULT_STALE_DAYS,
    all: false,
    conference: null,
    agent: 'codex',
    dryRun: false,
    push: true,
    provided: new Set(),
  };
  const values = [...argv];
  if (values[0] && !values[0].startsWith('-')) options.command = values.shift();
  while (values.length) {
    const value = values.shift();
    if (value === '--all') { options.all = true; options.provided.add('all'); }
    else if (value === '--dry-run') { options.dryRun = true; options.provided.add('dryRun'); }
    else if (value === '--no-push') { options.push = false; options.provided.add('push'); }
    else if (value === '--agent') { options.agent = values.shift(); options.provided.add('agent'); }
    else if (value === '--conference') { options.conference = values.shift(); options.provided.add('conference'); }
    else if (value === '--limit') { options.limit = Number(values.shift()); options.provided.add('limit'); }
    else if (value === '--total') { options.total = Number(values.shift()); options.provided.add('total'); }
    else if (value === '--stale-days') { options.staleDays = Number(values.shift()); options.provided.add('staleDays'); }
    else if (value === '--help' || value === '-h') options.command = 'help';
    else throw new Error(`unknown option: ${value}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error('--limit must be a positive integer');
  if (options.total !== null && (!Number.isInteger(options.total) || options.total < 1)) throw new Error('--total must be a positive integer');
  if (options.all && options.total !== null) throw new Error('--all and --total cannot be combined');
  if (!Number.isFinite(options.staleDays) || options.staleDays < 0) throw new Error('--stale-days must be zero or greater');
  if (!['codex', 'claude'].includes(options.agent)) throw new Error('--agent must be codex or claude');
  if (options.conference !== null && !String(options.conference).trim()) throw new Error('--conference requires a name');
  return options;
}

function helpText() {
  return `Resumable CS Confs maintenance\n\nUsage:\n  npm run maintain:csconfs -- [run] [options]\n  npm run maintain:csconfs -- status\n  npm run maintain:csconfs -- stop\n  npm run maintain:csconfs -- reset\n\nOptions:\n  --limit N          Series per batch (default: ${DEFAULT_LIMIT})\n  --total N          Continue in batches until N series are processed\n  --all              Sweep every series, including recently checked ones\n  --stale-days N     Recheck interval (default: ${DEFAULT_STALE_DAYS})\n  --conference NAME  Process one conference series\n  --agent A           Research with codex or claude (default: codex)\n  --dry-run           Print the queue without agents or writes\n  --no-push           Commit locally but do not push main\n\nState: ${STATE_DIR}\n`;
}

function groupBySeries(conferences) {
  return Map.groupBy(conferences, (entry) => entry.name);
}

function groupByEdition(entries) {
  return Map.groupBy(entries, (entry) => entry.year);
}

function parseIsoDate(value) {
  if (!value || String(value).toUpperCase() === 'TBD') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== Number(match[1])
    || parsed.getUTCMonth() !== Number(match[2]) - 1
    || parsed.getUTCDate() !== Number(match[3])) return null;
  return timestamp;
}

function suspiciousEdition(entries) {
  const reasons = [];
  const main = entries[0];
  const linkYears = String(main.link || '').match(/20\d{2}/g) || [];
  if (linkYears.length && !linkYears.includes(String(main.year))) {
    reasons.push(`edition link names ${[...new Set(linkYears)].join(', ')} instead of ${main.year}`);
  }
  if (main.verified && entries.some((entry) => !entry.deadline || entry.deadline === 'TBD')) {
    reasons.push('verified edition has a missing deadline');
  }
  for (const entry of entries) {
    const abstract = parseIsoDate(entry.abstractDeadline);
    const deadline = parseIsoDate(entry.deadline);
    const rebuttal = parseIsoDate(entry.rebuttalDate);
    const notification = parseIsoDate(entry.notificationDate);
    if (abstract !== null && deadline !== null && abstract > deadline) reasons.push('abstract deadline follows submission deadline');
    if (deadline !== null && rebuttal !== null && rebuttal < deadline) reasons.push('rebuttal precedes submission deadline');
    if (deadline !== null && notification !== null && notification < deadline) reasons.push('notification precedes submission deadline');
    if (rebuttal !== null && notification !== null && notification < rebuttal) reasons.push('notification precedes rebuttal');
  }
  for (const field of SHARED_FIELDS) {
    const values = entries.map((entry) => JSON.stringify(entry[field] ?? null));
    if (new Set(values).size > 1) reasons.push(`cycles disagree on ${field}`);
  }
  return [...new Set(reasons)];
}

export function analyzeSeries(name, entries, check, { now = Date.now(), staleDays = DEFAULT_STALE_DAYS } = {}) {
  const currentYear = new Date(now).getUTCFullYear();
  const editions = [...groupByEdition(entries).entries()].sort((a, b) => a[0] - b[0]);
  const relevant = editions.filter(([year]) => year >= currentYear);
  const reasons = [];
  let priority = 50;
  for (const [year, records] of relevant) {
    if (records.some((entry) => !entry.deadline || entry.deadline === 'TBD')) {
      reasons.push(`${year}: missing or TBD deadline`);
      priority = Math.min(priority, 0);
    }
    if (records.some((entry) => entry.estimated || !entry.verified)) {
      reasons.push(`${year}: estimated or unverified`);
      priority = Math.min(priority, 10);
    }
    const suspicious = suspiciousEdition(records);
    if (suspicious.length) {
      reasons.push(...suspicious.map((reason) => `${year}: ${reason}`));
      priority = Math.min(priority, 5);
    }
  }
  const latestYear = Math.max(...entries.map((entry) => entry.year));
  if (latestYear <= currentYear) {
    reasons.push(`latest local edition is ${latestYear}; discover the next announced edition`);
    priority = Math.min(priority, 15);
  }
  const checkedAt = Date.parse(check?.lastCheckedAt);
  const stale = Number.isNaN(checkedAt) || checkedAt <= now - staleDays * 86_400_000;
  if (stale) {
    reasons.push(check?.lastCheckedAt ? `last checked ${check.lastCheckedAt}` : 'never checked by the maintenance controller');
    priority = Math.min(priority, 30);
  }
  const deferred = Date.parse(check?.deferredUntil) > now;
  return { name, priority, reasons, stale, deferred, latestYear };
}

function normalizedTokens(value) {
  return String(value).toLowerCase().match(/[a-z0-9]+/g) || [];
}

function findConference(query, names) {
  const wanted = normalizedTokens(query).join(' ');
  const exact = names.filter((name) => normalizedTokens(name).join(' ') === wanted);
  if (exact.length === 1) return exact[0];
  const partial = names.filter((name) => normalizedTokens(name).join(' ').includes(wanted));
  return partial.length === 1 ? partial[0] : null;
}

export function selectDueSeries(conferences, checks, {
  limit = DEFAULT_LIMIT,
  staleDays = DEFAULT_STALE_DAYS,
  all = false,
  conference = null,
  now = Date.now(),
  exclude = [],
} = {}) {
  const series = groupBySeries(conferences);
  const names = [...series.keys()];
  if (conference) {
    const match = findConference(conference, names);
    if (!match) throw new Error(`conference name is ambiguous or unknown: ${conference}`);
    return [analyzeSeries(match, series.get(match), checks?.series?.[match], { now, staleDays })];
  }
  const excluded = new Set(exclude);
  return names
    .filter((name) => !excluded.has(name))
    .map((name) => analyzeSeries(name, series.get(name), checks?.series?.[name], { now, staleDays }))
    .filter((item) => all || (!item.deferred && (item.priority < 30 || item.stale)))
    .sort((left, right) => left.priority - right.priority || left.latestYear - right.latestYear || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function researchSchema() {
  return {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['complete', 'incomplete', 'not_found'] },
      series: { type: 'string' },
      summary: { type: 'string' },
      checkedUrls: { type: 'array', items: { type: 'string' } },
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['update', 'add'] },
            year: { type: 'integer' },
            recordsJson: { type: 'string' },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', enum: [...SOURCE_FIELDS] },
                  url: { type: 'string' },
                  evidence: { type: 'string' },
                },
                required: ['field', 'url', 'evidence'],
                additionalProperties: false,
              },
            },
          },
          required: ['action', 'year', 'recordsJson', 'sources'],
          additionalProperties: false,
        },
      },
    },
    required: ['status', 'series', 'summary', 'checkedUrls', 'proposals'],
    additionalProperties: false,
  };
}

function researchPrompt(job, entries) {
  const currentYear = new Date().getUTCFullYear();
  const revision = job.lastValidationError ? `\n\nA previous proposal was rejected by deterministic validation:\n${job.lastValidationError}\n\nPrevious rejected result:\n${JSON.stringify(job.lastResearch, null, 2)}\n\nCorrect that issue using official evidence; do not merely explain it.` : '';
  return `You are a read-only researcher maintaining one CS conference series.\n\nSeries: ${job.name}\nQueue reasons:\n${job.reasons.map((reason) => `- ${reason}`).join('\n')}\n\nLocal records:\n${JSON.stringify(entries, null, 2)}\n\nRead csconfs/AGENTS.md, csconfs/AGENT_RESEARCH_GUIDE.md, and csconfs/UPDATE_CONFERENCE_METADATA.md completely and follow them. Use live web research. Start from the stored official edition and series URLs, traverse official year navigation, validate adjacent-year URL patterns, then use domain-restricted or general search only to locate an official page. Third-party trackers are discovery leads, never evidence.\n\nAudit every local edition from ${currentYear} onward that is missing, estimated, unverified, suspicious, or likely to have changed. Also look for the next officially announced edition through ${currentYear + 2}; account for annual, alternating, or biennial cadence. Do not create an edition merely because a year is expected. Never project dates. Return not_found when no new official information exists, or incomplete when material official evidence conflicts or cannot be evaluated.\n\nFor each changed or newly confirmed edition, return a complete array of all submission-cycle records in recordsJson. Preserve name, venueKeys, description, historical acceptanceRate/submissions, and supported existing facts. Apply shared event, venue, link, and chair metadata consistently to every cycle. Use YYYY-MM-DD calendar dates without timezone conversion. Use null for unannounced facts. Set estimated false only when the submission schedule is officially confirmed, and verified true only when the important schedule facts have official support. Do not return unchanged editions.\n\nEach changed factual field must have a source entry pointing directly to the official page that supports it. Use field "edition" for proof that a newly added edition and year exist. checkedUrls should include every official page actually examined. You cannot edit files. Return only the required structured result.${revision}`;
}

function parseJsonOutput(text) {
  const value = String(text ?? '').trim();
  try {
    return JSON.parse(value);
  } catch {
    for (const line of value.split('\n').reverse()) {
      try {
        return JSON.parse(line);
      } catch {
        // Continue looking for a structured line.
      }
    }
    return null;
  }
}

export function failureKind(result) {
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.toLowerCase();
  if (result.timedOut) return 'timeout';
  if (/\b429\b|too many requests|overloaded|(?:rate|usage|session|weekly|daily|monthly|account|request|token|message|spend)\s+(?:limit|cap)|(?:limit|quota|capacity)\s+(?:reached|exceeded|hit|exhausted|reset|resets|available)|(?:hit|reached|exceeded|exhausted|ran out of)\s+(?:your\s+)?(?:limit|quota|capacity)|\bquota\b/.test(text)) return 'rate';
  if (/not logged in|authentication|unauthorized|login required|sign in/.test(text)) return 'auth';
  return 'other';
}

export async function invokeResearchAgent(agent, job, entries, {
  stateDir = STATE_DIR,
  schemaFile = SCHEMA_FILE,
} = {}) {
  const fakeDir = process.env.CSCONFS_MAINTENANCE_FAKE_AGENT_DIR;
  if (fakeDir) {
    const safeName = job.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return readJson(join(fakeDir, `${safeName}.json`));
  }
  const timeout = Number(process.env.CSCONFS_AGENT_TIMEOUT_MINUTES || DEFAULT_TIMEOUT_MINUTES);
  const output = join(stateDir, `research-${job.jobId}.json`);
  const logFile = join(stateDir, 'logs', `${job.jobId}-${agent}.log`);
  await unlink(output).catch(() => {});
  const prompt = researchPrompt(job, entries);
  const args = agent === 'codex'
    ? [
      '--search', '--sandbox', 'read-only', '--ask-for-approval', 'never',
      '-c', `model_reasoning_effort="${process.env.CSCONFS_CODEX_REASONING_EFFORT || 'low'}"`,
      ...(process.env.CSCONFS_CODEX_MODEL ? ['--model', process.env.CSCONFS_CODEX_MODEL] : []),
      'exec', '--json', '--output-schema', schemaFile, '--output-last-message', output, prompt,
    ]
    : [
      '-p', '--output-format', 'json', '--permission-mode', 'dontAsk',
      '--allowedTools', 'Read,Glob,Grep,WebSearch,WebFetch',
      '--model', process.env.CSCONFS_CLAUDE_MODEL || 'sonnet',
      '--json-schema', JSON.stringify(researchSchema()), '--session-id', randomUUID(), prompt,
    ];
  const result = await runProcess(agent, args, {
    label: `${agent} research for ${job.name}`,
    logFile,
    timeoutMinutes: timeout,
    allowFailure: true,
  });
  const outer = agent === 'codex' ? await readJson(output, null) : parseJsonOutput(result.stdout);
  const structured = agent === 'codex'
    ? outer
    : outer?.structured_output || (typeof outer?.result === 'string' ? parseJsonOutput(outer.result) : outer?.result);
  if (result.code === 0 && structured) return structured;
  const kind = failureKind(result);
  if (kind === 'rate') throw new PausedError(`${agent} rate or token limit reached`);
  if (kind === 'auth') throw new BlockedError(`${agent} authentication failed; sign in and rerun`);
  if (kind === 'timeout') throw new PausedError(`${agent} research timed out`);
  throw new Error(`${agent} research failed: ${compact(result.stderr || result.stdout, 4_000)}`);
}

function validHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function recordValidationError(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'record must be an object';
  for (const key of Object.keys(record)) if (!RECORD_FIELDS.has(key)) return `unsupported record field ${key}`;
  for (const key of RECORD_FIELDS) if (!Object.hasOwn(record, key)) return `complete record is missing ${key}`;
  if (typeof record.name !== 'string' || !record.name) return 'record needs a name';
  if (!Array.isArray(record.venueKeys) || !record.venueKeys.length || record.venueKeys.some((key) => typeof key !== 'string' || !key)) return 'record needs venueKeys';
  if (!Number.isInteger(record.year)) return 'record needs an integer year';
  if (typeof record.description !== 'string' || !record.description) return 'record needs a description';
  if (!validHttpUrl(record.link)) return 'record needs an HTTP(S) link';
  if (record.seriesLink !== null && record.seriesLink !== undefined && !validHttpUrl(record.seriesLink)) return 'seriesLink must be null or HTTP(S)';
  for (const field of NULLABLE_STRING_FIELDS) {
    if (record[field] !== null && record[field] !== undefined && typeof record[field] !== 'string') return `${field} must be a string or null`;
  }
  for (const field of DATE_FIELDS) {
    const value = record[field];
    if (value !== null && value !== undefined && value !== 'TBD' && parseIsoDate(value) === null) return `${field} must be YYYY-MM-DD, TBD, or null`;
  }
  if (typeof record.estimated !== 'boolean' || typeof record.verified !== 'boolean') return 'estimated and verified must be booleans';
  if (record.estimated && record.verified) return 'an edition cannot be both estimated and verified';
  if (record.acceptanceRate !== null && record.acceptanceRate !== undefined && typeof record.acceptanceRate !== 'number') return 'acceptanceRate must be numeric or null';
  if (record.submissions !== null && record.submissions !== undefined && !Number.isInteger(record.submissions)) return 'submissions must be an integer or null';
  return null;
}

function changedFields(before, after) {
  if (!before) return [...new Set(after.flatMap((record) => Object.keys(record)
    .filter((field) => record[field] !== null && record[field] !== undefined && record[field] !== 'TBD')))]
    .filter((field) => !['name', 'venueKeys', 'year', 'description', 'acceptanceRate', 'submissions', 'note', 'estimated', 'verified'].includes(field));
  const fields = new Set();
  const byNote = new Map(before.map((record) => [record.note ?? null, record]));
  for (const record of after) {
    const old = byNote.get(record.note ?? null);
    for (const field of RECORD_FIELDS) {
      if (!isDeepStrictEqual(old?.[field] ?? null, record[field] ?? null)) fields.add(field);
    }
  }
  if (before.length !== after.length) fields.add('deadline');
  return [...fields].filter((field) => SOURCE_FIELDS.has(field) && !['estimated', 'verified'].includes(field));
}

function normalizeResearch(research) {
  if (!research || !Array.isArray(research.proposals)) return research;
  return {
    ...research,
    proposals: research.proposals.map((proposal) => ({
      ...proposal,
      records: parseJsonOutput(proposal.recordsJson),
    })),
  };
}

export function proposalValidationError(research, targetName, conferences, {
  currentYear = new Date().getUTCFullYear(),
} = {}) {
  if (!research || typeof research !== 'object') return 'research result must be an object';
  if (!['complete', 'incomplete', 'not_found'].includes(research.status)) return 'invalid research status';
  if (research.series !== targetName) return `research changed the target series from ${targetName}`;
  if (typeof research.summary !== 'string' || !research.summary.trim()) return 'research result needs a summary';
  if (!Array.isArray(research.checkedUrls) || !research.checkedUrls.length || research.checkedUrls.some((url) => !validHttpUrl(url))) return 'checkedUrls must contain at least one HTTP(S) URL';
  if (!Array.isArray(research.proposals)) return 'proposals must be an array';
  if (research.status !== 'complete' && research.proposals.length) return `${research.status} research cannot contain proposals`;
  const seriesEntries = conferences.filter((entry) => entry.name === targetName);
  const latest = seriesEntries.toSorted((a, b) => b.year - a.year)[0];
  const seenYears = new Set();
  for (const proposal of research.proposals) {
    if (!['update', 'add'].includes(proposal.action)) return 'invalid proposal action';
    if (!Number.isInteger(proposal.year) || proposal.year < currentYear || proposal.year > currentYear + 2) return `proposal year ${proposal.year} is outside the maintenance window`;
    if (seenYears.has(proposal.year)) return `duplicate proposal for ${proposal.year}`;
    seenYears.add(proposal.year);
    const existing = seriesEntries.filter((entry) => entry.year === proposal.year);
    if (proposal.action === 'update' && !existing.length) return `cannot update missing edition ${proposal.year}`;
    if (proposal.action === 'add' && existing.length) return `cannot add existing edition ${proposal.year}`;
    if (!Array.isArray(proposal.records) || !proposal.records.length) return `${proposal.year} recordsJson must contain a nonempty array`;
    if (proposal.action === 'update' && proposal.records.length < existing.length) return `${proposal.year}: cannot remove an existing submission cycle`;
    for (const record of proposal.records) {
      const error = recordValidationError(record);
      if (error) return `${proposal.year}: ${error}`;
      if (record.name !== targetName || record.year !== proposal.year) return `${proposal.year}: record name/year does not match target`;
      if (!isDeepStrictEqual(record.venueKeys, latest.venueKeys)) return `${proposal.year}: venueKeys changed`;
      if (record.description !== latest.description) return `${proposal.year}: description changed`;
    }
    const notes = proposal.records.map((record) => record.note ?? null);
    if (new Set(notes).size !== notes.length) return `${proposal.year}: duplicate cycle notes`;
    for (const field of SHARED_FIELDS) {
      const values = proposal.records.map((record) => JSON.stringify(record[field] ?? null));
      if (new Set(values).size > 1) return `${proposal.year}: cycles disagree on ${field}`;
    }
    const suspicious = suspiciousEdition(proposal.records);
    const temporal = suspicious.filter((reason) => !reason.startsWith('edition link names'));
    if (temporal.length) return `${proposal.year}: ${temporal.join('; ')}`;
    if (!Array.isArray(proposal.sources) || proposal.sources.some((source) => !SOURCE_FIELDS.has(source.field) || !validHttpUrl(source.url) || !source.evidence)) return `${proposal.year}: invalid sources`;
    const sourceFields = new Set(proposal.sources.map((source) => source.field));
    if (proposal.action === 'add' && !sourceFields.has('edition')) return `${proposal.year}: a new edition needs an official edition source`;
    for (const field of changedFields(existing.length ? existing : null, proposal.records)) {
      if (!sourceFields.has(field) && !(field === 'link' && sourceFields.has('edition'))) return `${proposal.year}: changed ${field} has no official source`;
    }
    if (proposal.records.some((record) => record.verified)) {
      if (proposal.records.some((record) => !record.deadline || record.deadline === 'TBD')) return `${proposal.year}: verified records need submission deadlines`;
      if (!sourceFields.has('deadline')) return `${proposal.year}: verified records need a deadline source`;
    }
    if (existing.length) {
      const byNote = new Map(existing.map((record) => [record.note ?? null, record]));
      for (const record of proposal.records) {
        const old = byNote.get(record.note ?? null);
        if (!old) continue;
        for (const field of [...DATE_FIELDS, 'seriesLink', 'date', 'place', 'generalChair', 'programChair']) {
          if (old[field] && old[field] !== 'TBD' && (!record[field] || record[field] === 'TBD')) return `${proposal.year}: cannot erase known ${field}`;
        }
        for (const field of ['acceptanceRate', 'submissions']) {
          if (!isDeepStrictEqual(old[field] ?? null, record[field] ?? null)) return `${proposal.year}: cannot change historical ${field}`;
        }
      }
    } else if (proposal.records.some((record) => record.acceptanceRate !== null || record.submissions !== null)) {
      return `${proposal.year}: a new edition cannot invent acceptance statistics`;
    }
  }
  return null;
}

export function applyResearchResults(conferences, checks, results, checkedAt = nowIso()) {
  const nextConferences = structuredClone(conferences);
  const nextChecks = structuredClone(checks || { version: 1, series: {} });
  nextChecks.version = 1;
  nextChecks.series ||= {};
  for (const item of results) {
    const research = item.research;
    for (const proposal of research.proposals) {
      const indices = [];
      nextConferences.forEach((entry, index) => {
        if (entry.name === item.name && entry.year === proposal.year) indices.push(index);
      });
      let insertion = indices.length
        ? indices[0]
        : nextConferences.reduce((last, entry, index) => entry.name === item.name ? index + 1 : last, nextConferences.length);
      for (const index of indices.toReversed()) nextConferences.splice(index, 1);
      if (indices.length) insertion = Math.min(insertion, nextConferences.length);
      nextConferences.splice(insertion, 0, ...structuredClone(proposal.records));
    }
    const deferredUntil = research.status === 'not_found'
      ? new Date(Date.parse(checkedAt) + DEFAULT_DEFER_DAYS * 86_400_000).toISOString()
      : null;
    nextChecks.series[item.name] = {
      lastCheckedAt: checkedAt,
      outcome: research.status,
      summary: research.summary,
      checkedUrls: research.checkedUrls,
      deferredUntil,
      proposals: research.proposals.map(({ action, year, sources }) => ({ action, year, sources })),
    };
  }
  return { conferences: nextConferences, checks: nextChecks };
}

export function parseChangedPaths(output) {
  return String(output).split('\n').filter(Boolean).map((line) => {
    const path = line.slice(3).trim();
    return path.includes(' -> ') ? path.split(' -> ').at(-1) : path;
  });
}

async function changedPaths() {
  return parseChangedPaths((await git(['status', '--porcelain'])).stdout);
}

async function requireCleanCheckout() {
  const paths = await changedPaths();
  if (paths.length) throw new BlockedError(`checkout is not clean: ${paths.join(', ')}`);
}

async function requireOnlyMaintainedChanges() {
  const unexpected = (await changedPaths()).filter((path) => !MAINTAINED_PATHS.has(path));
  if (unexpected.length) throw new BlockedError(`unexpected changes while maintenance is active: ${unexpected.join(', ')}`);
}

async function assertPreflight(agent) {
  if (await gitText(['branch', '--show-current']) !== 'main') throw new BlockedError('maintenance must run on main');
  const checks = agent === 'codex'
    ? [['codex', ['login', 'status'], 'Codex']]
    : [['claude', ['auth', 'status'], 'Claude']];
  for (const [command, args, label] of checks) {
    const result = await runProcess(command, args, { label: `${label} authentication preflight`, allowFailure: true });
    if (result.code !== 0) throw new BlockedError(`${label} authentication preflight failed: ${compact(result.stderr || result.stdout, 2_000)}`);
  }
}

async function createRun(options, progress = {}) {
  await requireCleanCheckout();
  await git(['pull', '--ff-only', 'origin', 'main'], { label: 'update origin/main' });
  const conferences = await readJson(DATA_FILE, []);
  const checks = await readJson(CHECKS_FILE, { version: 1, series: {} });
  const processedNames = progress.processedNames || [];
  const remaining = options.total === null
    ? options.limit
    : Math.min(options.limit, options.total - (progress.processedCount || 0));
  const queue = remaining > 0 ? selectDueSeries(conferences, checks, {
    ...options,
    limit: remaining,
    exclude: processedNames,
  }).map((item) => ({ ...item, jobId: randomUUID() })) : [];
  state = {
    version: 1,
    runId: randomUUID(),
    status: 'running',
    stage: 'collecting',
    startedAt: nowIso(),
    baselineCommit: await gitText(['rev-parse', 'HEAD']),
    options: {
      limit: options.limit,
      total: options.total,
      staleDays: options.staleDays,
      all: options.all,
      conference: options.conference,
      agent: options.agent,
      push: options.push,
    },
    progress: {
      processedCount: progress.processedCount || 0,
      processedNames,
      batchNumber: progress.batchNumber || 1,
    },
    queue,
    index: 0,
    results: [],
    activeChild: null,
  };
  runLogFile = join(STATE_DIR, 'logs', `${state.runId}-controller.log`);
  await mkdir(dirname(runLogFile), { recursive: true });
  await saveState();
}

async function collectResearch() {
  const conferences = await readJson(DATA_FILE, []);
  while (state.index < state.queue.length) {
    if (stopRequested || await exists(STOP_FILE)) throw new StopRequestedError('stop requested');
    const job = state.queue[state.index];
    const entries = conferences.filter((entry) => entry.name === job.name);
    await log(`Researching ${job.name} (${state.index + 1}/${state.queue.length}).`);
    let raw;
    let failures = 0;
    while (true) {
      try {
        raw = await invokeResearchAgent(state.options.agent, job, entries);
        break;
      } catch (error) {
        if (error instanceof PausedError || error instanceof BlockedError || error instanceof StopRequestedError) throw error;
        failures += 1;
        if (failures >= 3) throw error;
        await log(`${job.name} research failed (${failures}/3): ${errorMessage(error)}`);
      }
    }
    const research = normalizeResearch(raw);
    const validationError = proposalValidationError(research, job.name, conferences);
    if (validationError) {
      job.lastValidationError = validationError;
      job.lastResearch = research;
      await saveState();
      throw new BlockedError(`unsafe research proposal for ${job.name}: ${validationError}`);
    }
    state.results.push({ name: job.name, research });
    state.index += 1;
    await saveState();
  }
  state.stage = 'applying';
  await saveState();
}

async function applyBatch() {
  await requireOnlyMaintainedChanges();
  if (await gitText(['rev-parse', 'HEAD']) !== state.baselineCommit) {
    throw new BlockedError('main changed locally while conference research was in progress');
  }
  const conferences = await readJson(DATA_FILE, []);
  const checks = await readJson(CHECKS_FILE, { version: 1, series: {} });
  const applied = applyResearchResults(conferences, checks, state.results, state.startedAt);
  await writeAtomic(DATA_FILE, applied.conferences);
  await writeAtomic(CHECKS_FILE, applied.checks);
  state.stage = 'checking';
  await saveState();
}

async function runFullChecks() {
  await runProcess('npm', ['test'], { label: 'npm test' });
  await runProcess('npm', ['run', 'build'], { label: 'npm run build' });
  await runProcess('npx', ['playwright', 'test', 'test/e2e/csconfs.spec.js'], { label: 'focused CS Confs browser test' });
  await git(['diff', '--check'], { label: 'git diff --check' });
}

async function commitBatch() {
  const marker = `CSConfs-Maintenance-Batch: ${state.runId}`;
  const lastMessage = await gitText(['log', '-1', '--format=%B']);
  if (lastMessage.includes(marker)) return;
  await requireOnlyMaintainedChanges();
  if (!(await changedPaths()).length) return;
  await git(['add', ...MAINTAINED_PATHS]);
  await git([
    'commit',
    '-m', `Automated CS Confs maintenance: batch ${state.runId}`,
    '-m', marker,
    '-m', `Series: ${state.results.map((item) => item.name).join(', ')}`,
  ], { label: `commit maintenance batch ${state.runId}` });
}

async function finishBatch() {
  if (state.stage === 'checking') {
    await runFullChecks();
    state.stage = 'committing';
    await saveState();
  }
  if (state.stage === 'committing') {
    await commitBatch();
    state.stage = state.options.push ? 'pushing' : 'batch-complete';
    await saveState();
  }
  if (state.stage === 'pushing') {
    const pull = await git(['pull', '--rebase', 'origin', 'main'], {
      label: 'rebase maintenance batch before push',
      allowFailure: true,
    });
    if (pull.code !== 0) {
      await git(['rebase', '--abort'], { allowFailure: true });
      throw new BlockedError('could not rebase the maintenance batch onto origin/main');
    }
    await runFullChecks();
    await git(['push', 'origin', 'main'], { label: `push maintenance batch ${state.runId}` });
    state.stage = 'batch-complete';
    await saveState();
  }
}

function needsAnotherBatch() {
  if (state.options.conference) return false;
  if (state.options.all) return true;
  return state.options.total !== null;
}

async function runController(options) {
  if (options.dryRun) {
    const conferences = await readJson(DATA_FILE, []);
    const checks = await readJson(CHECKS_FILE, { version: 1, series: {} });
    const queue = selectDueSeries(conferences, checks, options);
    console.log(`Would research ${queue.length} conference series:`);
    for (const item of queue) console.log(`- ${item.name}: ${item.reasons.join('; ')}`);
    return;
  }
  await acquireLock();
  await unlink(STOP_FILE).catch(() => {});
  state = await readJson(STATE_FILE, null);
  const resumable = state && state.status !== 'complete' && ['collecting', 'applying', 'checking', 'committing', 'pushing', 'batch-complete'].includes(state.stage);
  if (resumable) {
    if (options.provided.has('agent')) state.options.agent = options.agent;
    if (options.provided.has('push')) state.options.push = options.push;
    runLogFile = join(STATE_DIR, 'logs', `${state.runId}-controller.log`);
    state.status = 'running';
    await saveState();
    await log(`Resuming ${state.runId} at stage ${state.stage}, item ${state.index + 1}/${state.queue.length}.`);
  }
  await assertPreflight(resumable ? state.options.agent : options.agent);
  await writeAtomic(SCHEMA_FILE, researchSchema());
  if (!resumable) await createRun(options);
  while (true) {
    if (!state.queue.length) {
      state.status = 'complete';
      state.completedAt = nowIso();
      await saveState();
      await log('No conference series are due.');
      return;
    }
    if (state.stage === 'collecting') await collectResearch();
    if (state.stage === 'applying') await applyBatch();
    await finishBatch();
    if (state.stage !== 'batch-complete') continue;
    const processedCount = (state.progress.processedCount || 0) + state.queue.length;
    const total = state.options.total;
    if (!needsAnotherBatch() || (total !== null && processedCount >= total)) {
      state.status = 'complete';
      state.completedAt = nowIso();
      await saveState();
      await log(`Run complete: ${processedCount} series processed.`);
      return;
    }
    const processedNames = [
      ...(state.progress.processedNames || []),
      ...state.results.map((item) => item.name),
    ];
    await createRun({ ...state.options }, {
      processedCount,
      processedNames,
      batchNumber: state.progress.batchNumber + 1,
    });
  }
}

async function stopController() {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STOP_FILE, `${nowIso()}\n`, 'utf8');
  const lock = await readJson(LOCK_FILE, null);
  const saved = await readJson(STATE_FILE, null);
  if (!lock || lock.host !== hostname() || !processIsAlive(lock.pid)) {
    if (saved && ['running', 'pausing'].includes(saved.status)) {
      saved.status = 'paused';
      state = saved;
      await saveState();
      state = null;
    }
    console.log('No live controller found. The next run will resume the saved checkpoint.');
    return;
  }
  if (saved?.activeChild?.pid) terminateGroup(saved.activeChild.pid);
  process.kill(lock.pid, 'SIGTERM');
  console.log(`Stop requested for PID ${lock.pid}.`);
}

async function showStatus() {
  const saved = await readJson(STATE_FILE, null);
  const lock = await readJson(LOCK_FILE, null);
  if (!saved) return console.log(`No run recorded in ${STATE_DIR}.`);
  const running = lock?.host === hostname() && processIsAlive(lock.pid);
  console.log(`Status: ${saved.status}${running ? ` (PID ${lock.pid})` : ''}`);
  console.log(`Stage: ${saved.stage}`);
  console.log(`Progress: ${saved.index}/${saved.queue?.length || 0}`);
  if (saved.queue?.[saved.index]) console.log(`Current: ${saved.queue[saved.index].name}`);
  console.log(`Completed research: ${saved.results?.length || 0}`);
  console.log(`Updated: ${saved.updatedAt}`);
  console.log(`State: ${STATE_DIR}`);
}

async function resetController() {
  const lock = await readJson(LOCK_FILE, null);
  if (lock?.host === hostname() && processIsAlive(lock.pid)) {
    throw new BlockedError(`maintenance is still running as PID ${lock.pid}; stop it before resetting`);
  }
  const maintainedChanges = (await changedPaths()).filter((path) => MAINTAINED_PATHS.has(path));
  if (maintainedChanges.length) {
    throw new BlockedError(`refusing to discard a checkpoint while maintained files have uncommitted changes: ${maintainedChanges.join(', ')}`);
  }
  await unlink(STATE_FILE).catch(() => {});
  await unlink(STOP_FILE).catch(() => {});
  await unlink(LOCK_FILE).catch(() => {});
  console.log('Removed the saved controller checkpoint. Research logs were preserved.');
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.command === 'help') return console.log(helpText());
  if (options.command === 'status') return showStatus();
  if (options.command === 'stop') return stopController();
  if (options.command === 'reset') return resetController();
  if (options.command !== 'run') throw new Error(`unknown command: ${options.command}`);
  process.on('SIGINT', () => requestStop('SIGINT'));
  process.on('SIGTERM', () => requestStop('SIGTERM'));
  try {
    await runController(options);
  } catch (error) {
    if (error instanceof StopRequestedError || error instanceof PausedError) {
      if (state) {
        state.status = 'paused';
        state.error = errorMessage(error);
        await saveState();
      }
      await log(`${errorMessage(error)}. Run the script again to resume.`);
      process.exitCode = 75;
      return;
    }
    if (state) {
      state.status = error instanceof BlockedError ? 'blocked' : 'failed';
      state.error = compact(error instanceof Error ? error.stack || error.message : error, 10_000);
      await saveState();
    }
    throw error;
  } finally {
    await releaseLock();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
