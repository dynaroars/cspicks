// Shared floating "back to top" button (styled by .back-to-top in roars-ui.css): shown once
// the page has scrolled past `threshold` pixels, smooth-scrolls to the top when clicked.
export function setupBackToTop(button: HTMLElement | null, threshold = 300) {
  if (!button) return;
  const sync = () => {
    button.hidden = window.scrollY <= threshold;
  };
  window.addEventListener('scroll', sync, { passive: true });
  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
