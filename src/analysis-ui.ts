import { escapeHtml } from './shared.js';

export interface MetricCard {
  label: string;
  value: string | number;
  help?: string;
  className?: string;
  detail?: string;
}

function metricLabel(label: string, help?: string) {
  if (!help) return `<span>${escapeHtml(label)}</span>`;
  return `<span class="metric-label-row">
    <span class="metric-label">${escapeHtml(label)}</span>
    <span class="tooltip-trigger metric-info" tabindex="0" aria-label="About ${escapeHtml(label)}">ⓘ
      <span class="tooltip-content">${escapeHtml(help)}</span>
    </span>
  </span>`;
}

export function renderMetricCards(metrics: MetricCard[], ariaLabel = 'Statistics') {
  return `<div class="school-metrics analysis-school-metrics" aria-label="${escapeHtml(ariaLabel)}">
    ${metrics.map(metric => `<div class="school-metric">
      ${metricLabel(metric.label, metric.help)}
      <strong${metric.className ? ` class="${escapeHtml(metric.className)}"` : ''}>${escapeHtml(metric.value)}</strong>
      ${metric.detail ? `<small>${escapeHtml(metric.detail)}</small>` : ''}
    </div>`).join('')}
  </div>`;
}

export function renderInsightList(insights: string[] | null | undefined, title = 'Notable patterns') {
  if (!insights?.length) return '';
  return `<section class="analysis-insights">
    <h3>${escapeHtml(title)}</h3>
    <ul>${insights.map(insight => `<li>${escapeHtml(insight)}</li>`).join('')}</ul>
  </section>`;
}
