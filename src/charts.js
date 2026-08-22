import Chart from 'chart.js/auto';
import { updateChartDefaults } from './shared.js';

// Single owner of Chart.js: defaults, light/dark reaction, and the
// destroy-before-redraw dance every page used to hand-roll.

updateChartDefaults(Chart);

const themeListeners = new Set();

const colorSchemeQuery = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

if (colorSchemeQuery) {
  const handleThemeChange = () => {
    updateChartDefaults(Chart);
    themeListeners.forEach(listener => listener());
  };
  if (colorSchemeQuery.addEventListener) {
    colorSchemeQuery.addEventListener('change', handleThemeChange);
  } else if (colorSchemeQuery.addListener) {
    colorSchemeQuery.addListener(handleThemeChange);
  }
}

/** Re-renders charts when the user switches between light and dark. */
export function onThemeChange(listener) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

const baseOptions = {
  devicePixelRatio: 2,
  responsive: true,
  maintainAspectRatio: false
};

/**
 * Draws `config` into `canvas`, destroying `previous` first. Options are merged
 * one level deep onto the shared defaults, so callers only state what makes
 * their chart different.
 */
export function drawChart(target, previous, config) {
  previous?.destroy();
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) return null;
  // Accepts a canvas, a canvas id, or an already-created 2D context.
  const context = typeof element.getContext === 'function' ? element.getContext('2d') : element;
  return new Chart(context, {
    ...config,
    options: { ...baseOptions, ...config.options }
  });
}

export { Chart };
