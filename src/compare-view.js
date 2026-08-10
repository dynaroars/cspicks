import { drawChart } from './charts.js';
import { areaLabels, escapeHtml } from './shared.js';
import { explainRankGap } from './metrics.js';

export const compareColors = {
    a: { fill: 'rgba(37, 99, 235, 0.7)', line: 'rgba(37, 99, 235, 1)' },
    b: { fill: 'rgba(16, 185, 129, 0.7)', line: 'rgba(16, 185, 129, 1)' }
};

// Areas ordered by combined weight, so the biggest differences sit at the top of the chart.
export function buildComparison(entryA, entryB) {
    const allAreas = new Set([...Object.keys(entryA.areas || {}), ...Object.keys(entryB.areas || {})]);
    const areaList = Array.from(allAreas).sort((a, b) => {
        const totalA = (entryA.areas[a]?.adjusted || 0) + (entryB.areas[a]?.adjusted || 0);
        const totalB = (entryA.areas[b]?.adjusted || 0) + (entryB.areas[b]?.adjusted || 0);
        return totalB - totalA;
    });

    return {
        areaList,
        labels: areaList.map(area => areaLabels[area] || area),
        dataA: areaList.map(area => entryA.areas[area]?.adjusted || 0),
        dataB: areaList.map(area => entryB.areas[area]?.adjusted || 0)
    };
}

export function renderComparisonChart(canvas, previous, { labels, dataA, dataB, nameA, nameB }) {
    return drawChart(canvas, previous, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: nameA,
                    data: dataA,
                    backgroundColor: compareColors.a.fill,
                    borderColor: compareColors.a.line,
                    borderWidth: 1
                },
                {
                    label: nameB,
                    data: dataB,
                    backgroundColor: compareColors.b.fill,
                    borderColor: compareColors.b.line,
                    borderWidth: 1
                }
            ]
        },
        options: {
            indexAxis: 'y',
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    position: 'nearest',
                    xAlign: 'left',
                    yAlign: 'center',
                    caretSize: 0,
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.parsed.x.toFixed(1)} adjusted`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Adjusted Publication Count'
                    }
                }
            }
        }
    });
}

export const compareNumber = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

/**
 * A head-to-head table of two entities. Each row is
 * `{ label, a, b, format, lowerWins }`; the better of two numeric values is
 * marked, and non-numeric rows (an affiliation, say) are shown without a winner.
 */
export function renderScoreboard(safeNameA, safeNameB, rows) {
  const cell = (row, side) => {
    const value = row[side];
    const other = row[side === 'a' ? 'b' : 'a'];
    const wins = Number.isFinite(value) && Number.isFinite(other)
      && (row.lowerWins ? value < other : value > other);
    return `<td class="comparison-side-${side}${wins ? ' is-leader' : ''}">${escapeHtml((row.format || compareNumber)(value))}</td>`;
  };

  return `
    <div class="summary-card comparison-scoreboard">
      <h4>Head-to-head</h4>
      <table class="comparison-table">
        <thead><tr><th scope="col"><span class="visually-hidden">Measure</span></th>
          <th scope="col" class="comparison-side-a">${safeNameA}</th>
          <th scope="col" class="comparison-side-b">${safeNameB}</th></tr></thead>
        <tbody>${rows.map(row => `<tr><th scope="row">${escapeHtml(row.label)}</th>${cell(row, 'a')}${cell(row, 'b')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

// "Leads in N areas" says who is broader, not who is bigger, so the summary
// opens with the totals that decide the ranking.
function scoreboard(type, safeNameA, safeNameB, entryA, entryB, aWins, bWins) {
  const number = compareNumber;
  const facultyCount = entry => Object.keys(entry.facultyAdjustedCounts || {}).length;
  const rows = type === 'school'
    ? [
      { label: 'Overall rank', a: entryA.rank, b: entryB.rank, format: value => `#${value}`, lowerWins: true },
      { label: 'CSRankings score', a: entryA.score, b: entryB.score, format: number },
      { label: 'Papers', a: Math.ceil(entryA.totalCount || 0), b: Math.ceil(entryB.totalCount || 0), format: number },
      { label: 'Adjusted count', a: entryA.totalAdjusted, b: entryB.totalAdjusted, format: number },
      { label: 'Publishing faculty', a: facultyCount(entryA), b: facultyCount(entryB), format: number },
      { label: 'Areas led', a: aWins, b: bWins, format: number }
    ]
    : [
      { label: 'University', a: entryA.affiliation || '—', b: entryB.affiliation || '—', format: value => String(value) },
      { label: 'Papers', a: entryA.totalPapers ?? Math.ceil(entryA.totalCount || 0), b: entryB.totalPapers ?? Math.ceil(entryB.totalCount || 0), format: number },
      { label: 'Adjusted count', a: entryA.totalAdjusted, b: entryB.totalAdjusted, format: number },
      { label: 'Active areas', a: Object.keys(entryA.areas || {}).length, b: Object.keys(entryB.areas || {}).length, format: number },
      { label: 'Areas led', a: aWins, b: bWins, format: number }
    ];

  return renderScoreboard(safeNameA, safeNameB, rows);
}

