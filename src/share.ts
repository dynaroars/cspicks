// Shared "Copy link" action: the Web Share API's native sheet when the
// browser offers one (mostly mobile), a clipboard copy otherwise.
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The action itself, without a button attached - for callers that render
 * their share control as a plain templated `<button>` (e.g. one per card in
 * a big innerHTML block) and wire a single delegated listener instead of
 * constructing a DOM node per card. Returns what happened, so the caller can
 * give its own feedback (a title flip, a class toggle, etc).
 */
export async function shareUrl(url: string, { title, text }: { title?: string, text?: string } = {}) {
  if (navigator.share) {
    try {
      await navigator.share({ url, title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyToClipboard(url)) ? 'copied' : 'failed';
}
