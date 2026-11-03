/**
 * Shared submission-form plumbing for CS Confs, Jobs, and Awards & Grants, modeled on VietProfs: "Add new"
 * starts as one free-text box (a link, a name, notes — anything), with an "Enter details directly"
 * toggle revealing the structured fields. "Edit existing" always uses the structured fields.
 * Each form wraps its structured fields in `#structured-fields` and renders `QUICK_SECTION` plus
 * `DELIVERY_BUTTONS`; this module owns the mode toggle, correction autocomplete, quick payload, and delivery step.
 */
import { escapeHtml } from './shared.js';
import { buildSubmissionContent } from './submission.js';
export const QUICK_SECTION = `
  <div class="submit-section" id="quick-section">
    <label for="quick">Links, names, or notes *</label>
    <textarea id="quick" name="quick" rows="6" required placeholder="Paste a link to the official page, a name, or just describe what you'd like to add or suggest. One item per line or free text is fine."></textarea>
    <p class="submit-help">Anything that helps us verify it. Have the full details instead? <button type="button" class="submit-link-button" id="quick-details-toggle">Enter them directly</button>.</p>
  </div>
  <p class="submit-help" id="quick-back" hidden><button type="button" class="submit-link-button" id="quick-back-button">← Back to quick entry (just a link or note)</button></p>`;

export const DELIVERY_BUTTONS = `
  <div class="submit-actions">
    <button type="submit" class="submit-button" name="delivery" value="email">Send by email</button>
    <button type="submit" class="submit-button submit-button-secondary" name="delivery" value="github">Submit as a GitHub issue</button>
  </div>
  <p class="submit-help">Email opens a pre-filled message and requires no account. GitHub opens a pre-filled issue. This site sends no data to a backend.</p>`;

const selectedKind = (form: HTMLFormElement) =>
  form.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value || 'new';

/** Wire the quick/detailed toggle. Call `apply()` whenever the kind radios change. */
export function setupQuickMode(form: HTMLFormElement) {
  let detailed = false;
  const toggle = form.querySelector<HTMLButtonElement>('#quick-details-toggle')!;

  const isQuick = () => selectedKind(form) === 'new' && !detailed;

  const apply = () => {
    const quick = isQuick();
    const structured = form.querySelector<HTMLElement>('#structured-fields')!;
    structured.hidden = quick;
    // Disabled controls are skipped by form validation, so hidden required fields can't block submit.
    structured.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select').forEach(el => { el.disabled = quick; });
    form.querySelector<HTMLElement>('#quick-section')!.hidden = !quick;
    const box = form.querySelector<HTMLTextAreaElement>('#quick')!;
    box.disabled = !quick;
    box.required = quick;
    form.querySelector<HTMLElement>('#quick-back')!.hidden = quick || selectedKind(form) !== 'new';
    return quick;
  };

  toggle.addEventListener('click', () => { detailed = true; apply(); });
  form.querySelector('#quick-back-button')!.addEventListener('click', () => { detailed = false; apply(); });
  return { isQuick, apply };
}

export const quickPayload = (form: HTMLFormElement) => ({
  type: 'new',
  notes: form.querySelector<HTMLTextAreaElement>('#quick')!.value.trim()
});

/** A label for the issue title / email subject: the first URL in the text, else a generic one. */
export const quickLabel = (form: HTMLFormElement) =>
  form.querySelector<HTMLTextAreaElement>('#quick')!.value.match(/https?:\/\/\S+/)?.[0] || 'new submission';

type Builder = (label: string, content: string) => string;

/** Open the GitHub issue or email draft for whichever delivery button was pressed. */
export function deliver(submitter: HTMLButtonElement | null, label: string, content: string, builders: { github: Builder; email: Builder }) {
  if (submitter?.value === 'github') {
    window.open(builders.github(label, content), '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = builders.email(label, content);
  }
}

export interface SubmissionFormOptions<T> {
  form: HTMLFormElement;
  suggestionsBox: HTMLElement;
  items: T[];
  getId: (item: T) => string;
  matches: (item: T, query: string) => boolean;
  suggestionTitle: (item: T) => string;
  suggestionDetail: (item: T) => string;
  targetInputValue: (item: T) => string;
  emptyText: string;
  prefill: (item: T) => void;
  getStructured: () => { label: string; submission: Record<string, unknown> };
  builders: { github: Builder; email: Builder };
}

/**
 * Shared controller for Jobs and Awards & Grants submission forms: wires the quick/detailed mode toggle,
 * correction-target autocomplete, outside-click dismissal, `?id=` / `?edit=` URL prefill, and form delivery.
 */
export function wireSubmissionForm<T>(options: SubmissionFormOptions<T>) {
  const { form, suggestionsBox } = options;
  const byId = new Map(options.items.map(item => [options.getId(item), item]));
  const targetRow = form.querySelector<HTMLElement>('#correction-target-row')!;
  const targetInput = form.querySelector<HTMLInputElement>('#target')!;
  const quick = setupQuickMode(form);
  quick.apply();

  form.querySelectorAll<HTMLInputElement>('input[name="kind"]').forEach(radio => {
    radio.addEventListener('change', () => {
      quick.apply();
      targetRow.hidden = radio.value !== 'correction';
      if (radio.value === 'correction') targetInput.focus();
    });
  });

  targetInput.addEventListener('input', () => {
    const query = targetInput.value.trim().toLowerCase();
    if (!query) {
      suggestionsBox.hidden = true;
      return;
    }
    const matches = options.items.filter(item => options.matches(item, query)).slice(0, 8);
    suggestionsBox.innerHTML = matches.length
      ? matches.map(item => `<button type="button" class="correction-suggestion" data-target-id="${escapeHtml(options.getId(item))}"><strong>${escapeHtml(options.suggestionTitle(item))}</strong><span>${escapeHtml(options.suggestionDetail(item))}</span></button>`).join('')
      : `<div style="padding: 0.6rem 0.85rem; color: var(--text-secondary); font-size: 0.82rem;">${escapeHtml(options.emptyText)}</div>`;
    suggestionsBox.hidden = false;
  });

  suggestionsBox.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-target-id]') : null;
    const item = button?.dataset.targetId ? byId.get(button.dataset.targetId) : undefined;
    if (!item) return;
    targetInput.value = options.targetInputValue(item);
    suggestionsBox.hidden = true;
    options.prefill(item);
  });

  document.addEventListener('click', event => {
    const target = event.target instanceof Node ? event.target : null;
    if (target && !targetInput.contains(target) && !suggestionsBox.contains(target)) {
      suggestionsBox.hidden = true;
    }
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    if (!form.reportValidity()) return;
    if (quick.isQuick()) {
      deliver(submitter, quickLabel(form), buildSubmissionContent(quickPayload(form)), options.builders);
      return;
    }
    const { label, submission } = options.getStructured();
    deliver(submitter, label, buildSubmissionContent(submission), options.builders);
  });

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || params.get('edit');
  const initial = id ? byId.get(id) : undefined;
  if (initial) {
    const radio = form.querySelector<HTMLInputElement>('input[name="kind"][value="correction"]');
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
    }
    targetInput.value = options.targetInputValue(initial);
    options.prefill(initial);
  }
}
