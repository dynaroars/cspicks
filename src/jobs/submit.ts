/**
 * US Jobs submission and correction form. Crawling department pages is the main source of
 * postings; this is the lead channel for ones the crawl missed or got wrong.
 */
import { areaLabels, escapeHtml } from '../shared.js';
import { LEVEL_LABELS, TRACK_LABELS, VISA_LABELS, loadJobsData } from './jobs-data.js';
import { US_STATES } from './states.js';
import { buildJobEmailUrl, buildJobGithubIssueUrl, buildJobSubmissionContent } from './submission.js';
import { DELIVERY_BUTTONS, QUICK_SECTION, deliver, quickLabel, quickPayload, setupQuickMode } from '../submit-quick.js';
import type { Job } from '../types.js';

const root = document.getElementById('submission-form-root')!;
let jobsById = new Map<string, Job>();
let allJobs: Job[] = [];

const options = (entries: Array<[string, string]>, empty: string) =>
  `<option value="">${escapeHtml(empty)}</option>${entries.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}`;

function renderForm() {
  root.innerHTML = `
    <form id="jobs-submit-form" class="grants-submit-form" novalidate>
      <fieldset class="submit-section">
        <legend>What would you like to do?</legend>
        <label class="submit-choice"><input type="radio" name="kind" value="new" checked> Add a new job posting</label>
        <label class="submit-choice"><input type="radio" name="kind" value="correction"> Update or report a closed / incorrect posting</label>
      </fieldset>

      ${QUICK_SECTION}

      <div id="structured-fields" hidden>
      <div class="submit-section submit-target" id="correction-target-row" hidden>
        <label for="target">Select existing posting</label>
        <input id="target" name="target" type="text" autocomplete="off" placeholder="Type school or position title...">
        <div id="job-correction-suggestions" class="grant-correction-suggestions" role="listbox" hidden></div>
        <p class="submit-help">Selecting one fills in its current details so you can change them.</p>
      </div>

      <div class="submit-section">
        <label for="url">Official posting URL *</label>
        <input id="url" name="url" type="url" required placeholder="https://...">
        <p class="submit-help">The department or university page for this position (not a third-party repost).</p>
      </div>

      <div class="submit-grid">
        <div class="submit-section"><label for="school">University</label><input id="school" name="school" type="text" placeholder="e.g. Georgia Institute of Technology"></div>
        <div class="submit-section"><label for="department">Department / School</label><input id="department" name="department" type="text" placeholder="e.g. School of Computer Science"></div>
      </div>
      <div class="submit-section"><label for="title">Position title</label><input id="title" name="title" type="text" placeholder="e.g. Assistant Professor, Security and Privacy"></div>

      <div class="submit-grid">
        <div class="submit-section"><label for="track">Position type</label><select id="track" name="track">${options(Object.entries(TRACK_LABELS), '-- Select (optional) --')}</select></div>
        <div class="submit-section"><label for="level">Rank</label><select id="level" name="level">${options(Object.entries(LEVEL_LABELS), '-- Select (optional) --')}</select></div>
      </div>
      <div class="submit-grid">
        <div class="submit-section"><label for="state">State</label><select id="state" name="state">${options(Object.entries(US_STATES), '-- Select (optional) --')}</select></div>
        <div class="submit-section"><label for="city">City</label><input id="city" name="city" type="text" placeholder="e.g. Atlanta"></div>
      </div>
      <div class="submit-grid">
        <div class="submit-section"><label for="areas">Research areas</label><input id="areas" name="areas" type="text" list="area-options" placeholder="e.g. Security, Machine Learning (blank if any area)"><datalist id="area-options">${Object.values(areaLabels).map(label => `<option value="${escapeHtml(label)}"></option>`).join('')}</datalist></div>
        <div class="submit-section"><label for="deadline">Application deadline</label><input id="deadline" name="deadline" type="date"></div>
      </div>
      <div class="submit-section"><label for="visa">Visa sponsorship (as the posting states it)</label><select id="visa" name="visa">${options(Object.entries(VISA_LABELS), '-- Select (optional) --')}</select></div>
      <div class="submit-section">
        <label class="submit-choice"><input type="checkbox" id="rolling" name="rolling"> Reviews applications until filled (rolling)</label>
        <label class="submit-choice"><input type="checkbox" id="closed" name="closed"> This posting is closed or filled</label>
      </div>
      <div class="submit-section"><label for="comments">Notes</label><textarea id="comments" name="comments" rows="3" placeholder="Anything else a reviewer should know, e.g. review start date, start term, or what is wrong with the current listing."></textarea></div>
      </div>

      ${DELIVERY_BUTTONS}
    </form>`;
}

const value = (form: Element, selector: string) => (form.querySelector<HTMLInputElement>(selector)?.value || '').trim();

