import { escapeHtml } from '../src/shared.js';
import {
  buildConferenceEmailUrl,
  buildConferenceGithubIssueUrl,
  buildConferenceSubmissionContent,
} from './submission.js';

const root = document.getElementById('submission-form-root');
let records = [];
let recordsByEdition = new Map();

const text = value => value == null ? '' : String(value);
const nullable = value => value.trim() || null;
const editionKey = (name, year) => `${name.trim().toLocaleLowerCase()}\u0000${year}`;

function renderForm() {
  root.innerHTML = `
    <form id="conference-submit-form" class="conference-submit-form" novalidate>
      <fieldset class="submit-section">
        <legend>What kind of submission is this?</legend>
        <label class="submit-choice"><input type="radio" name="kind" value="new" checked> Add a new conference edition</label>
        <label class="submit-choice"><input type="radio" name="kind" value="correction"> Correct an existing entry</label>
      </fieldset>

      <div class="submit-section submit-target" id="correction-target-row" hidden>
        <label for="target">Existing conference entry *</label>
        <input id="target" name="target" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="conference-correction-suggestions" aria-describedby="correction-target-help">
        <div id="conference-correction-suggestions" class="conference-correction-suggestions" role="listbox" hidden></div>
        <p class="submit-help" id="correction-target-help">Start typing a conference name, year, or cycle. Selecting an entry fills its current values for editing.</p>
      </div>

      <div class="submit-grid">
        <div class="submit-section">
          <label for="name">Conference name *</label>
          <input id="name" name="name" type="text" required placeholder="e.g. PLDI" aria-describedby="conference-duplicate-warning">
          <p class="submit-help submit-warning" id="conference-duplicate-warning" hidden></p>
        </div>
        <div class="submit-section">
          <label for="year">Edition year *</label>
          <input id="year" name="year" type="number" min="2000" max="2100" required value="${new Date().getFullYear() + 1}">
        </div>
      </div>

      <div class="submit-section">
        <label for="description">Full conference name *</label>
        <input id="description" name="description" type="text" required placeholder="e.g. Programming Language Design and Implementation">
      </div>

      <div class="submit-grid">
        <div class="submit-section">
          <label for="link">Official edition URL *</label>
          <input id="link" name="link" type="url" required placeholder="https://…">
        </div>
        <div class="submit-section">
          <label for="seriesLink">Official series URL (optional)</label>
          <input id="seriesLink" name="seriesLink" type="url" placeholder="https://…">
        </div>
      </div>

      <div class="submit-grid">
        <div class="submit-section">
          <label for="date">Conference date or range</label>
          <input id="date" name="date" type="text" placeholder="e.g. June 14–18, 2027">
        </div>
        <div class="submit-section">
          <label for="place">Location</label>
          <input id="place" name="place" type="text" placeholder="City, region, country">
        </div>
      </div>

      <div class="submit-grid submit-grid-dates">
        <div class="submit-section"><label for="abstractDeadline">Abstract deadline</label><input id="abstractDeadline" name="abstractDeadline" type="text" placeholder="YYYY-MM-DD or TBD" pattern="(?:\\d{4}-\\d{2}-\\d{2}|TBD)"></div>
        <div class="submit-section"><label for="deadline">Submission deadline</label><input id="deadline" name="deadline" type="text" placeholder="YYYY-MM-DD or TBD" pattern="(?:\\d{4}-\\d{2}-\\d{2}|TBD)"></div>
        <div class="submit-section"><label for="rebuttalDate">Rebuttal date</label><input id="rebuttalDate" name="rebuttalDate" type="text" placeholder="YYYY-MM-DD or TBD" pattern="(?:\\d{4}-\\d{2}-\\d{2}|TBD)"></div>
        <div class="submit-section"><label for="notificationDate">Notification date</label><input id="notificationDate" name="notificationDate" type="text" placeholder="YYYY-MM-DD or TBD" pattern="(?:\\d{4}-\\d{2}-\\d{2}|TBD)"></div>
      </div>

      <div class="submit-grid">
        <div class="submit-section"><label for="generalChair">General chair(s)</label><input id="generalChair" name="generalChair" type="text"></div>
        <div class="submit-section"><label for="programChair">Program chair(s)</label><input id="programChair" name="programChair" type="text"></div>
      </div>

      <div class="submit-grid">
        <div class="submit-section">
          <label for="acceptanceRate">Acceptance rate (%)</label>
          <input id="acceptanceRate" name="acceptanceRate" type="number" min="0" max="100" step="0.01" placeholder="e.g. 24.50">
        </div>
        <div class="submit-section">
          <label for="submissions">Number of submissions</label>
          <input id="submissions" name="submissions" type="number" min="0" step="1">
        </div>
      </div>

      <fieldset class="submit-section">
        <legend>Record status</legend>
        <label class="submit-choice"><input id="estimated" name="estimated" type="checkbox"> Estimated schedule</label>
        <label class="submit-choice"><input id="verified" name="verified" type="checkbox"> Verified against an official source</label>
      </fieldset>

      <div class="submit-grid">
        <div class="submit-section">
          <label for="note">Submission cycle/note</label>
          <input id="note" name="note" type="text" placeholder="e.g. Cycle 1/2">
        </div>
        <div class="submit-section">
          <label for="venueKeys">Venue key(s)</label>
          <input id="venueKeys" name="venueKeys" type="text" placeholder="Filled automatically for known conferences" aria-describedby="venue-keys-help">
          <p class="submit-help" id="venue-keys-help">Comma-separated internal keys. For a new edition of a known conference, these are inherited automatically.</p>
        </div>
      </div>

      <div class="submit-section">
        <label for="sourceUrl">Official source supporting this proposal *</label>
        <input id="sourceUrl" name="sourceUrl" type="url" required placeholder="Official CFP, committee, venue, or sponsoring-society URL">
      </div>

      <div class="submit-section">
        <label for="notes">Notes for the maintainer</label>
        <textarea id="notes" name="notes" rows="4" placeholder="Describe what is new or incorrect, and which facts the source confirms."></textarea>
      </div>

      <div class="submit-section submit-attestation">
        <label class="submit-choice"><input id="attest" name="attest" type="checkbox" required> I confirm that the proposed facts come from the official conference, sponsoring society, or official proceedings—not a deadline aggregator or an inferred prior-year schedule.</label>
      </div>

      <div class="submit-actions">
        <button type="submit" class="submit-button" name="delivery" value="email">Send by email</button>
        <button type="submit" class="submit-button submit-button-secondary" name="delivery" value="github">Submit as a GitHub issue</button>
      </div>
      <p class="submit-help">Email opens a pre-filled message and requires no account. GitHub opens a pre-filled issue. This site sends no data to a backend.</p>
    </form>`;
}

