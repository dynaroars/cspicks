import { areaLabels, escapeHtml, safeExternalUrl } from '../shared.js';
import { favoriteToggleButton } from '../favorites.js';
import { LEVEL_LABELS, TRACK_LABELS, deadlineLabel, formatDay } from './jobs-data.js';
import { US_STATES } from './states.js';
import type { Job } from '../types.js';
import type { SchoolJobs } from './jobs-data.js';

export interface SchoolRank { rank: number | null; areaRanks: Record<string, number> }
export type RankLookup = (school: string) => SchoolRank | undefined;
type IsFavorite = (id: string) => boolean;

const EXT_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

function rankChips(job: Job, ranks: RankLookup) {
  const info = ranks(job.school);
  if (!info) return '';
  const chips: string[] = [];
  if (info.rank) chips.push(`<span class="job-chip job-chip-rank" title="Overall CSRankings position (US, last 10 years)">#${info.rank} CSRankings</span>`);
  job.areas.slice(0, 2).forEach(area => {
    const areaRank = info.areaRanks[area];
    if (areaRank) chips.push(`<span class="job-chip job-chip-rank" title="CSRankings position in ${escapeHtml(areaLabels[area] || area)}">#${areaRank} ${escapeHtml(areaLabels[area] || area)}</span>`);
  });
  return chips.join('');
}

export function schoolLinks(school: string) {
  const name = encodeURIComponent(school);
  return `<a href="index.html?q=${name}" title="Faculty and rankings for ${escapeHtml(school)}">Faculty &amp; rank in Search</a>
    <a href="simulator.html?univ=${name}" title="Simulate adding a hire at ${escapeHtml(school)}">Simulate a hire</a>`;
}

export function renderJobCard(job: Job, ranks: RankLookup, isFavorite: IsFavorite = () => false, now = Date.now(), showSchool = true) {
  const href = safeExternalUrl(job.url);
  const deadline = deadlineLabel(job, now);
  const place = [job.city, job.state].filter(Boolean).join(', ');
  const areaChips = [
    ...job.areas.map(area => `<button type="button" class="job-chip job-chip-area" data-search-area="${escapeHtml(area)}">${escapeHtml(areaLabels[area] || area)}</button>`),
    job.anyArea ? '<span class="job-chip" title="The posting says it is open to all areas">All areas</span>' : ''
  ].join('');
  const dates = [
    job.reviewBegins ? `Review begins ${formatDay(job.reviewBegins)}` : '',
    job.startDate ? `Start ${formatDay(job.startDate)}` : '',
    job.postedDate ? `Posted ${formatDay(job.postedDate)}` : ''
  ].filter(Boolean);

  return `<article class="job-card" id="${escapeHtml(job.id)}" data-job-id="${escapeHtml(job.id)}">
    <div class="job-card-header">
      <h2 class="job-title"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a></h2>
      <div class="job-badges">
        ${job.verified ? '<span class="job-verified" role="img" aria-label="Information reviewed" title="Posting reviewed against the official page; not an endorsement">✓</span>' : ''}
        ${favoriteToggleButton(job.id, isFavorite(job.id))}
      </div>
    </div>
    ${showSchool ? `<p class="job-school"><button type="button" class="job-school-btn" data-search-school="${escapeHtml(job.school)}"><strong>${escapeHtml(job.school)}</strong></button> · ${escapeHtml(job.department)}</p>` : `<p class="job-school">${escapeHtml(job.department)}</p>`}
    <p class="job-chips">
      <span class="job-chip job-chip-track">${escapeHtml(TRACK_LABELS[job.track])}</span>
      ${job.level ? `<span class="job-chip">${escapeHtml(LEVEL_LABELS[job.level])}</span>` : ''}
      ${showSchool ? rankChips(job, ranks) : ''}
      ${areaChips}
    </p>
    <p class="job-meta"><button type="button" class="job-state-btn" data-state="${escapeHtml(job.state)}" title="Show ${escapeHtml(US_STATES[job.state] || job.state)} only">📍 ${escapeHtml(place)}</button></p>
    <p class="job-deadline ${deadline.className}">${escapeHtml(deadline.text)}</p>
    ${dates.length ? `<p class="job-meta">${dates.map(escapeHtml).join(' · ')}</p>` : ''}
    ${job.summary ? `<p class="job-summary">${escapeHtml(job.summary)}</p>` : ''}
    <div class="job-card-footer">
      <a class="job-apply" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">View posting ${EXT_ICON}</a>
      <a class="job-edit" href="jobs-submit.html?id=${encodeURIComponent(job.id)}" title="Suggest an update for this posting">✎ Suggest update</a>
    </div>
  </article>`;
}

export function renderSchoolCard(group: SchoolJobs, ranks: RankLookup, isFavorite: IsFavorite = () => false, now = Date.now()) {
  const info = ranks(group.school);
  const first = group.jobs[0]!;
  return `<section class="job-school-card" aria-label="${escapeHtml(group.school)}">
    <header class="job-school-card-header">
      <h2><button type="button" class="job-school-btn" data-search-school="${escapeHtml(group.school)}">${escapeHtml(group.school)}</button></h2>
      <p class="job-meta">${first.city ? `${escapeHtml(first.city)}, ` : ''}${escapeHtml(US_STATES[group.state] || group.state)}
        ${info?.rank ? `· <span class="job-chip job-chip-rank" title="Overall CSRankings position (US, last 10 years)">#${info.rank} CSRankings</span>` : ''}
        · ${group.jobs.length} position${group.jobs.length === 1 ? '' : 's'}</p>
      <p class="job-school-links">${schoolLinks(group.school)}</p>
    </header>
    <div class="job-school-card-jobs">${group.jobs.map(job => renderJobCard(job, ranks, isFavorite, now, false)).join('')}</div>
  </section>`;
}

/** The US tile map: one button per state, shaded by posting count. `selected` is a USPS code or 'all'. */
export function renderStateMap(rows: string[][], counts: Record<string, number>, selected: string) {
  const max = Math.max(1, ...Object.values(counts));
  const cells = rows.flat().map(code => {
    if (code === '.') return '<span class="job-map-gap" aria-hidden="true"></span>';
    const count = counts[code] || 0;
    const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
    return `<button type="button" class="job-map-tile level-${level}${selected === code ? ' is-selected' : ''}" data-state="${code}" aria-pressed="${selected === code}" aria-label="${escapeHtml(US_STATES[code] || code)}: ${count} position${count === 1 ? '' : 's'}" title="${escapeHtml(US_STATES[code] || code)}: ${count}"${count === 0 && selected !== code ? ' data-empty="true"' : ''}><span>${code}</span><small>${count || ''}</small></button>`;
  });
  return cells.join('');
}
