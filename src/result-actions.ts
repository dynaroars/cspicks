import { copyToClipboard } from './share.js';
import { escapeHtml } from './shared.js';

/** Secondary actions share a quiet overflow menu; titles remain the primary destination. */
export function resultActions(label: string, actions: string, pageLink?: string) {
  return `<details class="result-actions"><summary aria-label="Actions for ${escapeHtml(label)}" title="More actions">⋯<span class="result-action-feedback" role="status"></span></summary><div class="result-actions-panel">${actions}${pageLink ? `<button type="button" data-copy-result-url="${escapeHtml(pageLink)}" aria-label="Copy link to ${escapeHtml(label)}">Copy link</button>` : ''}</div></details>`;
}

let wired = false;
export function initResultActions() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const copy = target?.closest<HTMLButtonElement>('[data-copy-result-url]');
    if (copy?.dataset.copyResultUrl) {
      const feedback = copy.closest('.result-actions')?.querySelector('.result-action-feedback');
      void copyToClipboard(new URL(copy.dataset.copyResultUrl, location.href).href).then(copied => {
        if (feedback) {
          feedback.textContent = copied ? 'Link copied' : 'Could not copy link';
          window.setTimeout(() => { feedback.textContent = ''; }, 2000);
        }
      });
    }
    document.querySelectorAll<HTMLDetailsElement>('.result-actions[open], #favorites-actions[open]').forEach(menu => {
      if (!menu.contains(target) || target?.closest('a, button')) menu.open = false;
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll<HTMLDetailsElement>('.result-actions[open], #favorites-actions[open]').forEach(menu => {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    });
  });
}
