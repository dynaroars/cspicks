import { awardDeadlineTone, formatIsoDay, newBadge, opportunityDeadline, opportunityFooter, opportunityFreshness, opportunityGroup, opportunityHeader, opportunityMeta, opportunityProgressPicker, opportunityStages, opportunityTopics } from '../opportunity-card.js';
import { PROGRESS_LABELS } from '../progress.js';
import type { ProgressStatus } from '../progress.js';
import { escapeHtml, safeExternalUrl } from '../shared.js';
import { CITIZENSHIP_LABELS, grantCalendarEvents, grantDeadlinePresentation, grantStages } from './grants-data.js';
import type { SponsorGrants } from './grants-data.js';
import type { Grant } from '../types.js';

type IsFavorite = (id: string) => boolean;
type GetProgress = (id: string) => ProgressStatus | undefined;

/** Entries not confirmed against the official page within this many days get a visible warning. */
export const GRANT_STALE_AFTER_DAYS = 90;

const SITE_URL = 'https://cspicks.roars.dev';
const inline = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** CS Awards & Grants cards use the same hierarchy as Jobs. */
export function renderGrantCard(
  grant: Grant,
  isFavorite: IsFavorite = () => false,
  now = new Date(),
  getProgress: GetProgress = () => undefined
) {
  const favorite = isFavorite(grant.id);
  const eligibilityItems = (grant.eligibility || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const topicChips = (grant.topics || []).map(t => `<button type="button" class="opportunity-chip grant-topic-chip" data-search-topic="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  const locationText = grant.locationLabel || (
    grant.locations?.length === 1 ? grant.locations[0] :
      grant.locations?.length ? `${grant.locations.length} eligible jurisdictions` : ''
  );
  const deadline = grantDeadlinePresentation(grant, now);
  const stageView = grantStages(grant, now);
  const historical = grant.status === 'historical';
  const citizenship = grant.citizenship ? `<span class="opportunity-chip opportunity-chip-eligibility ${grant.citizenship === 'open' ? 'is-open' : 'is-restricted'}" title="As stated on the official page; see eligibility below">${escapeHtml(CITIZENSHIP_LABELS[grant.citizenship])}</span>` : '';
  const notes = [
    historical ? '<span class="opportunity-chip grant-status-badge">Historical</span>' : '',
    deadline.estimated ? '<span class="opportunity-chip grant-estimated-badge" title="Projected from the latest published cycle; confirm on the official program page">Estimated</span>' : ''
  ].join('');
  const startHtml = favorite ? opportunityProgressPicker(grant.id, grant.name, getProgress(grant.id)) : '';
  const calendarAction = grantCalendarEvents(grant, now).length ? `<button type="button" data-calendar-grant="${escapeHtml(grant.id)}">Add deadlines to calendar</button>` : '';
  return `<article class="opportunity-card grant-card ${historical ? 'is-historical' : ''}" id="${escapeHtml(grant.id)}" data-grant-id="${escapeHtml(grant.id)}">
    ${opportunityHeader({ id: grant.id, title: grant.name, url: grant.url, kind: 'grant', favorite,
      organizationHtml: `<button type="button" class="opportunity-filter-link grant-sponsor-btn" data-search-sponsor="${escapeHtml(grant.sponsor)}"><strong>${escapeHtml(grant.sponsor)}</strong></button>`,
      tagsHtml: `${newBadge(grant.addedAt, now.getTime())}<span class="opportunity-chip opportunity-chip-type grant-cat-badge">${escapeHtml(grant.sponsorCategory)}</span>${citizenship}` })}
    ${opportunityDeadline(deadline.text, { className: awardDeadlineTone(deadline.text, deadline.estimated, historical, now), valueClass: 'grant-meta-val', notesHtml: notes })}
    ${opportunityStages(stageView.stages, stageView.estimated)}
    ${opportunityMeta([
      { label: 'Who for', value: grant.whoFor },
      { label: 'Funding & perks', value: grant.amount },
      ...(locationText ? [{ label: 'Geographic eligibility', value: locationText }] : [])
    ])}
    ${grant.summary ? `<p class="opportunity-summary grant-summary">${escapeHtml(grant.summary)}</p>` : ''}
    ${eligibilityItems ? `<details class="opportunity-details grant-eligibility-accordion"><summary>Eligibility requirements (${grant.eligibility.length})</summary><ul class="grant-eligibility-list">${eligibilityItems}</ul></details>` : ''}
    ${opportunityTopics(topicChips, 'grant-topics')}
    ${opportunityFreshness({ checkedAt: grant.lastVerifiedAt, checkedLabel: 'Verified against the official page', staleAfterDays: GRANT_STALE_AFTER_DAYS, addedAt: grant.addedAt, now: now.getTime() })}
    ${opportunityFooter({ kind: 'grant', title: grant.name, startHtml,
      actionsHtml: `${calendarAction}<a href="grants-submit.html?id=${encodeURIComponent(grant.id)}">Suggest update</a>`,
      pageLink: `grants.html?q=${encodeURIComponent(grant.id)}#${encodeURIComponent(grant.id)}` })}
  </article>`;
}

/** By-sponsor view: one group card per sponsor, like Jobs' by-school view. */
export function renderSponsorGroup(
  group: SponsorGrants,
  isFavorite: IsFavorite = () => false,
  now = new Date(),
  getProgress: GetProgress = () => undefined
) {
  const count = group.grants.length;
  return opportunityGroup({
    label: group.sponsor,
    className: 'grant-sponsor-group',
    headingButtonHtml: `<button type="button" data-search-sponsor="${escapeHtml(group.sponsor)}">${escapeHtml(group.sponsor)}</button>`,
    metaHtml: `<p class="opportunity-group-meta">${escapeHtml(group.category)} · ${count} award${count === 1 ? '' : 's'}</p>`,
    itemsHtml: group.grants.map(grant => renderGrantCard(grant, isFavorite, now, getProgress)).join('')
  });
}

export function grantsExportFileName(now = Date.now()) {
  return `cspicks-starred-awards-${new Date(now).toISOString().slice(0, 10)}.md`;
}

export function grantsToMarkdown(
  grants: Grant[],
  { now = new Date(), getProgress = () => undefined }: { now?: Date; getProgress?: GetProgress } = {}
) {
  const lines = [
    '# Starred CS awards & grants',
    '',
    `Exported from CS Picks (${SITE_URL}/grants.html) on ${now.toISOString().slice(0, 10)} · ${grants.length} award${grants.length === 1 ? '' : 's'}.`,
    'Funding amounts, eligibility, and deadlines change; confirm the current solicitation or RFP on the official sponsor page before applying.',
    ''
  ];

  grants.forEach((grant, index) => {
    const url = safeExternalUrl(grant.url);
    const locationText = grant.locationLabel || (grant.locations || []).join(', ');
    const fields: Array<[string, string]> = [
      ['Deadline / cycle', grantDeadlinePresentation(grant, now).text],
      ['My application status', PROGRESS_LABELS[getProgress(grant.id) as ProgressStatus] ?? ''],
      ['Sponsor', `${grant.sponsor} (${grant.sponsorCategory})`],
      ['Who for', grant.whoFor],
      ['Funding & perks', grant.amount],
      ['Eligibility', grant.citizenship ? CITIZENSHIP_LABELS[grant.citizenship] : ''],
      ['Geographic eligibility', locationText],
      ['Topics', (grant.topics || []).join(', ')],
      ['Last verified', formatIsoDay(grant.lastVerifiedAt)],
      ['Official page', url === '#' ? '' : `<${url}>`],
      ['CS Picks', `<${SITE_URL}/grants.html?q=${encodeURIComponent(grant.id)}#${encodeURIComponent(grant.id)}>`],
      ['CS Picks ID', `\`${grant.id}\``]
    ];
    lines.push(`## ${index + 1}. ${inline(grant.name)} — ${inline(grant.sponsor)}`, '');
    fields.forEach(([name, value]) => { if (inline(value)) lines.push(`- **${name}:** ${inline(value)}`); });
    if (grant.summary) lines.push('', `> ${inline(grant.summary)}`);
    lines.push('');
  });

  return `${lines.join('\n').trimEnd()}\n`;
}
