/** Explicitly open supporting UI before exercising it; the landing view stays compact. */
export async function openDetails(page, selector) {
  const details = page.locator(selector);
  if (!await details.count() || !await details.isVisible()) return;
  if (!await details.evaluate(element => element.open)) await details.locator(':scope > summary').click();
}
