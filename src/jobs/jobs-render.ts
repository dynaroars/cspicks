import { newBadge, opportunityDeadline, opportunityFooter, opportunityFreshness, opportunityGroup, opportunityHeader, opportunityMeta, opportunityProgressPicker, opportunityTopics } from '../opportunity-card.js';
import { PROGRESS_LABELS } from '../progress.js';
import type { ProgressStatus } from '../progress.js';
import { areaLabels, escapeHtml, safeExternalUrl } from '../shared.js';
import { deadlineLabel, DEPARTMENT_LABELS, isActive, jobCalendarEvents, jobUnitKind, filterValues, formatDay, LEVEL_LABELS, TRACK_LABELS, US_STATES } from './jobs-data.js';
import type { Job } from '../types.js';
import type { FilterChoice, SchoolJobs } from './jobs-data.js';

type IsFavorite = (id: string) => boolean;
type GetProgress = (id: string) => ProgressStatus | undefined;

/** Active postings not confirmed live by a crawl or submission within this many days get a visible warning. */
export const JOB_STALE_AFTER_DAYS = 30;



/** "US citizens or permanent residents" for a US posting; a posting elsewhere names no country. */
function residencyLabel(job: Job) {
  return `${(job.country || 'US').toUpperCase() === 'US' ? 'US citizens' : 'Citizens'} or permanent residents`;
}

/**
 * Sits with the position tags. Only an explicit restriction gets a tag: sponsorship that is
 * available, case by case, unstated, or unchecked is the usual case and would just add noise.
 */
function visaChip(job: Job) {
  if (job.visaSponsorship !== 'no') return '';
  return `<span class="opportunity-chip job-chip job-chip-visa is-no" title="As stated on the official posting; confirm with the department before applying">${escapeHtml(residencyLabel(job))}</span>`;
}

function schoolLinks(school: string) {
  const name = encodeURIComponent(school);
  return `<a href="index.html?q=${name}" title="Faculty at ${escapeHtml(school)}">Faculty in Search</a>
    <a href="simulator.html?univ=${name}" title="Simulate adding a hire at ${escapeHtml(school)}">Simulate a hire</a>`;
}

