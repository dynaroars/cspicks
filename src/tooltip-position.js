// Keeps every `.tooltip-trigger` panel pinned to its own ⓘ instead of to whatever
// ancestor happens to be positioned. The panel is measured on open and placed with
// fixed coordinates, so it stays beside the icon, escapes clipping ancestors, and
// is nudged back on screen (arrow following the icon) when it would overflow.

const GAP = 8;          // space between the icon and the panel
const EDGE = 8;         // minimum distance from the viewport edge
const ARROW_INSET = 12; // keeps the arrow inside the panel's rounded corners

let activeTrigger = null;
let frame = 0;

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function panelOf(trigger) {
  return trigger.querySelector(':scope > .tooltip-content');
}

function reset(panel) {
  panel.style.position = 'fixed';
  panel.style.left = '0px';
  panel.style.top = '0px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.transform = 'none';
  panel.style.margin = '0';
  panel.style.maxWidth = `${Math.max(window.innerWidth - EDGE * 2, 0)}px`;
}

function clear(panel) {
  panel.classList.remove('tooltip-below');
  panel.style.removeProperty('--tip-arrow-x');
  for (const prop of ['position', 'left', 'top', 'right', 'bottom', 'transform', 'margin', 'max-width']) {
    panel.style.removeProperty(prop);
  }
}

function place(trigger) {
  const panel = panelOf(trigger);
  if (!panel) return;

  reset(panel);
  const icon = trigger.getBoundingClientRect();
  const { width, height } = panel.getBoundingClientRect();

  const left = clamp(icon.left + icon.width / 2 - width / 2, EDGE, window.innerWidth - width - EDGE);
  const above = icon.top - GAP - height;
  const below = above < EDGE;
  const top = below ? icon.bottom + GAP : above;

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.classList.toggle('tooltip-below', below);
  const arrowX = clamp(icon.left + icon.width / 2 - left, ARROW_INSET, Math.max(width - ARROW_INSET, ARROW_INSET));
  panel.style.setProperty('--tip-arrow-x', `${Math.round(arrowX)}px`);
}

function open(trigger) {
  if (activeTrigger === trigger) return;
  if (activeTrigger) close(activeTrigger);
  activeTrigger = trigger;
  place(trigger);
}

function close(trigger) {
  const panel = panelOf(trigger);
  if (panel) clear(panel);
  if (activeTrigger === trigger) activeTrigger = null;
}

function reposition() {
  if (!activeTrigger || frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!activeTrigger) return;
    if (!activeTrigger.isConnected) {
      activeTrigger = null;
      return;
    }
    place(activeTrigger);
  });
}

export function initTooltipPositioning() {
  if (typeof document === 'undefined' || document.body?.dataset.tooltipPositioning === 'on') return;
  if (document.body) document.body.dataset.tooltipPositioning = 'on';

  document.addEventListener('pointerover', event => {
    const trigger = event.target.closest?.('.tooltip-trigger');
    if (trigger) open(trigger);
    else if (activeTrigger && !activeTrigger.contains(event.target)) close(activeTrigger);
  });

  document.addEventListener('pointerout', event => {
    const trigger = event.target.closest?.('.tooltip-trigger');
    if (!trigger || trigger !== activeTrigger) return;
    if (trigger.contains(event.relatedTarget)) return;
    if (trigger.matches(':focus-within')) return;
    close(trigger);
  });

  document.addEventListener('focusin', event => {
    const trigger = event.target.closest?.('.tooltip-trigger');
    if (trigger) open(trigger);
  });

  document.addEventListener('focusout', event => {
    const trigger = event.target.closest?.('.tooltip-trigger');
    if (!trigger || trigger !== activeTrigger) return;
    if (trigger.contains(event.relatedTarget)) return;
    if (trigger.matches(':hover')) return;
    close(trigger);
  });

  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
}
