import { areaLabels, escapeHtml } from '../shared.js';

type AreaDelta = number | {
  delta?: number;
  dropped?: boolean;
  entered?: boolean;
  wasRank?: number;
  nowRank?: number;
};

export interface CandidateResult {
  name: string;
  error?: string | null;
  stats?: {
    totalAdjusted: number;
    totalPapers: number;
    totalDblpPublications?: number;
    areas: Record<string, number | { count: number, adjusted: number }>;
    papers: Array<{ venue: string, year: number, count?: number, adjusted: number }>;
    aliases?: string[];
  };
  rankDelta?: number | null;
  currentRank?: number | null;
  newRank?: number | null;
  areaDeltas?: Record<string, AreaDelta>;
  isRemoval?: boolean;
  usedCSRankings?: boolean;
  sourceSchool?: { name: string, delta: number | null } | null;
}

// Under Per capita, a department can sit on either side of the 5-faculty
// minimum before or after the hypothetical change, so either rank can be
// unavailable rather than a number — shown plainly instead of guessed at.
function rankMoveLabel(before: number | null | undefined, after: number | null | undefined, deltaText: string) {
  const label = rank => rank == null ? 'not ranked' : `#${rank}`;
  return `${label(before)} → ${label(after)} (${deltaText})`;
}

