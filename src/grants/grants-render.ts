import { resultActions } from '../result-actions.js';
/**
 * CS Awards & Grants Card Renderer
 */
import { escapeHtml, safeExternalUrl } from '../shared.js';
import type { Grant } from '../types.js';
import { grantDeadlinePresentation } from './grants-data.js';
import { favoriteToggleButton } from '../favorites.js';


function getCategoryClass(category: string) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('government')) return 'category-gov';
  if (cat.includes('industry')) return 'category-ind';
  if (cat.includes('foundation') || cat.includes('non-profit')) return 'category-fnd';
  if (cat.includes('society') || cat.includes('professional')) return 'category-soc';
  return 'category-gen';
}

export function renderGrantCard(grant: Grant, isFavorite: (id: string) => boolean = () => false) {
  const url = safeExternalUrl(grant.url);
  const catClass = getCategoryClass(grant.sponsorCategory);
  const eligibilityItems = (grant.eligibility || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const topicChips = (grant.topics || []).map(t => `<button type="button" class="grant-topic-chip" data-search-topic="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  const locationText = grant.locationLabel || (
    grant.locations?.length === 1 ? grant.locations[0] :
      grant.locations?.length ? `${grant.locations.length} eligible jurisdictions` : ''
  );
  const deadline = grantDeadlinePresentation(grant);

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
            ${deadline.estimated ? '<span class="grant-estimated-badge" title="Projected from the latest published cycle; confirm on the official program page">Estimated</span>' : ''}
            <span class="grant-cat-badge ${catClass}">${escapeHtml(grant.sponsorCategory)}</span>
            ${favoriteToggleButton(grant.id, isFavorite(grant.id))}
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
          <span class="grant-meta-val">${escapeHtml(deadline.text)}</span>
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

      <div class="grant-card-footer result-card-footer">${resultActions(grant.name, `
        <a href="grants-submit.html?id=${encodeURIComponent(grant.id)}" class="grant-edit-link">Suggest update</a>
      `, `grants.html?q=${encodeURIComponent(grant.id)}#${encodeURIComponent(grant.id)}`)}</div>
    </article>
  `;
}
