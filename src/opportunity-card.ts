import { escapeHtml, safeExternalUrl } from './shared.js';
import { favoriteToggleButton } from './favorites.js';

/** Color a primary dated award deadline; vague cycles and multiple labeled stages stay neutral. */
export function awardDeadlineTone(text: string, estimated: boolean, historical: boolean, now = new Date()) {
  if (historical) return 'is-passed';
  if (estimated) return 'is-estimated';
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i.exec(text);
  if (!match) return '';
  const date = new Date(`${match[1]} ${match[2]}, ${match[3]} GMT`);
  if (!Number.isFinite(date.getTime()) || date.getUTCDate() !== Number(match[2])) return '';
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = (date.getTime() - today) / 86400000;
  return days < 0 ? 'is-passed' : days <= 7 ? 'is-urgent' : days <= 30 ? 'is-soon' : 'is-confirmed';
}

/** Shared hierarchy for awards and jobs. HTML slots contain renderer-owned markup. */
export function opportunityHeader(options: {
  id: string; title: string; url: string; kind: 'grant' | 'job';
  favorite: boolean; organizationHtml: string; tagsHtml: string;
}) {
  const { kind } = options;
  return `<div class="opportunity-header ${kind}-card-header">
    <div class="opportunity-title-row">
      <h2 class="opportunity-title ${kind}-title"><a href="${escapeHtml(safeExternalUrl(options.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(options.title)}</a></h2>
      <div class="opportunity-actions ${kind}-badges">${favoriteToggleButton(options.id, options.favorite)}</div>
    </div>
    <p class="opportunity-organization ${kind === 'job' ? 'job-school' : 'grant-sponsor-row'}">${options.organizationHtml}</p>
    <div class="opportunity-tags">${options.tagsHtml}</div>
  </div>`;
}

export function opportunityDeadline(text: string, options: { className?: string; valueClass?: string; notesHtml?: string } = {}) {
  return `<div class="opportunity-deadline ${options.className || ''}">
    <span class="opportunity-label">Deadline / cycle</span>
    <div><span class="opportunity-deadline-value ${options.valueClass || ''}">${escapeHtml(text)}</span>${options.notesHtml ? ` <span class="opportunity-deadline-notes">${options.notesHtml}</span>` : ''}</div>
  </div>`;
}

export function opportunityMeta(items: Array<{ label: string; value?: string; html?: string }>) {
  return `<div class="opportunity-meta">${items.map(item => `<div class="opportunity-meta-item"><span class="opportunity-label">${escapeHtml(item.label)}</span><span class="opportunity-meta-value">${item.html ?? escapeHtml(item.value || '')}</span></div>`).join('')}</div>`;
}

const DAY_MS = 86400000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC midnight of a YYYY-MM-DD day, or null. */
export function dayValue(day: unknown) {
  const match = ISO_DAY.exec(String(day ?? ''));
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** Whole days from `day` to today (UTC); null for a missing or malformed day. */
export function daysSince(day: unknown, now = Date.now()) {
  const value = dayValue(day);
  if (value === null) return null;
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  return Math.round((today - value) / DAY_MS);
}

export const NEW_FOR_DAYS = 7;

/** True when the record was added to the dataset within the last `days` days. */
export function isRecentlyAdded(addedAt: unknown, now = Date.now(), days = NEW_FOR_DAYS) {
  const age = daysSince(addedAt, now);
  return age !== null && age >= 0 && age <= days;
}

/** `added:` keyword value → a day window: week, month, or a number of days. */
export function addedWindowDays(value: string) {
  if (value === 'week' || value === 'new') return 7;
  if (value === 'month') return 31;
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? days : null;
}

export function newBadge(addedAt: unknown, now = Date.now()) {
  if (!isRecentlyAdded(addedAt, now)) return '';
  return `<span class="opportunity-chip opportunity-new-badge" title="Added to CS Picks ${escapeHtml(formatIsoDay(addedAt))}">New</span>`;
}

export function formatIsoDay(day: unknown) {
  const value = dayValue(day);
  if (value === null) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function ago(days: number) {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * Always-visible line saying when the entry was last checked against its official page, and a warning chip when
 * that check is older than `staleAfterDays` or never happened. Readers should see staleness without opening a menu.
 */
export function opportunityFreshness(options: {
  checkedAt?: string | null; checkedLabel: string; staleAfterDays: number; addedAt?: string | null; now?: number;
}) {
  const now = options.now ?? Date.now();
  const age = daysSince(options.checkedAt, now);
  if (age === null) {
    const added = formatIsoDay(options.addedAt);
    return `<p class="opportunity-freshness is-stale"><span class="opportunity-freshness-warning">⚠ Not re-verified${added ? ` since it was added ${escapeHtml(added)}` : ''}</span> · confirm on the official page</p>`;
  }
  const when = `${escapeHtml(formatIsoDay(options.checkedAt))} (${ago(age)})`;
  if (age > options.staleAfterDays) {
    return `<p class="opportunity-freshness is-stale"><span class="opportunity-freshness-warning">⚠ ${escapeHtml(options.checkedLabel)} ${when}</span> · may be out of date</p>`;
  }
  return `<p class="opportunity-freshness">✓ ${escapeHtml(options.checkedLabel)} ${when}</p>`;
}

export interface StageView { stage: string; date: string; required?: boolean; note?: string; state: 'passed' | 'next' | 'later'; daysLeft: number }

/** Dated stages (whitepaper → full proposal, application → letters) with the next one highlighted. */
export function opportunityStages(stages: StageView[], estimated = false) {
  if (!stages.length) return '';
  const items = stages.map(stage => {
    const left = stage.state === 'passed' ? 'passed' : stage.daysLeft === 0 ? 'today' : `${stage.daysLeft} day${stage.daysLeft === 1 ? '' : 's'} left`;
    const tone = stage.state === 'passed' ? 'is-passed' : stage.daysLeft <= 7 ? 'is-urgent' : stage.daysLeft <= 30 ? 'is-soon' : '';
    const tags = [
      stage.required === true ? 'required' : stage.required === false ? 'optional' : '',
      stage.note || ''
    ].filter(Boolean).map(text => `<span class="opportunity-stage-tag">${escapeHtml(text)}</span>`).join('');
    return `<li class="opportunity-stage ${tone}${stage.state === 'next' ? ' is-next' : ''}"><span class="opportunity-stage-name">${escapeHtml(stage.stage)}</span> <span class="opportunity-stage-date">${escapeHtml(formatIsoDay(stage.date))}${estimated ? ' (est.)' : ''} · ${left}</span>${tags}</li>`;
  }).join('');
  return `<ol class="opportunity-stages" aria-label="Deadline stages">${items}</ol>`;
}