export function renderCandidateResults(candidates: CandidateResult[]) {
  const medals = ['🥇', '🥈', '🥉'];

  return candidates.map((c, i) => {
    if (c.error) {
      return `
        <div class="candidate-card">
          <div class="candidate-header">
            <span class="candidate-medal">❌</span>
            <div class="candidate-info">
              <div class="candidate-name">${escapeHtml(c.name)}</div>
              <div class="candidate-stats candidate-stats-error">${escapeHtml(c.error)}</div>
            </div>
          </div>
        </div>
      `;
    }

    const medal = i < 3 ? medals[i] : `#${i + 1}`;
    const deltaClass = c.rankDelta == null ? 'neutral' : c.rankDelta > 0 ? 'positive' : (c.rankDelta < 0 ? 'negative' : 'neutral');
    const deltaText = c.rankDelta == null ? 'n/a' : c.rankDelta > 0 ? `+${c.rankDelta}` : (c.rankDelta < 0 ? `${c.rankDelta}` : '±0');

    let actionLabel = '';
    if (c.isRemoval) {
      actionLabel = '<span class="candidate-action-remove">Removing</span>';
    } else if (c.sourceSchool) {
      actionLabel = `<span class="candidate-action-transfer">from ${escapeHtml(c.sourceSchool.name)}</span>`;
    }

    let dataSourceBadge = '';
    if (c.usedCSRankings) {
      dataSourceBadge = '<span class="candidate-badge-roster">Roster</span>';
    }

    let sourceImpactHtml = '';
    if (c.sourceSchool) {
      const sDelta = c.sourceSchool.delta;
      const sClass = sDelta > 0 ? 'positive' : (sDelta < 0 ? 'negative' : 'neutral');
      const sText = sDelta > 0 ? `+${sDelta}` : (sDelta < 0 ? `${sDelta}` : '±0');
      sourceImpactHtml = `
          <div class="candidate-source-impact">
             <span>${escapeHtml(c.sourceSchool.name)}:</span>
             <span class="${sClass}" style="font-weight: 600;">${sText} ranks</span>
          </div>
      `;
    }

    const papersHtml = c.stats.papers.slice(0, 20).map(p => {
      const countLabel = (p.count || 0) > 1 ? `${Math.round(p.count || 0)} papers` : '1 paper';
      return `
      <div class="paper-item">
        <span class="paper-venue">${escapeHtml(p.venue)}</span>
        <span class="paper-year">${p.year}</span>:
        ${countLabel} <small>· ${p.adjusted.toFixed(2)} adjusted</small>
      </div>
    `;
    }).join('');

    const countedPaperLabel = `${c.stats.totalPapers} rank-counted ${c.stats.totalPapers === 1 ? 'paper' : 'papers'}`;
    const paperSummary = Number.isFinite(c.stats.totalDblpPublications)
      ? `${countedPaperLabel} of ${c.stats.totalDblpPublications} DBLP publications in the selected years`
      : `${c.stats.totalPapers} ${c.stats.totalPapers === 1 ? 'paper' : 'papers'}`;

    // Show all areas the candidate publishes in, with rank delta for each
    const allAreas = Object.keys(c.stats.areas);
    const areaDeltaEntries = allAreas
      .map(area => {
        let d = (c.areaDeltas || {})[area];
        if (d === undefined) d = { delta: 0 };
        return [area, d] as [string, AreaDelta];
      })
      .sort(([, a], [, b]) => {
        const getVal = (x: AreaDelta) => {
          if (typeof x === 'number') return Math.abs(x);
          if (x && (x.dropped || x.entered)) return 1000;
          if (x && x.delta !== undefined) return Math.abs(x.delta);
          return 0;
        };
        return getVal(b) - getVal(a);
      });

    const areaPillsHtml = areaDeltaEntries.length > 0 ? `
      <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px;">
        ${areaDeltaEntries.map(([area, d]) => {
      const label = escapeHtml(areaLabels[area] || area);
      if (typeof d !== 'number' && d.dropped) {
        return `<span class="area-pill negative">↓ ${label} (Unranked - was #${d.wasRank})</span>`;
      }
      if (typeof d !== 'number' && d.entered) {
        return `<span class="area-pill positive">↑ ${label} +New (→ #${d.nowRank})</span>`;
      }

      const deltaVal = typeof d === 'number' ? d : (d.delta || 0);
      const nowRank = typeof d === 'number' ? null : (d.nowRank ?? null);

      if (deltaVal === 0) {
        return `<span class="area-pill neutral">${label} ±0${nowRank ? ` (#${nowRank})` : ''}</span>`;
      }
      const arrow = deltaVal > 0 ? '↑' : '↓';
      const sign = deltaVal > 0 ? '+' : '';
      const cls = deltaVal > 0 ? 'positive' : 'negative';
      return `<span class="area-pill ${cls}">${arrow} ${label} ${sign}${deltaVal} (→ #${nowRank})</span>`;
    }).join('')}
      </div>
    ` : '';


    return `
      <div class="candidate-card">
        <div class="candidate-header">
          <span class="candidate-medal">${medal}</span>
          <div class="candidate-info">
            <div class="candidate-name">
              ${escapeHtml(c.name)}
              ${actionLabel}
              ${dataSourceBadge}
            </div>
            <div class="candidate-stats">${Object.keys(c.stats.areas).length} areas, ${paperSummary}, ${c.stats.totalAdjusted.toFixed(1)} adjusted</div>
            <div class="candidate-area-breakdown">
              ${Object.entries(c.stats.areas)
        .sort(([, a], [, b]) => {
          const aCount = typeof a === 'number' ? a : a.count;
          const bCount = typeof b === 'number' ? b : b.count;
          return bCount - aCount;
        })
        .map(([area, areaStats]) => {
          const count = typeof areaStats === 'number' ? Math.ceil(areaStats) : (areaStats.count || 0);
          const adj = typeof areaStats === 'number' ? areaStats : (areaStats.adjusted || 0);
          const label = escapeHtml(areaLabels[area] || area);
          return `<span class="area-breakdown-tag">${label} <strong>(${count} ${count === 1 ? 'paper' : 'papers'})</strong></span>`;
        }).join('')}
            </div>
            ${areaPillsHtml}
          </div>
          <div class="candidate-impact">
            <div class="candidate-rank-delta ${deltaClass}">${rankMoveLabel(c.currentRank, c.newRank, deltaText)}</div>
            ${sourceImpactHtml}
          </div>
        </div>
        <button class="papers-toggle">▶ Show Papers</button>
        <div class="papers-list">
          ${papersHtml || '<div class="paper-item">No counted papers</div>'}
        </div>
      </div>
    `;

  }).join('');
}