export function renderJobCard(job: Job, isFavorite: IsFavorite = () => false, now = Date.now(), showSchool = true, getProgress: GetProgress = () => undefined) {
  const favorite = isFavorite(job.id);
  const footerParts = [
    favorite ? opportunityProgressPicker(job.id, `${job.title} at ${job.school}`, getProgress(job.id)) : '',
    showSchool && !job.lab ? `<span class="opportunity-card-links job-school-links">${schoolLinks(job.school)}</span>` : ''
  ].join('');
  const calendarAction = jobCalendarEvents(job, now).length ? `<button type="button" data-calendar-job="${escapeHtml(job.id)}">Add dates to calendar</button>` : '';
  const href = safeExternalUrl(job.url);
  const deadline = deadlineLabel(job, now);
  const place = [job.city, job.state].filter(Boolean).join(', ');
  const locationFilter = US_STATES[job.state] || place || job.country || '';
  const areaChips = [
    ...job.areas.map(area => `<button type="button" class="opportunity-chip job-chip job-chip-area" data-search-area="${escapeHtml(area)}">${escapeHtml(areaLabels[area] || area)}</button>`),
    job.anyArea ? '<span class="opportunity-chip job-chip" title="The posting says it is open to all areas">All areas</span>' : ''
  ].join('');
  const dates = [
    job.reviewBegins ? `Review begins ${formatDay(job.reviewBegins)}` : '',
    job.startDate ? `Start ${formatDay(job.startDate)}` : '',
    job.postedDate ? `Posted ${formatDay(job.postedDate)}` : ''
  ].filter(Boolean);
  const annotationChips = visaChip(job);

  return `<article class="opportunity-card job-card" id="${escapeHtml(job.id)}" data-job-id="${escapeHtml(job.id)}">
    ${opportunityHeader({ id: job.id, title: job.title, url: href, kind: 'job', favorite,
      organizationHtml: showSchool ? `<button type="button" class="opportunity-filter-link job-school-btn" data-search-school="${escapeHtml(job.school)}"><strong>${escapeHtml(job.school)}</strong></button> · ${escapeHtml(job.department)}` : escapeHtml(job.department),
      tagsHtml: `${newBadge(job.addedAt, now)}<span class="opportunity-chip opportunity-chip-type job-chip-track">${escapeHtml(TRACK_LABELS[job.track])}</span>${job.level ? `<span class="opportunity-chip">${escapeHtml(LEVEL_LABELS[job.level])}</span>` : ''}` })}
    ${opportunityDeadline(deadline.text, { className: deadline.className || (!job.deadline || job.rolling ? '' : 'is-confirmed'), valueClass: 'job-deadline' })}
    ${opportunityMeta([
      { label: 'Location', html: `<button type="button" class="opportunity-filter-link job-state-btn" data-location="${escapeHtml(locationFilter)}" title="Show ${escapeHtml(locationFilter)} only">${escapeHtml(place)}</button>` },
      ...(dates.length ? [{ label: 'Other dates', value: dates.join(' · ') }] : [])
    ])}
    ${annotationChips ? `<div class="opportunity-tags job-chips">${annotationChips}</div>` : ''}
    ${job.summary ? `<p class="opportunity-summary job-summary">${escapeHtml(job.summary)}</p>` : ''}
    ${opportunityTopics(areaChips)}
    ${isActive(job, now) ? opportunityFreshness({ checkedAt: job.lastSeenAt, checkedLabel: 'Confirmed live on the official page', staleAfterDays: JOB_STALE_AFTER_DAYS, addedAt: job.addedAt, now }) : ''}
    ${opportunityFooter({ kind: 'job', title: job.title, startHtml: footerParts,
      actionsHtml: `${calendarAction}<a class="job-edit" href="jobs-submit.html?id=${encodeURIComponent(job.id)}">Suggest update</a>`,
      pageLink: `jobs.html?q=${encodeURIComponent(job.id)}&status=all#${encodeURIComponent(job.id)}` })}
  </article>`;
}

export function renderSchoolCard(group: SchoolJobs, isFavorite: IsFavorite = () => false, now = Date.now(), getProgress: GetProgress = () => undefined) {
  const first = group.jobs[0]!;
  return opportunityGroup({
    label: group.school,
    className: 'job-school-card',
    headingButtonHtml: `<button type="button" class="job-school-btn" data-search-school="${escapeHtml(group.school)}">${escapeHtml(group.school)}</button>`,
    metaHtml: `<p class="job-meta">${first.city ? `${escapeHtml(first.city)}, ` : ''}${escapeHtml(US_STATES[group.state] || group.state)} · ${group.jobs.length} position${group.jobs.length === 1 ? '' : 's'}</p>`,
    extraHeaderHtml: first.lab ? '' : `<p class="job-school-links">${schoolLinks(group.school)}</p>`,
    itemsHtml: group.jobs.map(job => renderJobCard(job, isFavorite, now, false, getProgress)).join('')
  });
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

/**
 * Markdown export of starred postings, so applicants can take their shortlist offline
 * (notes, a local AI assistant, a spreadsheet) after searching here.
 */
const SITE_URL = 'https://cspicks.roars.dev';

/** One line of Markdown text: collapse whitespace so a stray newline cannot break the list or heading. */
const inline = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function exportFileName(now = Date.now()) {
  return `cspicks-starred-jobs-${new Date(now).toISOString().slice(0, 10)}.md`;
}

export function jobsToMarkdown(jobs: Job[], { now = Date.now(), getProgress = () => undefined }: { now?: number; getProgress?: GetProgress } = {}) {
  const lines = [
    '# Starred academic CS jobs',
    '',
    `Exported from CS Picks (${SITE_URL}/jobs.html) on ${new Date(now).toISOString().slice(0, 10)} · ${jobs.length} position${jobs.length === 1 ? '' : 's'}.`,
    'Details come from public hiring pages and community submissions and may be out of date; confirm everything on the official posting before applying.',
    ''
  ];

  jobs.forEach((job, index) => {
    const url = safeExternalUrl(job.url);
    const areas = [
      ...job.areas.map(area => {
        return areaLabels[area] || area;
      }),
      job.anyArea ? 'Open to all areas' : ''
    ].filter(Boolean);
    const fields: Array<[string, string]> = [
      ['Status', deadlineLabel(job, now).text],
      ['My application status', PROGRESS_LABELS[getProgress(job.id) as ProgressStatus] ?? ''],
      [job.lab ? 'Employer' : 'School', job.school],
      ['Department', `${job.department} (${DEPARTMENT_LABELS[jobUnitKind(job)]})`],
      ['Location', [job.city, US_STATES[job.state] || job.state].filter(Boolean).join(', ')],
      ['Position', [TRACK_LABELS[job.track], job.level ? LEVEL_LABELS[job.level] : ''].filter(Boolean).join(' · ')],
      ['Research areas', areas.join(', ') || 'Not specified'],
      ['Eligibility', job.visaSponsorship === 'no' ? `${residencyLabel(job)} only, per the posting` : ''],
      ['Review begins', formatDay(job.reviewBegins)],
      ['Start date', formatDay(job.startDate)],
      ['Posted', formatDay(job.postedDate)],
      ['Last confirmed live', formatDay(job.lastSeenAt)],
      ['Official posting', url === '#' ? '' : `<${url}>`],
      ['CS Picks', `<${SITE_URL}/jobs.html?q=${encodeURIComponent(`school: "${job.school}"`)}&status=all>`],
      ['CS Picks ID', `\`${job.id}\``]
    ];
    lines.push(`## ${index + 1}. ${inline(job.title)} — ${inline(job.school)}`, '');
    fields.forEach(([name, value]) => { if (inline(value)) lines.push(`- **${name}:** ${inline(value)}`); });
    if (job.summary) lines.push('', `> ${inline(job.summary)}`);
    lines.push('');
  });

  return `${lines.join('\n').trimEnd()}\n`;
}
