import { drawChart } from './charts.js';
import { areaLabels, cleanName, escapeHtml } from './shared.js';
import { describeVerdict, explainRankGap } from './metrics.js';

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

export const sideSpan = (side, name) => `<span class="comparison-side-${side}">${name}</span>`;

function verdict(type, safeNameA, safeNameB, entryA, entryB, aWins, bWins, areaCount) {
  const { leader, phrase, verb, areaLeader, kind } = describeVerdict(type, entryA, entryB, aWins, bWins);
  const named = side => sideSpan(side, side === 'a' ? safeNameA : safeNameB);
  const areaPhrase = side => `${side === 'a' ? aWins : bWins} of ${areaCount} areas`;

  let line;
  if (kind === 'even') {
    line = `${named('a')} and ${named('b')} are evenly matched — ${phrase}, and neither leads in more areas.`;
  } else if (kind === 'breadth-only') {
    line = `Level on the headline measure (${phrase}), but ${named(areaLeader)} leads in more areas (${areaPhrase(areaLeader)}).`;
  } else if (kind === 'agree') {
    const also = areaLeader
      ? ` and leads in ${areaPhrase(leader)}`
      : ', though the two lead in an equal number of areas';
    line = `${named(leader)} ${verb} — ${phrase}${also}.`;
  } else {
    line = `${named(leader)} ${verb} (${phrase}), but ${named(areaLeader)} is broader, leading in ${areaPhrase(areaLeader)}.`;
  }

  return `<div class="summary-card comparison-verdict"><p>${line}</p></div>`;
}

// "Leads in N areas" says who is broader, not who is bigger, so the summary
// opens with the totals that decide the ranking.
function scoreboard(type, safeNameA, safeNameB, entryA, entryB, aWins, bWins) {
  const number = compareNumber;
  const facultyCount = entry => Object.keys(entry.facultyAdjustedCounts || {}).length;
  const rows = type === 'school'
    ? [
      { label: 'Overall rank', a: entryA.rank, b: entryB.rank, format: value => `#${value}`, lowerWins: true },
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

    // Verdict first, then the numbers behind it. The old "Overall Comparison"
    // card is gone: it restated the scoreboard's "Areas led" row verbatim,
    // directly beneath it.
    let html = verdict(type, safeNameA, safeNameB, entryA, entryB, aWins, bWins, areaList.length)
        + scoreboard(type, safeNameA, safeNameB, entryA, entryB, aWins, bWins);

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
            <h4>${name} leads</h4>
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

// A capped, expandable name list: the first dozen inline, the rest behind a
// <details> disclosure - the same "+N more" pattern used for a professor's
// affiliation history, since a common area's roster can run to hundreds.
function nameList(names, emptyText) {
  if (!names.length) return `<p class="summary-note">${escapeHtml(emptyText)}</p>`;
  // The query keeps CSRankings' disambiguated name so the link resolves, but
  // the label drops the trailing digits the way every other view does.
  const link = name => `<a href="index.html?q=${encodeURIComponent(name)}">${escapeHtml(cleanName(name))}</a>`;
  const shown = names.slice(0, 12);
  const rest = names.slice(12);
  const shownHtml = shown.map(link).join(', ');
  if (!rest.length) return `<p class="comparison-name-list">${shownHtml}</p>`;
  return `<p class="comparison-name-list">${shownHtml}<details class="affiliation-history"><summary>+${rest.length} more</summary><span>${rest.map(link).join(', ')}</span></details></p>`;
}

function schoolList(rows, emptyText, labelA, labelB) {
  if (!rows.length) return `<p class="summary-note">${escapeHtml(emptyText)}</p>`;
  const shown = rows.slice(0, 9);
  const html = `<div class="rank-gap-list">${shown.map(row => `
    <div class="rank-gap-item">
      <strong><a href="index.html?q=${encodeURIComponent(row.name)}" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</a></strong>
      <small>${escapeHtml(labelA)}: ${compareNumber(row.creditA)} · ${escapeHtml(labelB)}: ${compareNumber(row.creditB)}</small>
    </div>`).join('')}</div>`;
  return rows.length > shown.length ? `${html}<p class="summary-note">+${rows.length - shown.length} more</p>` : html;
}

/**
 * Head-to-head between two research areas or two venues: region-wide totals
 * and growth, then who bridges both and who is newly active in each - the
 * area-level counterpart to renderComparisonSummary. `noun` names what is
 * being compared so the copy reads correctly for either kind.
 */
export function renderAreaComparison(container, { labelA, labelB, cmp, noun = 'fields' }) {
  const safeA = escapeHtml(labelA);
  const safeB = escapeHtml(labelB);
  const { a, b, bothFaculty, bothSchools } = cmp;
  const growthText = value => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`;

  const biggerSide = a.currentTotal === b.currentTotal ? null : (a.currentTotal > b.currentTotal ? 'a' : 'b');
  const fasterSide = a.growth === b.growth ? null : (a.growth > b.growth ? 'a' : 'b');
  const named = side => sideSpan(side, side === 'a' ? safeA : safeB);
  let verdictLine;
  if (!biggerSide && !fasterSide) {
    verdictLine = `${safeA} and ${safeB} are evenly matched on both region-wide output and growth.`;
  } else {
    const parts = [];
    if (biggerSide) parts.push(`${named(biggerSide)} has the larger region-wide output`);
    if (fasterSide) parts.push(`${named(fasterSide)} is growing faster`);
    verdictLine = `${parts.join(', and ')}.`;
  }

  const rows = [
    { label: 'Region-wide adjusted count', a: a.currentTotal, b: b.currentTotal },
    { label: 'Growth vs. prior period', a: a.growth, b: b.growth, format: growthText },
    { label: 'Active universities', a: a.schools.length, b: b.schools.length },
    { label: 'Active researchers', a: a.facultyCount, b: b.facultyCount }
  ];

  container.innerHTML = `
    <div class="summary-card comparison-verdict"><p>${verdictLine}</p></div>
    ${renderScoreboard(safeA, safeB, rows)}
    <div class="summary-card comparison-bridge-card">
      <h4>Bridges both ${escapeHtml(noun)}</h4>
      <p class="summary-note">${bothFaculty.length} researcher${bothFaculty.length === 1 ? '' : 's'} and ${bothSchools.length} universit${bothSchools.length === 1 ? 'y' : 'ies'} with active output in both ${safeA} and ${safeB} this period.</p>
      ${schoolList(bothSchools, `No university has active output in both ${noun} this period.`, labelA, labelB)}
      ${nameList(bothFaculty, `No researcher has active output in both ${noun} this period.`)}
    </div>
    <div class="comparison-leads">
      <div class="comparison-lead-column comparison-side-a">
        <h4>New to ${safeA}</h4>
        <p class="summary-note">Active this period, not in the preceding one.</p>
        ${nameList(a.newFaculty, `No new researchers in ${labelA} this period.`)}
      </div>
      <div class="comparison-lead-column comparison-side-b">
        <h4>New to ${safeB}</h4>
        <p class="summary-note">Active this period, not in the preceding one.</p>
        ${nameList(b.newFaculty, `No new researchers in ${labelB} this period.`)}
      </div>
    </div>
  `;
}

export function renderComparisonNotice(container, title, message) {
    container.innerHTML = `
        <div class="summary-card comparison-notice">
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}
