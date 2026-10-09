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