function getFormData() {
  const form = document.getElementById('jobs-submit-form')!;
  const kind = form.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value || 'new';
  const areas = value(form, '#areas').split(',').map(area => area.trim()).filter(Boolean);
  const submission: Record<string, unknown> = {
    submissionType: kind === 'correction' ? 'edit_existing_job' : 'new_job_posting',
    existingId: kind === 'correction' ? form.dataset.jobId || null : null,
    officialUrl: value(form, '#url'),
    university: value(form, '#school'),
    department: value(form, '#department'),
    title: value(form, '#title'),
    positionType: value(form, '#track'),
    rank: value(form, '#level'),
    state: value(form, '#state'),
    city: value(form, '#city'),
    areas,
    deadline: value(form, '#deadline'),
    visaSponsorship: value(form, '#visa'),
    rolling: form.querySelector<HTMLInputElement>('#rolling')?.checked || null,
    closedOrFilled: form.querySelector<HTMLInputElement>('#closed')?.checked || null,
    additionalNotes: value(form, '#comments')
  };
  for (const [key, entry] of Object.entries(submission)) {
    if (entry === '' || entry === null || (Array.isArray(entry) && !entry.length)) delete submission[key];
  }
  return { url: String(submission.officialUrl || ''), title: String(submission.title || submission.university || ''), submission };
}

function prefill(job: Job) {
  const form = document.getElementById('jobs-submit-form')!;
  const set = (selector: string, text: string) => { const el = form.querySelector<HTMLInputElement>(selector); if (el) el.value = text; };
  form.dataset.jobId = job.id;
  set('#url', job.url);
  set('#school', job.school);
  set('#department', job.department);
  set('#title', job.title);
  set('#track', job.track);
  set('#level', job.level || '');
  set('#state', job.state);
  set('#city', job.city || '');
  set('#areas', job.areas.map(area => areaLabels[area] || area).join(', '));
  set('#deadline', job.deadline || '');
  set('#visa', job.visaSponsorship || '');
  const rolling = form.querySelector<HTMLInputElement>('#rolling');
  if (rolling) rolling.checked = Boolean(job.rolling);
}

function selectCorrection() {
  const form = document.getElementById('jobs-submit-form') as HTMLFormElement;
  const targetInput = form.querySelector<HTMLInputElement>('#target')!;
  const box = document.getElementById('job-correction-suggestions')!;
  targetInput.addEventListener('input', () => {
    const query = targetInput.value.trim().toLowerCase();
    const matches = query ? allJobs.filter(job => `${job.school} ${job.title} ${job.department}`.toLowerCase().includes(query)).slice(0, 8) : [];
    box.hidden = !query;
    box.innerHTML = matches.length
      ? matches.map(job => `<button type="button" class="grant-correction-suggestion" data-job-id="${escapeHtml(job.id)}"><strong>${escapeHtml(job.title)}</strong><span>${escapeHtml(job.school)} • ${escapeHtml(job.department)}</span></button>`).join('')
      : '<div style="padding: 0.6rem 0.85rem; color: var(--text-secondary); font-size: 0.82rem;">No matching postings found</div>';
  });
  box.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-job-id]') : null;
    const job = button?.dataset.jobId ? jobsById.get(button.dataset.jobId) : undefined;
    if (!job) return;
    targetInput.value = `${job.title} — ${job.school}`;
    box.hidden = true;
    prefill(job);
  });
}

function setupEvents() {
  const form = document.getElementById('jobs-submit-form') as HTMLFormElement;
  const targetRow = document.getElementById('correction-target-row')!;
  const quick = setupQuickMode(form);
  quick.apply();
  selectCorrection();
  form.querySelectorAll<HTMLInputElement>('input[name="kind"]').forEach(radio => radio.addEventListener('change', () => {
    quick.apply();
    targetRow.hidden = radio.value !== 'correction';
  }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    const builders = { github: buildJobGithubIssueUrl, email: buildJobEmailUrl };
    if (!form.reportValidity()) return;
    if (quick.isQuick()) {
      deliver(submitter, quickLabel(form), buildJobSubmissionContent(quickPayload(form)), builders);
      return;
    }
    const { url, title, submission } = getFormData();
    deliver(submitter, title ? `${title} (${url})` : url, buildJobSubmissionContent(submission), builders);
  });
}

async function init() {
  renderForm();
  try {
    allJobs = await loadJobsData();
    jobsById = new Map(allJobs.map(job => [job.id, job]));
  } catch (error) {
    console.error('Failed to load jobs data for the submit form:', error);
  }
  setupEvents();
  const id = new URLSearchParams(window.location.search).get('id');
  const job = id ? jobsById.get(id) : undefined;
  if (job) {
    const radio = document.querySelector<HTMLInputElement>('input[name="kind"][value="correction"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    document.querySelector<HTMLInputElement>('#target')!.value = `${job.title} — ${job.school}`;
    prefill(job);
  }
}

init();
