/**
 * CS Awards & Grants Submission and Edit Controller
 */
import { loadGrantsData } from './grants-data.js';
import { grantSubmission } from '../submission.js';
import { DELIVERY_BUTTONS, QUICK_SECTION, wireSubmissionForm } from '../submit-quick.js';
import type { Grant } from '../types.js';

const root = document.getElementById('submission-form-root')!;

function renderForm() {
  root.innerHTML = `
    <form id="grants-submit-form" class="submit-form" novalidate>
      <fieldset class="submit-section">
        <legend>What would you like to do?</legend>
        <label class="submit-choice"><input type="radio" name="kind" value="new" checked> Add a new award / call for proposals</label>
        <label class="submit-choice"><input type="radio" name="kind" value="correction"> Edit or update an existing award</label>
      </fieldset>

      ${QUICK_SECTION}

      <div id="structured-fields" hidden>

      <div class="submit-section" id="correction-target-row" hidden>
        <label for="target">Select existing award to edit</label>
        <div class="submit-combobox">
          <input id="target" name="target" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="grant-correction-suggestions" placeholder="Type award name or sponsor...">
          <div id="grant-correction-suggestions" class="correction-suggestions" role="listbox" hidden></div>
        </div>
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
      </div>

      ${DELIVERY_BUTTONS}
    </form>
  `;
}

function getFormData() {
  const form = document.getElementById('grants-submit-form')!;
  const kind = form.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value || 'new';
  const url = form.querySelector<HTMLInputElement>('#url')?.value.trim() || '';
  const name = form.querySelector<HTMLInputElement>('#name')?.value.trim() || '';
  const sponsor = form.querySelector<HTMLInputElement>('#sponsor')?.value.trim() || '';
  const sponsorCategory = form.querySelector<HTMLSelectElement>('#sponsorCategory')?.value || '';
  const deadline = form.querySelector<HTMLInputElement>('#deadline')?.value.trim() || '';
  const amount = form.querySelector<HTMLInputElement>('#amount')?.value.trim() || '';
  const summary = form.querySelector<HTMLTextAreaElement>('#summary')?.value.trim() || '';
  const comments = form.querySelector<HTMLTextAreaElement>('#comments')?.value.trim() || '';
  const topicsRaw = form.querySelector<HTMLInputElement>('#topics')?.value.trim() || '';

  const targetAudience = [];
  if (form.querySelector<HTMLInputElement>('input[name="audience_faculty"]')?.checked) targetAudience.push('Faculty');
  if (form.querySelector<HTMLInputElement>('input[name="audience_phd"]')?.checked) targetAudience.push('PhD Students');
  if (form.querySelector<HTMLInputElement>('input[name="audience_undergrad"]')?.checked) targetAudience.push('Undergraduate Students');
  if (form.querySelector<HTMLInputElement>('input[name="audience_postdoc"]')?.checked) targetAudience.push('Postdocs');

  const topics = topicsRaw ? topicsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const submission: Record<string, unknown> = {
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

  for (const [k, v] of Object.entries(submission)) {
    if (v === null || (Array.isArray(v) && v.length === 0)) {
      delete submission[k];
    }
  }

  return { label: name ? `${name} (${url})` : url, submission };
}

function prefillFromGrant(grant: Grant) {
  const form = document.getElementById('grants-submit-form');
  if (!form) return;

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
}

async function init() {
  renderForm();
  let allGrants: Grant[] = [];
  try {
    allGrants = await loadGrantsData();
  } catch (error) {
    console.error('Failed to initialize grants submit form:', error);
  }
  wireSubmissionForm({
    form: document.getElementById('grants-submit-form') as HTMLFormElement,
    suggestionsBox: document.getElementById('grant-correction-suggestions')!,
    items: allGrants,
    getId: grant => grant.id,
    matches: (grant, query) =>
      grant.name.toLowerCase().includes(query) ||
      grant.sponsor.toLowerCase().includes(query) ||
      Boolean(grant.shortName && grant.shortName.toLowerCase().includes(query)),
    suggestionTitle: grant => grant.name,
    suggestionDetail: grant => `${grant.sponsor} • ${grant.whoFor || ''}`,
    targetInputValue: grant => grant.name,
    emptyText: 'No matching awards found',
    prefill: prefillFromGrant,
    getStructured: getFormData,
    builders: { github: grantSubmission.buildGithubIssueUrl, email: grantSubmission.buildEmailUrl }
  });
}

init();
