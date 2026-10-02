/**
 * Shared submission-form plumbing for CS Confs and Awards & Grants, modeled on VietProfs: "Add new"
 * starts as one free-text box (a link, a name, notes — anything), with an "Enter details directly"
 * toggle revealing the structured fields. "Edit existing" always uses the structured fields.
 * Each form wraps its structured fields in `#structured-fields` and renders `QUICK_SECTION` plus
 * `DELIVERY_BUTTONS`; this module owns the mode toggle, the quick payload and the delivery step.
 */
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
