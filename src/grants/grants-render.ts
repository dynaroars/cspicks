/**
 * CS Awards & Grants Card Renderer
 */
import { escapeHtml, safeExternalUrl } from '../shared.js';
import type { Grant } from '../types.js';

const LINK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';
const EXT_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

function getCategoryClass(category: string) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('government')) return 'category-gov';
  if (cat.includes('industry')) return 'category-ind';
  if (cat.includes('foundation') || cat.includes('non-profit')) return 'category-fnd';
  if (cat.includes('society') || cat.includes('professional')) return 'category-soc';
  return 'category-gen';
}

export function renderGrantCard(grant: Grant) {
  const url = safeExternalUrl(grant.url);
  const catClass = getCategoryClass(grant.sponsorCategory);
  const eligibilityItems = (grant.eligibility || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const topicChips = (grant.topics || []).map(t => `<button type="button" class="grant-topic-chip" data-search-topic="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  const locationText = grant.locationLabel || (
    grant.locations?.length === 1 ? grant.locations[0] :
      grant.locations?.length ? `${grant.locations.length} eligible jurisdictions` : ''
  );

  return `
    <article class="grant-card ${grant.featured ? 'is-featured' : ''} ${grant.status === 'historical' ? 'is-historical' : ''}" id="${escapeHtml(grant.id)}" data-grant-id="${escapeHtml(grant.id)}">
      <div class="grant-card-header">
        <div class="grant-title-row">
          <div class="grant-title-wrap">
            <h2 class="grant-title">
              <a href="${url}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(grant.name)}
              </a>
            </h2>
          </div>
          <div class="grant-badges">
            ${grant.status === 'historical' ? '<span class="grant-status-badge">Historical</span>' : ''}
            <span class="grant-cat-badge ${catClass}">${escapeHtml(grant.sponsorCategory)}</span>
            ${grant.featured ? '<span class="grant-featured-badge" title="Highlighted award" aria-label="Highlighted award">★</span>' : ''}
          </div>
        </div>

        <div class="grant-sponsor-row">
          <button type="button" class="grant-sponsor-btn" data-search-sponsor="${escapeHtml(grant.sponsor)}">
            🏛️ <strong>${escapeHtml(grant.sponsor)}</strong>
          </button>
        </div>
      </div>

      <div class="grant-meta-grid">
        <div class="grant-meta-item">
          <span class="grant-meta-label">Who for</span>
          <span class="grant-meta-val">${escapeHtml(grant.whoFor)}</span>
        </div>

        <div class="grant-meta-item">
          <span class="grant-meta-label">Deadline / Cycle</span>
          <span class="grant-meta-val">${escapeHtml(grant.deadline)}</span>
        </div>

        <div class="grant-meta-item">
          <span class="grant-meta-label">Funding &amp; Perks</span>
          <span class="grant-meta-val">${escapeHtml(grant.amount)}</span>
        </div>

        ${locationText ? `<div class="grant-meta-item">
          <span class="grant-meta-label">Geographic Eligibility</span>
          <span class="grant-meta-val">${escapeHtml(locationText)}</span>
        </div>` : ''}
      </div>

      <div class="grant-body">
        <p class="grant-summary">${escapeHtml(grant.summary)}</p>

        ${eligibilityItems ? `
          <details class="grant-eligibility-accordion">
            <summary>Key Eligibility Requirements (${(grant.eligibility || []).length})</summary>
            <ul class="grant-eligibility-list">
              ${eligibilityItems}
            </ul>
          </details>
        ` : ''}

        <div class="grant-topics">
          <span class="grant-topics-label">Topics:</span>
          ${topicChips}
        </div>
      </div>

      <div class="grant-card-footer">
        <a href="${url}" class="grant-action-link" target="_blank" rel="noopener noreferrer">
          Official Program &amp; RFP ${EXT_ICON}
        </a>
        <div class="grant-footer-btns">
          <a href="grants-submit.html?id=${encodeURIComponent(grant.id)}" class="grant-edit-link" title="Suggest an edit for this award">
            ✎ Suggest update
          </a>
          <button type="button" class="grant-share-btn" data-share-grant="${escapeHtml(grant.id)}" title="Copy link to this grant" aria-label="Copy link to ${escapeHtml(grant.name)}">
            ${LINK_ICON} <span>Copy link</span>
          </button>
        </div>
      </div>
    </article>
  `;
}
