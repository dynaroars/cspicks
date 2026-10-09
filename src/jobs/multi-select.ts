/**
 * Checkbox dropdown for a filter that accepts several values. It enhances a
 * `<details class="multi-select"><summary>All …</summary></details>` from the page,
 * keeping the summary text ("All States") as the label shown when nothing is chosen.
 */
import { escapeHtml } from '../shared.js';

export interface MultiSelect {
  values: () => string[];
  setValues: (values: string[]) => void;
  toggle: (value: string) => void;
}

interface MultiSelectOptions {
  /** Accessible name of the control, e.g. "Position type". */
  label: string;
  /** Count phrase for several choices, e.g. "position types" → "2 position types". */
  plural: string;
  options: Array<[string, string]>;
  onChange: () => void;
}

export function createMultiSelect(root: HTMLDetailsElement, { label, plural, options, onChange }: MultiSelectOptions): MultiSelect {
  const summary = root.querySelector('summary')!;
  const allText = summary.textContent?.trim() || `All ${plural}`;
  const labels = new Map(options);
  summary.innerHTML = `<span class="multi-select-text">${escapeHtml(allText)}</span>`;
  root.insertAdjacentHTML('beforeend', `<div class="multi-select-panel" role="group" aria-label="${escapeHtml(label)}">
    <button type="button" class="multi-select-clear">Clear</button>
    ${options.map(([value, text]) => `<label class="multi-select-option"><input type="checkbox" value="${escapeHtml(value)}"> ${escapeHtml(text)}</label>`).join('')}
  </div>`);
  const boxes = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const text = summary.querySelector('.multi-select-text')!;

  const values = () => boxes.filter(box => box.checked).map(box => box.value);
  function refresh() {
    const chosen = values();
    text.textContent = !chosen.length ? allText : chosen.length === 1 ? labels.get(chosen[0]!) || chosen[0]! : `${chosen.length} ${plural}`;
    summary.setAttribute('aria-label', `${label}: ${chosen.length ? chosen.map(value => labels.get(value) || value).join(', ') : allText}`);
    root.classList.toggle('has-selection', chosen.length > 0);
  }
  function setValues(next: string[]) {
    const wanted = new Set(next);
    boxes.forEach(box => { box.checked = wanted.has(box.value); });
    refresh();
  }

  // Keep the panel on screen when its dropdown sits near the right edge (narrow phones).
  const panel = root.querySelector<HTMLElement>('.multi-select-panel')!;
  root.addEventListener('toggle', () => {
    panel.style.left = '';
    if (!root.open) return;
    const overflow = panel.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
    if (overflow > 0) panel.style.left = `${-overflow}px`;
  });
  root.addEventListener('change', () => { refresh(); onChange(); });
  root.querySelector('.multi-select-clear')!.addEventListener('click', () => {
    setValues([]);
    onChange();
  });
  document.addEventListener('click', event => {
    if (root.open && event.target instanceof Node && !root.contains(event.target)) root.open = false;
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !root.open) return;
    root.open = false;
    summary.focus();
  });
  refresh();

  return {
    values,
    setValues,
    toggle: value => setValues(values().includes(value) ? values().filter(entry => entry !== value) : [...values(), value])
  };
}

/** The same interface without a dropdown, for a filter picked elsewhere (the jobs page's state map). */
export function createSelection(): MultiSelect {
  let chosen: string[] = [];
  return {
    values: () => [...chosen],
    setValues: values => { chosen = [...new Set(values)]; },
    toggle: value => { chosen = chosen.includes(value) ? chosen.filter(entry => entry !== value) : [...chosen, value]; }
  };
}
