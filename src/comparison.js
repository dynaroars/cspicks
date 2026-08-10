import { onThemeChange } from './charts.js';
import { buildComparison, renderComparisonChart, renderComparisonNotice, renderComparisonSummary } from './compare-view.js';
import { cleanName } from './shared.js';

// "CMU vs MIT" — head-to-head mode for the Search page. The page injects its
// filtered data and target resolver; everything else lives here.
const COMPARISON_SEPARATOR = /\s+(?:vs\.?|versus)\s+/i;

let ctx = null;
let comparisonChart = null;
let activeComparison = null;

export function initComparison(context) {
  ctx = context;
}

export function isComparing() {
  return Boolean(activeComparison);
}

onThemeChange(() => {
  if (activeComparison) renderComparison(activeComparison);
});

export function splitComparisonQuery(value) {
  const match = value.match(/^(.*\s+(?:vs\.?|versus)\s+)(.*)$/i);
  return match ? { prefix: match[1], term: match[2] } : { prefix: '', term: value };
}

export function parseComparisonQuery(query) {
  const parts = (query || '').split(COMPARISON_SEPARATOR);
  if (parts.length !== 2) return null;
  const [left, right] = parts.map(part => part.trim());
  return left && right ? { left, right } : null;
}

export function resolveComparison(query) {
  const parsed = parseComparisonQuery(query);
  if (!parsed) return null;
  return {
    ...parsed,
    a: ctx.resolveTarget(parsed.left),
    b: ctx.resolveTarget(parsed.right)
  };
}

export function hideComparison() {
  activeComparison = null;
  comparisonChart?.destroy();
  comparisonChart = null;
  const section = document.getElementById('comparison-results');
  if (!section) return;
  section.hidden = true;
  document.getElementById('comparison-chart-container').hidden = true;
  document.getElementById('comparison-summary').innerHTML = '';
}

function displayName(target) {
  return target.type === 'researcher' ? cleanName(target.name) : target.name;
}

export function renderComparison(comparison) {
  const section = document.getElementById('comparison-results');
  if (!section) return;

  activeComparison = comparison;
  const { a, b, left, right } = comparison;
  const summary = document.getElementById('comparison-summary');
  const chartBox = document.getElementById('comparison-chart-container');
  section.hidden = false;
  chartBox.hidden = true;
  document.getElementById('comparison-title').textContent = `${left} vs ${right}`;

  if (!a || !b) {
    const missing = !a ? left : right;
    renderComparisonNotice(summary, 'No match found',
      `Could not match "${missing}" to a university or professor. Use the full name, for example "Carnegie Mellon University vs Massachusetts Inst. of Technology".`);
    return;
  }
  if (a.type !== b.type) {
    renderComparisonNotice(summary, 'Mixed comparison',
      'Compare two universities or two professors — not one of each.');
    return;
  }
  if (a.name === b.name) {
    renderComparisonNotice(summary, 'Identical selection',
      'Pick two different targets to generate a head-to-head comparison.');
    return;
  }

  const entries = a.type === 'school' ? ctx.appData.schools : ctx.appData.professors;
  const entryA = entries[a.name];
  const entryB = entries[b.name];
  const nameA = displayName(a);
  const nameB = displayName(b);
  if (!entryA || !entryB) {
    const missing = entryA ? nameB : nameA;
    renderComparisonNotice(summary, 'No publications in this range',
      `${missing} has no eligible publications for the selected years, region, and conference set.`);
    return;
  }

  document.getElementById('comparison-title').textContent = `${nameA} vs ${nameB}`;
  const data = buildComparison(entryA, entryB);
  chartBox.hidden = false;
  comparisonChart = renderComparisonChart(document.getElementById('comparisonChart'), comparisonChart, { ...data, nameA, nameB });
  renderComparisonSummary(summary, { ...data, type: a.type, nameA, nameB, entryA, entryB });
}
