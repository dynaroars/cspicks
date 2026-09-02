/**
 * CS Awards & Grants Submission and Edit Controller
 */
import { escapeHtml } from '../shared.js';
import { loadGrantsData } from './grants-data.js';
import {
  buildGrantEmailUrl,
  buildGrantGithubIssueUrl,
  buildGrantSubmissionContent
} from './submission.js';
import type { Grant } from '../types.js';

const root = document.getElementById('submission-form-root');
let allGrants: Grant[] = [];
let grantsById = new Map<string, Grant>();

function renderForm() {
  root.innerHTML = `
    <form id="grants-submit-form" class="grants-submit-form" novalidate>
      <fieldset class="submit-section">
        <legend>What would you like to do?</legend>
        <label class="submit-choice"><input type="radio" name="kind" value="new" checked> Add a new award / call for proposals</label>
        <label class="submit-choice"><input type="radio" name="kind" value="correction"> Edit or update an existing award</label>
      </fieldset>

      <div class="submit-section submit-target" id="correction-target-row" hidden>
        <label for="target">Select existing award to edit</label>
        <input id="target" name="target" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="grant-correction-suggestions" placeholder="Type award name or sponsor...">
        <div id="grant-correction-suggestions" class="grant-correction-suggestions" role="listbox" hidden></div>
        <p class="submit-help" id="correction-target-help">Start typing to search existing awards. Selecting one auto-fills its details for editing.</p>
      </div>

      <div class="submit-section">
        <label for="url">Official Program / RFP URL *</label>
        <input id="url" name="url" type="url" required placeholder="https://..." aria-describedby="url-help">
        <p class="submit-help" id="url-help">Main link to the call for proposals, RFP, fellowship page, or sponsor announcement.</p>
      </div>

      <div class="submit-grid">
        <div class="submit-section">
          <label for="name">Award / Program Name</label>
          <input id="name" name="name" type="text" placeholder="e.g. Google Research Scholar Program">
        </div>
        <div class="submit-section">
          <label for="sponsor">Sponsor Organization</label>
          <input id="sponsor" name="sponsor" type="text" placeholder="e.g. Google, NSF, DARPA, Sloan Foundation">
        </div>
      </div>

      <div class="submit-grid">
        <div class="submit-section">
          <label for="sponsorCategory">Sponsor Type</label>
          <select id="sponsorCategory" name="sponsorCategory">
            <option value="">-- Select type (optional) --</option>
            <option value="Government">Government (NSF, DARPA, DOE, DoD, etc.)</option>
            <option value="Industry">Industry (Tech Company)</option>
            <option value="Non-Profit / Foundation">Foundation / Non-Profit</option>
            <option value="Professional Society">Professional Society (CRA, ACM, IEEE)</option>
          </select>
        </div>
        <div class="submit-section">
          <label for="deadline">Submission Deadline / Cycle</label>
          <input id="deadline" name="deadline" type="text" placeholder="e.g. Annual (October 15), Rolling / Open">
        </div>
      </div>

      <div class="submit-section">
        <label>Who is it for? (Audience)</label>
        <div class="submit-checkbox-group">
          <label class="submit-choice"><input type="checkbox" name="audience_faculty" value="Faculty"> Faculty (Early-Career &amp; Senior)</label>
          <label class="submit-choice"><input type="checkbox" name="audience_phd" value="PhD Students"> PhD / Doctoral Students</label>
          <label class="submit-choice"><input type="checkbox" name="audience_undergrad" value="Undergraduate Students"> Undergraduates</label>
          <label class="submit-choice"><input type="checkbox" name="audience_postdoc" value="Postdocs"> Postdocs &amp; Fellows</label>
        </div>
      </div>

      <div class="submit-grid">
        <div class="submit-section">
          <label for="amount">Funding Amount &amp; Perks</label>
          <input id="amount" name="amount" type="text" placeholder="e.g. $100,000 unrestricted gift, $45k/yr stipend + tuition">
        </div>
        <div class="submit-section">
          <label for="topics">Research Topics</label>
          <input id="topics" name="topics" type="text" placeholder="e.g. AI/ML, Systems, Security, Theory, Robotics">
        </div>
      </div>

      <div class="submit-section">
        <label for="summary">Summary / Description</label>
        <textarea id="summary" name="summary" rows="3" placeholder="Brief summary of research scope, funding focus, and objectives..."></textarea>
      </div>

      <div class="submit-section">
        <label for="comments">Additional Notes / Eligibility Details</label>
        <textarea id="comments" name="comments" rows="2" placeholder="Any specific eligibility criteria, citizenship rules, or nomination requirements..."></textarea>
      </div>

      <div class="submit-actions">
        <button type="submit" class="submit-button" id="generate-button">Review &amp; Submit</button>
      </div>
    </form>

    <div id="submit-review-card" class="submit-review-card" hidden>
      <h3>Review Your Proposal</h3>
      <p class="submit-help">Choose how you'd like to submit this update for review:</p>
      <pre id="review-json"></pre>
      <div class="submit-actions">
        <a id="github-issue-link" class="submit-button" target="_blank" rel="noopener noreferrer">Submit via GitHub Issue ↗</a>
        <a id="email-submit-link" class="submit-button submit-button-secondary">Submit via Email ✉</a>
        <button type="button" class="submit-button submit-button-secondary" id="copy-json-btn">Copy JSON</button>
      </div>
    </div>
  `;
}