function entryLabel(entry) {
  return `${entry.name} ${entry.year}${entry.note ? ` · ${entry.note}` : ''}`;
}

function populateEntry(form, entry) {
  for (const field of ['name', 'year', 'description', 'link', 'seriesLink', 'date', 'place', 'abstractDeadline', 'deadline', 'rebuttalDate', 'notificationDate', 'note', 'generalChair', 'programChair']) {
    form[field].value = text(entry[field]);
  }
  form.venueKeys.value = (entry.venueKeys || []).join(', ');
  form.acceptanceRate.value = text(entry.acceptanceRate);
  form.submissions.value = text(entry.submissions);
  form.estimated.checked = Boolean(entry.estimated);
  form.verified.checked = Boolean(entry.verified);
  form.sourceUrl.value = entry.link || entry.seriesLink || '';
  form.dataset.targetName = entry.name;
  form.dataset.targetYear = entry.year;
  form.dataset.targetNote = entry.note || '';
}

function renderDuplicateWarning(form) {
  const warning = document.getElementById('conference-duplicate-warning');
  if (form.kind.value !== 'new') {
    warning.hidden = true;
    return;
  }
  const existing = recordsByEdition.get(editionKey(form.name.value, form.year.value))?.[0];
  if (!existing) {
    warning.hidden = true;
    warning.innerHTML = '';
    return;
  }
  warning.innerHTML = `${escapeHtml(existing.name)} ${escapeHtml(existing.year)} already exists. <button type="button" class="submit-link-button" id="switch-to-correction">Edit the existing entry instead</button>.`;
  warning.hidden = false;
}

function inheritVenueKeys(form) {
  if (form.venueKeys.value.trim()) return;
  const name = form.name.value.trim().toLocaleLowerCase();
  const matching = records.find(entry => entry.name.toLocaleLowerCase() === name);
  if (matching) form.venueKeys.value = matching.venueKeys.join(', ');
}