export function renderComparisonSummary(container, { type, nameA, nameB, entryA, entryB, areaList, dataA, dataB }) {
    const safeNameA = escapeHtml(nameA);
    const safeNameB = escapeHtml(nameB);

    let aWins = 0;
    let bWins = 0;
    const insightsA = [];
    const insightsB = [];

    areaList.forEach((area, i) => {
        const valA = dataA[i];
        const valB = dataB[i];
        const diff = Math.abs(valA - valB);
        const label = areaLabels[area] || area;

        if (valA > valB) {
            aWins++;
            if (diff > 0.1) {
                insightsA.push({ area: label, margin: diff.toFixed(1) });
            }
        } else if (valB > valA) {
            bWins++;
            if (diff > 0.1) {
                insightsB.push({ area: label, margin: diff.toFixed(1) });
            }
        }
    });

    // Sort by margin descending
    insightsA.sort((a, b) => parseFloat(b.margin) - parseFloat(a.margin));
    insightsB.sort((a, b) => parseFloat(b.margin) - parseFloat(a.margin));

    let html = scoreboard(type, safeNameA, safeNameB, entryA, entryB, aWins, bWins) + `
        <div class="summary-card comparison-overall">
            <h4>Overall Comparison</h4>
            <div class="leader">
                <span class="comparison-side-a">${safeNameA}</span> leads in <strong>${aWins}</strong> areas
                &nbsp;|&nbsp;
                <span class="comparison-side-b">${safeNameB}</span> leads in <strong>${bWins}</strong> areas
            </div>
        </div>
    `;

    if (type === 'school') {
        const gapItems = explainRankGap(entryA, entryB).slice(0, 6);
        html += `
            <div class="summary-card rank-gap-card">
                <h4>What explains the rank gap?</h4>
                <p class="summary-note">Overall rank uses a geometric mean. These are the largest area-level log-score differences.</p>
                <div class="rank-gap-list">
                    ${gapItems.map(item => {
                        const leader = item.leader === 'a' ? safeNameA : safeNameB;
                        return `<div class="rank-gap-item"><span>${escapeHtml(areaLabels[item.area] || item.area)}</span><strong>${leader}</strong><small>${Math.abs(item.logGap).toFixed(2)} log points</small></div>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    const leadColumn = (side, name, insights) => `
        <div class="comparison-lead-column comparison-side-${side}">
            <h4>${name} Leads</h4>
            ${insights.map(insight => `
                <div class="summary-card comparison-lead-card">
                    <h4>${escapeHtml(insight.area)}</h4>
                    <div class="margin">+${insight.margin} adjusted pubs</div>
                </div>
            `).join('')}
        </div>`;

    html += `<div class="comparison-leads">
        ${leadColumn('a', safeNameA, insightsA)}
        ${leadColumn('b', safeNameB, insightsB)}
    </div>`;

    container.innerHTML = html;
}

export function renderComparisonNotice(container, title, message) {
    container.innerHTML = `
        <div class="summary-card comparison-notice">
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}
