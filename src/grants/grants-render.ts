/** CS Awards & Grants cards use the same hierarchy as US Jobs. */
import { resultActions } from '../result-actions.js';
import { opportunityHeader, opportunityDeadline, opportunityMeta, awardDeadlineTone } from '../opportunity-card.js';
import { escapeHtml } from '../shared.js';
import type { Grant } from '../types.js';
import { grantDeadlinePresentation } from './grants-data.js';

export function renderGrantCard(grant: Grant, isFavorite: (id: string) => boolean = () => false) {
  const eligibilityItems = (grant.eligibility || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const topicChips = (grant.topics || []).map(t => `<button type="button" class="opportunity-chip grant-topic-chip" data-search-topic="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  const locationText = grant.locationLabel || (
    grant.locations?.length === 1 ? grant.locations[0] :
      grant.locations?.length ? `${grant.locations.length} eligible jurisdictions` : ''
  );
  const deadline = grantDeadlinePresentation(grant);
  const historical = grant.status === 'historical';
  const notes = [
    historical ? '<span class="opportunity-chip grant-status-badge">Historical</span>' : '',
    deadline.estimated ? '<span class="opportunity-chip grant-estimated-badge" title="Projected from the latest published cycle; confirm on the official program page">Estimated</span>' : ''
  ].join('');
  return `<article class="opportunity-card grant-card ${historical ? 'is-historical' : ''}" id="${escapeHtml(grant.id)}" data-grant-id="${escapeHtml(grant.id)}">
    ${opportunityHeader({ id: grant.id, title: grant.name, url: grant.url, kind: 'grant', favorite: isFavorite(grant.id),
      organizationHtml: `<button type="button" class="opportunity-filter-link grant-sponsor-btn" data-search-sponsor="${escapeHtml(grant.sponsor)}"><strong>${escapeHtml(grant.sponsor)}</strong></button>`,
      tagsHtml: `<span class="opportunity-chip opportunity-chip-type grant-cat-badge">${escapeHtml(grant.sponsorCategory)}</span>` })}
    ${opportunityDeadline(deadline.text, { className: awardDeadlineTone(deadline.text, deadline.estimated, historical), valueClass: 'grant-meta-val', notesHtml: notes })}
    ${opportunityMeta([
      { label: 'Who for', value: grant.whoFor },
      { label: 'Funding & perks', value: grant.amount },
      ...(locationText ? [{ label: 'Geographic eligibility', value: locationText }] : [])
    ])}
    ${grant.summary ? `<p class="opportunity-summary grant-summary">${escapeHtml(grant.summary)}</p>` : ''}
    ${eligibilityItems ? `<details class="opportunity-details grant-eligibility-accordion"><summary>Eligibility requirements (${grant.eligibility.length})</summary><ul class="grant-eligibility-list">${eligibilityItems}</ul></details>` : ''}
    ${topicChips ? `<div class="opportunity-topics grant-topics"><span class="opportunity-label">Topics</span>${topicChips}</div>` : ''}
    <div class="grant-card-footer result-card-footer">${resultActions(grant.name, `<a href="grants-submit.html?id=${encodeURIComponent(grant.id)}">Suggest update</a>`, `grants.html?q=${encodeURIComponent(grant.id)}#${encodeURIComponent(grant.id)}`)}</div>
  </article>`;
}
