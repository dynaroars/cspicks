import { resultActions } from '../result-actions.js';
import { areaLabels, escapeHtml, safeExternalUrl } from '../shared.js';
import { favoriteToggleButton } from '../favorites.js';
import { LEVEL_LABELS, TRACK_LABELS, VISA_LABELS, deadlineLabel, filterValues, formatDay } from './jobs-data.js';
import { US_STATES } from './states.js';
import type { Job, VisaSponsorship } from '../types.js';
import type { FilterChoice, SchoolJobs } from './jobs-data.js';

export interface SchoolRank { rank: number | null; areaRanks: Record<string, number> }
export type RankLookup = (school: string) => SchoolRank | undefined;
type IsFavorite = (id: string) => boolean;


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

const VISA_EMOJI: Record<VisaSponsorship, string> = { yes: '✅', 'case-by-case': '⚖️', no: '🚫', 'not-stated': '❔' };

/** Sits with the position and rank tags; postings nobody has read for sponsorship yet get no tag. */
function visaChip(job: Job) {
  const value = job.visaSponsorship;
  if (!value || value === 'not-stated') return '';
  return `<span class="job-chip job-chip-visa is-${value}" title="As stated on the official posting; confirm with the department before applying"><span aria-hidden="true">${VISA_EMOJI[value]}</span> ${escapeHtml(VISA_LABELS[value])}</span>`;
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
      ${visaChip(job)}
      ${areaChips}
    </p>
    <p class="job-meta"><button type="button" class="job-state-btn" data-state="${escapeHtml(job.state)}" title="Show ${escapeHtml(US_STATES[job.state] || job.state)} only">📍 ${escapeHtml(place)}</button></p>
    <p class="job-deadline ${deadline.className}">${escapeHtml(deadline.text)}</p>
    ${dates.length ? `<p class="job-meta">${dates.map(escapeHtml).join(' · ')}</p>` : ''}
    ${job.summary ? `<p class="job-summary">${escapeHtml(job.summary)}</p>` : ''}
    <div class="job-card-footer result-card-footer">${resultActions(job.title, `<a class="job-edit" href="jobs-submit.html?id=${encodeURIComponent(job.id)}">Suggest update</a>`, `jobs.html?q=${encodeURIComponent(job.id)}&status=all#${encodeURIComponent(job.id)}`)}</div>
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

/** The US tile map: one button per state, shaded by posting count. `selected` is USPS codes, one code, or 'all'. */
export function renderStateMap(rows: string[][], counts: Record<string, number>, selected: FilterChoice) {
  const max = Math.max(1, ...Object.values(counts));
  const chosen = new Set(filterValues(selected));
  const cells = rows.flat().map(code => {
    if (code === '.') return '<span class="job-map-gap" aria-hidden="true"></span>';
    const count = counts[code] || 0;
    const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
    const isSelected = chosen.has(code);
    return `<button type="button" class="job-map-tile level-${level}${isSelected ? ' is-selected' : ''}" data-state="${code}" aria-pressed="${isSelected}" aria-label="${escapeHtml(US_STATES[code] || code)}: ${count} position${count === 1 ? '' : 's'}" title="${escapeHtml(US_STATES[code] || code)}: ${count}"${count === 0 && !isSelected ? ' data-empty="true"' : ''}><span>${code}</span><small>${count || ''}</small></button>`;
  });
  return cells.join('');
}
