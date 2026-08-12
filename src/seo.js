// Keeps <title>, meta description, canonical link, and OpenGraph/Twitter tags
// in sync with the view a client-side route change puts on screen. GitHub
// Pages serves one static HTML file per page, so every page ships baseline
// tags for crawlers that don't run JS; this only sharpens them once real
// content (a school, a professor, a comparison) is on screen, so a shared
// link previews the thing it actually points to.

export const SITE_NAME = 'CS Picks';
export const SITE_ORIGIN = 'https://cspicks.roars.dev';
const DEFAULT_DESCRIPTION = 'Find the right CS PhD program and research advisor. Explore professors, universities, research strengths, publication trends, and NSF funding using open academic data.';

function setMeta(selector, attr, value, content) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, value);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setName(name, content) {
  setMeta(`meta[name="${name}"]`, 'name', name, content);
}

function setProperty(property, content) {
  setMeta(`meta[property="${property}"]`, 'property', property, content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Updates the page's title and metadata for the view currently on screen.
 *
 * title       — full <title> text, e.g. "George Mason University - CS Picks"
 * description — one or two sentences describing this specific view
 * path        — pathname + search to canonicalize, e.g. "/?q=George+Mason...".
 *               Defaults to the current location, so most callers can omit it.
 */
export function updatePageMeta({ title, description, path } = {}) {
  const safeDescription = description || DEFAULT_DESCRIPTION;
  if (title) document.title = title;
  setName('description', safeDescription);
  setProperty('og:title', title || document.title);
  setProperty('og:description', safeDescription);
  setName('twitter:title', title || document.title);
  setName('twitter:description', safeDescription);

  const url = `${SITE_ORIGIN}${path ?? (window.location.pathname + window.location.search)}`;
  setCanonical(url);
  setProperty('og:url', url);
}
