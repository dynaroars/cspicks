// The floating green "+" that every page uses for "Add or update info". Profile pages pass their
// prefilled edit link; everything else opens the blank form.
export function renderAddFab(href: string, label = 'Add or update info'): string {
  return `<a class="add-fab" href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></a>`;
}