function buildSubmission(form) {
  const kind = form.kind.value;
  const entry = {
    name: form.name.value.trim(),
    venueKeys: form.venueKeys.value.split(',').map(value => value.trim()).filter(Boolean),
    year: Number(form.year.value),
    description: form.description.value.trim(),
    link: form.link.value.trim(),
    seriesLink: nullable(form.seriesLink.value),
    date: nullable(form.date.value),
    place: nullable(form.place.value),
    abstractDeadline: nullable(form.abstractDeadline.value),
    deadline: nullable(form.deadline.value),
    rebuttalDate: nullable(form.rebuttalDate.value),
    notificationDate: nullable(form.notificationDate.value),
    note: nullable(form.note.value),
    generalChair: nullable(form.generalChair.value),
    programChair: nullable(form.programChair.value),
    acceptanceRate: form.acceptanceRate.value === '' ? null : Number(form.acceptanceRate.value),
    submissions: form.submissions.value === '' ? null : Number(form.submissions.value),
    estimated: form.estimated.checked,
    verified: form.verified.checked,
  };
  return {
    type: kind,
    target: kind === 'correction' ? {
      name: form.dataset.targetName || form.name.value.trim(),
      year: Number(form.dataset.targetYear || form.year.value),
      note: form.dataset.targetNote || null,
    } : null,
    sourceUrl: form.sourceUrl.value.trim(),
    notes: form.notes.value.trim(),
    entry,
  };
}

function setupForm() {
  const form = document.getElementById('conference-submit-form');
  const target = form.target;
  const suggestions = document.getElementById('conference-correction-suggestions');
  let matches = [];

  const hideSuggestions = () => {
    suggestions.hidden = true;
    target.setAttribute('aria-expanded', 'false');
  };

  const showSuggestions = query => {
    matches = records.filter(entry => {
      const searchable = `${entry.name} ${entry.year} ${entry.note || ''} ${entry.place || ''}`.toLocaleLowerCase();
      return searchable.includes(query);
    }).slice(0, 8);
    if (!query || !matches.length) return hideSuggestions();
    suggestions.innerHTML = matches.map((entry, index) => `<button class="conference-correction-suggestion" type="button" role="option" data-index="${index}"><strong>${escapeHtml(entryLabel(entry))}</strong><span>${escapeHtml(entry.description || '')}${entry.place ? ` · ${escapeHtml(entry.place)}` : ''}</span></button>`).join('');
    suggestions.hidden = false;
    target.setAttribute('aria-expanded', 'true');
  };

  const chooseEntry = entry => {
    target.value = entryLabel(entry);
    populateEntry(form, entry);
    hideSuggestions();
    renderDuplicateWarning(form);
  };

  form.querySelectorAll('input[name="kind"]').forEach(radio => radio.addEventListener('change', () => {
    const correction = form.kind.value === 'correction';
    document.getElementById('correction-target-row').hidden = !correction;
    target.required = correction;
    renderDuplicateWarning(form);
  }));

  target.addEventListener('input', () => showSuggestions(target.value.trim().toLocaleLowerCase()));
  target.addEventListener('blur', () => window.setTimeout(hideSuggestions, 150));
  suggestions.addEventListener('click', event => {
    const button = event.target.closest('[data-index]');
    if (button) chooseEntry(matches[Number(button.dataset.index)]);
  });

  form.name.addEventListener('input', () => {
    inheritVenueKeys(form);
    renderDuplicateWarning(form);
  });
  form.year.addEventListener('input', () => renderDuplicateWarning(form));
  document.getElementById('conference-duplicate-warning').addEventListener('click', event => {
    if (!event.target.closest('#switch-to-correction')) return;
    const existing = recordsByEdition.get(editionKey(form.name.value, form.year.value))?.[0];
    if (!existing) return;
    form.kind.value = 'correction';
    document.getElementById('correction-target-row').hidden = false;
    target.required = true;
    chooseEntry(existing);
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    inheritVenueKeys(form);
    if (!form.reportValidity()) return;
    if (form.kind.value === 'new' && recordsByEdition.has(editionKey(form.name.value, form.year.value))) {
      renderDuplicateWarning(form);
      form.name.focus();
      return;
    }
    const submission = buildSubmission(form);
    const label = `${submission.entry.name} ${submission.entry.year}`;
    const content = buildConferenceSubmissionContent(submission);
    if (event.submitter?.value === 'github') {
      window.open(buildConferenceGithubIssueUrl(label, content), '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = buildConferenceEmailUrl(label, content);
    }
  });
}

async function init() {
  renderForm();
  try {
    const response = await fetch(new URL('./data/conferences.json', import.meta.url));
    if (!response.ok) throw new Error(`Conference data request failed (${response.status})`);
    records = await response.json();
    recordsByEdition = new Map();
    records.forEach(entry => {
      const key = editionKey(entry.name, entry.year);
      if (!recordsByEdition.has(key)) recordsByEdition.set(key, []);
      recordsByEdition.get(key).push(entry);
    });
    setupForm();
  } catch (error) {
    console.error('Failed to load conference schedules:', error);
    root.innerHTML = '<p class="load-error">Conference data could not be loaded. Please return to the schedule and try again.</p>';
  }
}

init();
