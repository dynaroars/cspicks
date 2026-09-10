import { onThemeChange } from './charts.js';
import { buildComparison, renderAreaComparison, renderComparisonChart, renderComparisonNotice, renderComparisonSummary } from './compare-view.js';
import { compareAreas, compareConferences } from './metrics.js';
import { findMatchingArea, findMatchingConference } from './search-results.js';
import { areaLabels, cleanName, getConferenceLabel } from './shared.js';
import type { Chart } from 'chart.js';
import type { AnalysisTarget } from './analysis/state.js';
import type { ComparisonEntry } from './compare-view.js';
import type { FilteredData } from './types.js';

type ComparisonTarget = AnalysisTarget | { type: 'area' | 'conference', name: string };

export interface ResolvedComparison {
  left: string;
  right: string;
  a: ComparisonTarget | null;
  b: ComparisonTarget | null;
}

interface ComparisonContext {
  readonly appData: FilteredData;
  readonly priorAppData: FilteredData;
  resolveTarget: (term: string) => AnalysisTarget | null;
}

// "CMU vs MIT" — head-to-head mode for the Search page. The page injects its
// filtered data and target resolver; everything else lives here.
const COMPARISON_SEPARATOR = /\s+(?:vs\.?|versus)\s+/i;

let ctx: ComparisonContext = null!;
let comparisonChart: Chart | null = null;
let activeComparison: ResolvedComparison | null = null;

export function initComparison(context: ComparisonContext) {
  ctx = context;
}

export function isComparing() {
  return Boolean(activeComparison);
}

// 'school' | 'researcher' | 'area' | null - for analytics only, so callers
// don't need to keep a second copy of the active comparison's shape.
export function activeComparisonType() {
  return activeComparison?.a?.type || null;
}

onThemeChange(() => {
  if (activeComparison) renderComparison(activeComparison);
});

export function splitComparisonQuery(value: string) {
  const match = value.match(/^(.*\s+(?:vs\.?|versus)\s+)(.*)$/i);
  return match ? { prefix: match[1]!, term: match[2]! } : { prefix: '', term: value };
}

export function parseComparisonQuery(query: string) {
  const parts = (query || '').split(COMPARISON_SEPARATOR);
  if (parts.length !== 2) return null;
  const [left, right] = parts.map(part => part.trim());
  return left && right ? { left, right } : null;
}

// Schools and professors take priority; a term only resolves to a venue or an
// area once neither of those matches, so "PLDI vs ICSE" and "Systems vs
// Databases" behave like any other comparison without a new syntax to learn.
// Venues are checked before areas because a few venue names ("Logic and
// Verification") would otherwise be swallowed by an area prefix match.
function resolveComparisonTarget(term: string): ComparisonTarget | null {
  const target = ctx.resolveTarget(term);
  if (target) return target;
  const conference = findMatchingConference(term.trim());
  if (conference) return { type: 'conference', name: conference };
  const area = findMatchingArea(term.trim());
  return area ? { type: 'area', name: area } : null;
}

export function resolveComparison(query: string): ResolvedComparison | null {
  const parsed = parseComparisonQuery(query);
  if (!parsed) return null;
  return {
    ...parsed,
    a: resolveComparisonTarget(parsed.left),
    b: resolveComparisonTarget(parsed.right)
  };
}

export function hideComparison() {
  activeComparison = null;
  comparisonChart?.destroy();
  comparisonChart = null;
  const section = document.getElementById('comparison-results');
  if (!section) return;
  section.hidden = true;
  document.getElementById('comparison-chart-container')!.hidden = true;
  document.getElementById('comparison-summary')!.innerHTML = '';
}

function displayName(target: ComparisonTarget) {
  if (target.type === 'researcher') return cleanName(target.name);
  if (target.type === 'area') return areaLabels[target.name] || target.name;
  if (target.type === 'conference') return getConferenceLabel(target.name);
  return target.name;
}

export function renderComparison(comparison: ResolvedComparison) {
  const section = document.getElementById('comparison-results');
  if (!section) return;

  activeComparison = comparison;
  const { a, b, left, right } = comparison;
  const summary = document.getElementById('comparison-summary')!;
  const chartBox = document.getElementById('comparison-chart-container')!;
  section.hidden = false;
  chartBox.hidden = true;
  document.getElementById('comparison-title')!.textContent = `${left} vs ${right}`;

  if (!a || !b) {
    const missing = !a ? left : right;
    renderComparisonNotice(summary, 'No match found',
      `Could not match "${missing}" to a university, professor, research area, or conference. Use the full name, for example "Carnegie Mellon University vs Massachusetts Inst. of Technology".`);
    return;
  }
  if (a.type !== b.type) {
    renderComparisonNotice(summary, 'Mixed comparison',
      'Compare two universities, two professors, two research areas, or two conferences — not a mix.');
    return;
  }
  if (a.name === b.name) {
    renderComparisonNotice(summary, 'Identical selection',
      'Pick two different targets to generate a head-to-head comparison.');
    return;
  }

  if (a.type === 'area' || a.type === 'conference') {
    const nameA = displayName(a);
    const nameB = displayName(b);
    document.getElementById('comparison-title')!.textContent = `${nameA} vs ${nameB}`;
    const isConference = a.type === 'conference';
    const cmp = isConference
      ? compareConferences(ctx.appData, ctx.priorAppData, a.name, b.name)
      : compareAreas(ctx.appData, ctx.priorAppData, a.name, b.name);
    renderAreaComparison(summary, {
      labelA: nameA, labelB: nameB, cmp, noun: isConference ? 'venues' : 'fields'
    });
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

  document.getElementById('comparison-title')!.textContent = `${nameA} vs ${nameB}`;
  const comparisonEntryA: ComparisonEntry = entryA;
  const comparisonEntryB: ComparisonEntry = entryB;
  const data = buildComparison(comparisonEntryA, comparisonEntryB);
  chartBox.hidden = false;
  comparisonChart = renderComparisonChart(document.querySelector<HTMLCanvasElement>('#comparisonChart')!, comparisonChart, { ...data, nameA, nameB });
  renderComparisonSummary(summary, { ...data, type: a.type, nameA, nameB, entryA: comparisonEntryA, entryB: comparisonEntryB });
}
