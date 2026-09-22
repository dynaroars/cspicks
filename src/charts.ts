import {
  BarController, BarElement, CategoryScale, Chart, Filler, Legend,
  LinearScale, LineController, LineElement, PointElement, Tooltip
} from 'chart.js';
import type { ChartConfiguration, ChartItem } from 'chart.js';
import { updateChartDefaults } from './shared.js';

// Only bar/line charts with a linear+category axis, fill, tooltip, and legend
// are used anywhere in this app (see src/analysis/*.ts, src/compare-view.ts) —
// registering just those instead of `chart.js/auto` (which pulls in every
// controller/scale/plugin Chart.js ships) meaningfully shrinks the bundle.
Chart.register(
  BarController, BarElement, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Filler, Tooltip, Legend
);

// Single owner of Chart.js: defaults, light/dark reaction, and the
// destroy-before-redraw dance every page used to hand-roll.

updateChartDefaults(Chart);

const themeListeners = new Set<() => void>();

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
export function onThemeChange(listener: () => void) {
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
export function drawChart(target: string | ChartItem, previous: Chart | null, config: ChartConfiguration) {
  previous?.destroy();
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) return null;
  // Accepts a canvas, a canvas id, or an already-created 2D context.
  if (typeof target === 'string' && !(element instanceof HTMLCanvasElement)) return null;
  return new Chart(element as ChartItem, {
    ...config,
    options: { ...baseOptions, ...config.options }
  });
}

export { Chart };
