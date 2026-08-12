// Privacy-conscious, opt-in usage tracking. Every call here is a safe no-op
// until a site owner actually enables an analytics script (see README's
// "Analytics" section) - nothing in this file talks to a network on its own,
// and it never runs at all if the visitor has Do Not Track set.
//
// Designed for Plausible (plausible.io or self-hosted): its script exposes a
// window.plausible(eventName, { props }) function once loaded from a <script>
// tag with a real data-domain, which is the one piece this file cannot supply
// - that requires an account. GoatCounter or another cookie-free, GDPR-
// friendly tool would need only the calls below adjusted to its API.
//
// What gets tracked and why: page views by view type (so "popular university
// pages" and "popular research fields" are answerable without logging every
// query string verbatim), comparison usage, and Discoveries card shares -
// matching exactly the questions in the README's Analytics section, nothing
// broader.

function doNotTrack() {
  return typeof navigator !== 'undefined'
    && (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1');
}

function track(eventName, props) {
  if (typeof window === 'undefined' || typeof window.plausible !== 'function') return;
  if (doNotTrack()) return;
  window.plausible(eventName, props ? { props } : undefined);
}

/** kind: 'school' | 'researcher' | 'area' | 'conference' | 'comparison' | 'default' */
export function trackView(kind, page = 'search') {
  track('View', { page, kind });
}

export function trackComparison(entityType, page = 'search') {
  track('Comparison', { page, type: entityType });
}

export function trackDiscoveryShare(cardId) {
  track('Discovery Share', { card: cardId });
}

export function trackShare(page) {
  track('Share', { page });
}
