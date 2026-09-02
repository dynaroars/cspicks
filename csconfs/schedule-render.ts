import { escapeHtml, safeExternalUrl } from '../src/shared.js';
import { conferenceAreas, deadlineStatus, formatCalendarDate } from './schedule-data.js';
import { areaLabels } from '../src/shared.js';
import type { ConferenceGroup, ConferenceRecord } from './types.js';

function renderCycle(conf: ConferenceRecord, now: number, showLabel: boolean) {
  const status = deadlineStatus(conf.deadline, now);
  const dates = [
    ['Abstract', formatCalendarDate(conf.abstractDeadline)],
    ['Submission', formatCalendarDate(conf.deadline)],
    ['Rebuttal', formatCalendarDate(conf.rebuttalDate)],
    ['Notification', formatCalendarDate(conf.notificationDate)]
  ].filter(([, value]) => value);
  return `<div class="schedule-cycle">
    ${showLabel && conf.note ? `<strong class="schedule-cycle-label">${escapeHtml(conf.note)}</strong>` : ''}
    <span class="schedule-countdown ${status.className}">${escapeHtml(status.text)}</span>
    ${dates.length ? `<dl class="schedule-dates">${dates.map(([label, value]) =>
      `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : '<p class="schedule-tbd">Submission timeline TBD</p>'}
  </div>`;
}

function eventDate(conf: ConferenceRecord) {
  if (!conf.date) return '';
  return formatCalendarDate(conf.date) || String(conf.date);
}

export function renderScheduleCard(group: ConferenceGroup, now = Date.now()) {
  const main = group[0];
  const href = safeExternalUrl(main.link || main.seriesLink);
  const areas = conferenceAreas(main).map(area => areaLabels[area] || area.toUpperCase());
  const multiplePeople = (value: string) => /,|&|\band\b/i.test(value);
  const extras = [
    [eventDate(main), main.place].filter(Boolean).join(' · '),
    main.generalChair ? `General chair${multiplePeople(main.generalChair) ? 's' : ''}: ${main.generalChair}` : '',
    main.programChair ? `Program chair${multiplePeople(main.programChair) ? 's' : ''}: ${main.programChair}` : '',
    Number.isFinite(main.acceptanceRate)
      ? `Acceptance: ${main.acceptanceRate!.toFixed(2)}%${main.submissions ? ` of ${main.submissions.toLocaleString()} submissions` : ''}`
      : ''
  ].filter(Boolean);
  const cycleOrder = (conf: ConferenceRecord): [number, number] => {
    const status = deadlineStatus(conf.deadline, now);
    if (status.instant !== null && status.instant >= now) return [0, status.instant];
    if (status.instant === null) return [1, 0];
    return [2, -status.instant];
  };
  const cycles = [...group].sort((a, b) => {
    const [priorityA, timeA] = cycleOrder(a);
    const [priorityB, timeB] = cycleOrder(b);
    return priorityA - priorityB || timeA - timeB;
  });
  const renderedCycles = cycles.length <= 2
    ? cycles.map(conf => renderCycle(conf, now, cycles.length > 1)).join('')
    : `${renderCycle(cycles[0]!, now, true)}<details class="schedule-more-cycles"><summary>Show all ${cycles.length} submission cycles</summary>${cycles.slice(1).map(conf => renderCycle(conf, now, true)).join('')}</details>`;

  return `<article class="card schedule-card" data-name="${escapeHtml(`${main.name} ${main.year}`)}">
    <div class="schedule-card-main">
      <div class="schedule-card-title-row">
        <h2>${href === '#'
          ? `${escapeHtml(main.name)} ${main.year}`
          : `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(main.name)} ${main.year}</a>`}</h2>
        ${main.estimated ? '<span class="schedule-estimated" title="Projected from an earlier timeline; confirm on the conference website">Estimated</span>' : ''}
        ${main.verified ? '<span class="schedule-verified" role="img" aria-label="Information reviewed" title="Information reviewed from available sources; not an endorsement or guarantee">✓</span>' : ''}
      </div>
      ${main.description ? `<p class="schedule-description">${escapeHtml(main.description)}</p>` : ''}
      ${areas.length ? `<p class="schedule-areas">${areas.map(area => `<span>${escapeHtml(area)}</span>`).join('')}</p>` : ''}
      ${extras.map(line => `<p class="schedule-extra">${escapeHtml(line)}</p>`).join('')}
      ${main.seriesLink && safeExternalUrl(main.seriesLink) !== href
        ? `<a class="schedule-series-link" href="${escapeHtml(safeExternalUrl(main.seriesLink))}" target="_blank" rel="noopener noreferrer">Conference series</a>` : ''}
    </div>
    <div class="schedule-card-cycles">${renderedCycles}</div>
  </article>`;
}