function getFormData() {
  const form = document.getElementById('grants-submit-form');
  if (!form) return null;

  const kind = form.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value || 'new';
  const url = form.querySelector<HTMLInputElement>('#url')?.value.trim();
  const name = form.querySelector<HTMLInputElement>('#name')?.value.trim();
  const sponsor = form.querySelector<HTMLInputElement>('#sponsor')?.value.trim();
  const sponsorCategory = form.querySelector<HTMLSelectElement>('#sponsorCategory')?.value;
  const deadline = form.querySelector<HTMLInputElement>('#deadline')?.value.trim();
  const amount = form.querySelector<HTMLInputElement>('#amount')?.value.trim();
  const summary = form.querySelector<HTMLTextAreaElement>('#summary')?.value.trim();
  const comments = form.querySelector<HTMLTextAreaElement>('#comments')?.value.trim();
  const topicsRaw = form.querySelector<HTMLInputElement>('#topics')?.value.trim();

  const targetAudience = [];
  if (form.querySelector<HTMLInputElement>('input[name="audience_faculty"]')?.checked) targetAudience.push('Faculty');
  if (form.querySelector<HTMLInputElement>('input[name="audience_phd"]')?.checked) targetAudience.push('PhD Students');
  if (form.querySelector<HTMLInputElement>('input[name="audience_undergrad"]')?.checked) targetAudience.push('Undergraduate Students');
  if (form.querySelector<HTMLInputElement>('input[name="audience_postdoc"]')?.checked) targetAudience.push('Postdocs');

  const topics = topicsRaw ? topicsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const submission: Record<string, string | string[] | null> = {
    submissionType: kind === 'correction' ? 'edit_existing_award' : 'new_award_proposal',
    officialUrl: url || null,
    awardName: name || null,
    sponsor: sponsor || null,
    sponsorCategory: sponsorCategory || null,
    targetAudience: targetAudience.length ? targetAudience : null,
    deadline: deadline || null,
    amount: amount || null,
    topics: topics.length ? topics : null,
    summary: summary || null,
    additionalNotes: comments || null
  };

  // Clean empty fields
  for (const [k, v] of Object.entries(submission)) {
    if (v === null || (Array.isArray(v) && v.length === 0)) {
      delete submission[k];
    }
  }

  return { kind, url, name, submission };
}

function prefillFromGrant(grant: Grant | undefined) {
  const form = document.getElementById('grants-submit-form');
  if (!form || !grant) return;

  if (grant.url) form.querySelector<HTMLInputElement>('#url')!.value = grant.url;
  if (grant.name) form.querySelector<HTMLInputElement>('#name')!.value = grant.name;
  if (grant.sponsor) form.querySelector<HTMLInputElement>('#sponsor')!.value = grant.sponsor;
  if (grant.sponsorCategory) form.querySelector<HTMLSelectElement>('#sponsorCategory')!.value = grant.sponsorCategory;
  if (grant.deadline) form.querySelector<HTMLInputElement>('#deadline')!.value = grant.deadline;
  if (grant.amount) form.querySelector<HTMLInputElement>('#amount')!.value = grant.amount;
  if (grant.summary) form.querySelector<HTMLTextAreaElement>('#summary')!.value = grant.summary;
  if (grant.topics) form.querySelector<HTMLInputElement>('#topics')!.value = grant.topics.join(', ');

  const auds = (grant.targetAudience || []).map(a => a.toLowerCase());
  const facEl = form.querySelector<HTMLInputElement>('input[name="audience_faculty"]');
  const phdEl = form.querySelector<HTMLInputElement>('input[name="audience_phd"]');
  const undEl = form.querySelector<HTMLInputElement>('input[name="audience_undergrad"]');
  const postEl = form.querySelector<HTMLInputElement>('input[name="audience_postdoc"]');

  if (facEl) facEl.checked = auds.some(a => a.includes('faculty'));
  if (phdEl) phdEl.checked = auds.some(a => a.includes('phd') || a.includes('doctoral') || a.includes('student'));
  if (undEl) undEl.checked = auds.some(a => a.includes('undergrad'));
  if (postEl) postEl.checked = auds.some(a => a.includes('postdoc'));

  updateReview();
}

