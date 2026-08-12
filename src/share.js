// A small, reusable "Copy link" control shared by every page: the Web Share
// API's native sheet when the browser offers one (mostly mobile), a clipboard
// copy otherwise. Callers pass functions rather than fixed strings because the
// current URL/title can change after the button is created (a filter change,
// a different selected card) without the button being rebuilt.
import { escapeHtml } from './shared.js';

const shareIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';

function resolve(value, fallback) {
  if (typeof value === 'function') return value();
  return value ?? fallback;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function flash(button, message) {
  const label = button.querySelector('.share-button-label');
  if (!label) return;
  const original = label.dataset.defaultLabel || label.textContent;
  label.dataset.defaultLabel = original;
  label.textContent = message;
  button.classList.add('is-flashed');
  clearTimeout(button._flashTimer);
  button._flashTimer = setTimeout(() => {
    label.textContent = original;
    button.classList.remove('is-flashed');
  }, 1800);
}

/**
 * The action itself, without a button attached - for callers that render
 * their share control as a plain templated `<button>` (e.g. one per card in
 * a big innerHTML block) and wire a single delegated listener instead of
 * constructing a DOM node per card. Returns what happened, so the caller can
 * give its own feedback (a title flip, a class toggle, etc).
 */
export async function shareUrl(url, { title, text } = {}) {
  if (navigator.share) {
    try {
      await navigator.share({ url, title, text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyToClipboard(url)) ? 'copied' : 'failed';
}

/**
 * getUrl/getTitle/getText: string or () => string, evaluated at click time.
 * label: visible text next to the icon ('Copy link' by default; pass '' for
 * an icon-only button, e.g. inside a dense card header).
 */
export function createShareButton({ getUrl, getTitle, getText, label = 'Copy link', className = '' } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `share-button ${className}`.trim();
  button.setAttribute('aria-label', label ? `${label} to this view` : 'Copy link to this view');
  button.title = 'Copy link';
  button.innerHTML = `${shareIcon}${label ? `<span class="share-button-label">${escapeHtml(label)}</span>` : ''}`;

  button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    const outcome = await shareUrl(resolve(getUrl, window.location.href), {
      title: resolve(getTitle, document.title),
      text: resolve(getText)
    });
    if (outcome === 'copied') flash(button, 'Copied!');
    else if (outcome === 'failed') flash(button, 'Copy failed');
  });

  return button;
}

/** Mounts a share button into `container` (an element or selector), replacing any previous one. */
export function mountShareButton(container, options) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return null;
  el.innerHTML = '';
  const button = createShareButton(options);
  el.appendChild(button);
  return button;
}