function updateReview() {
  const { kind, url, name, submission } = getFormData() || {};
  if (!url) return;

  const reviewCard = document.getElementById('submit-review-card');
  const reviewJson = document.getElementById('review-json');
  const ghLink = document.querySelector<HTMLAnchorElement>('#github-issue-link')!;
  const emailLink = document.querySelector<HTMLAnchorElement>('#email-submit-link')!;

  const content = buildGrantSubmissionContent(submission);
  reviewJson.textContent = content;

  const label = name ? `${name} (${url})` : url;
  ghLink.href = buildGrantGithubIssueUrl(label, content);
  emailLink.href = buildGrantEmailUrl(label, content);

  reviewCard.hidden = false;
  reviewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setupEvents() {
  const form = document.getElementById('grants-submit-form');
  const targetRow = document.getElementById('correction-target-row');
  const targetInput = document.querySelector<HTMLInputElement>('#target')!;
  const suggestionsBox = document.getElementById('grant-correction-suggestions');
  const copyBtn = document.getElementById('copy-json-btn');

  // Mode radio change
  form.querySelectorAll<HTMLInputElement>('input[name="kind"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'correction') {
        targetRow.hidden = false;
        targetInput.focus();
      } else {
        targetRow.hidden = true;
      }
    });
  });

  // Autocomplete for existing awards
  targetInput.addEventListener('input', () => {
    const q = targetInput.value.trim().toLowerCase();
    if (!q) {
      suggestionsBox.hidden = true;
      return;
    }

    const matches = allGrants.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.sponsor.toLowerCase().includes(q) ||
      (g.shortName && g.shortName.toLowerCase().includes(q))
    ).slice(0, 8);

    if (!matches.length) {
      suggestionsBox.innerHTML = '<div style="padding: 0.6rem 0.85rem; color: var(--text-secondary); font-size: 0.82rem;">No matching awards found</div>';
      suggestionsBox.hidden = false;
      return;
    }

    suggestionsBox.innerHTML = matches.map(g => `
      <button type="button" class="grant-correction-suggestion" data-grant-id="${escapeHtml(g.id)}">
        <strong>${escapeHtml(g.name)}</strong>
        <span>${escapeHtml(g.sponsor)} • ${escapeHtml(g.whoFor || '')}</span>
      </button>
    `).join('');
    suggestionsBox.hidden = false;
  });

  suggestionsBox.addEventListener('click', event => {
    const btn = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-grant-id]') : null;
    if (!btn) return;
    const grant = grantsById.get(btn.dataset.grantId);
    if (grant) {
      targetInput.value = grant.name;
      suggestionsBox.hidden = true;
      prefillFromGrant(grant);
    }
  });

  document.addEventListener('click', e => {
    const target = e.target instanceof Node ? e.target : null;
    if (target && !targetInput.contains(target) && !suggestionsBox.contains(target)) {
      suggestionsBox.hidden = true;
    }
  });

  // Form submit
  form.addEventListener('submit', event => {
    event.preventDefault();
    const urlInput = form.querySelector<HTMLInputElement>('#url')!;
    if (!urlInput.value.trim()) {
      urlInput.focus();
      urlInput.reportValidity();
      return;
    }
    updateReview();
  });

  // Copy JSON button
  copyBtn?.addEventListener('click', () => {
    const reviewJson = document.getElementById('review-json');
    navigator.clipboard.writeText(reviewJson.textContent).then(() => {
      const orig = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      window.setTimeout(() => (copyBtn.textContent = orig), 1800);
    });
  });
}

async function init() {
  renderForm();
  try {
    allGrants = await loadGrantsData();
    grantsById = new Map(allGrants.map(g => [g.id, g]));

    setupEvents();

    // Check query params for prefill (e.g. grants-submit.html?id=nsf-career)
    const params = new URLSearchParams(window.location.search);
    const grantId = params.get('id') || params.get('edit');
    if (grantId && grantsById.has(grantId)) {
      const correctionRadio = document.querySelector<HTMLInputElement>('input[name="kind"][value="correction"]');
      if (correctionRadio) {
        correctionRadio.checked = true;
        document.getElementById('correction-target-row').hidden = false;
        document.querySelector<HTMLInputElement>('#target')!.value = grantsById.get(grantId)!.name;
      }
      prefillFromGrant(grantsById.get(grantId));
    }
  } catch (error) {
    console.error('Failed to initialize grants submit form:', error);
  }
}

init();
