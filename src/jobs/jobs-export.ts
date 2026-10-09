/**
 * Markdown export of starred postings, so applicants can take their shortlist offline
 * (notes, a local AI assistant, a spreadsheet) after searching here, and the restore that
 * reads such a file back into the browser's stars.
 */
import { areaLabels, safeExternalUrl } from '../shared.js';
import { DEPARTMENT_LABELS, LEVEL_LABELS, TRACK_LABELS, deadlineLabel, departmentKind, formatDay } from './jobs-data.js';
import { US_STATES } from './states.js';
import type { Job, VisaSponsorship } from '../types.js';
import type { RankLookup } from './jobs-render.js';

const SITE_URL = 'https://cspicks.roars.dev';

const VISA_TEXT: Record<VisaSponsorship, string> = {
  yes: 'Available, per the posting',
  'case-by-case': 'Case by case, per the posting',
  no: 'Not offered, per the posting',
  'not-stated': 'Not stated on the posting'
};

/** One line of Markdown text: collapse whitespace so a stray newline cannot break the list or heading. */
const inline = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function exportFileName(now = Date.now()) {
  return `cspicks-starred-jobs-${new Date(now).toISOString().slice(0, 10)}.md`;
}

export function jobsToMarkdown(jobs: Job[], { ranks = () => undefined, now = Date.now() }: { ranks?: RankLookup; now?: number } = {}) {
  const lines = [
    '# Starred US academic CS jobs',
    '',
    `Exported from CS Picks (${SITE_URL}/jobs.html) on ${new Date(now).toISOString().slice(0, 10)} · ${jobs.length} position${jobs.length === 1 ? '' : 's'}.`,
    'Details come from public hiring pages and community submissions and may be out of date; confirm everything on the official posting before applying. CSRankings ranks are US, last 10 years.',
    ''
  ];

  jobs.forEach((job, index) => {
    const info = ranks(job.school);
    const url = safeExternalUrl(job.url);
    const areas = [
      ...job.areas.map(area => {
        const areaRank = info?.areaRanks[area];
        return `${areaLabels[area] || area}${areaRank ? ` (#${areaRank} CSRankings)` : ''}`;
      }),
      job.anyArea ? 'Open to all areas' : ''
    ].filter(Boolean);
    const fields: Array<[string, string]> = [
      ['Status', deadlineLabel(job, now).text],
      ['School', `${job.school}${info?.rank ? ` (#${info.rank} CSRankings)` : ''}`],
      ['Department', `${job.department} (${DEPARTMENT_LABELS[departmentKind(job.department)]})`],
      ['Location', [job.city, US_STATES[job.state] || job.state].filter(Boolean).join(', ')],
      ['Position', [TRACK_LABELS[job.track], job.level ? LEVEL_LABELS[job.level] : ''].filter(Boolean).join(' · ')],
      ['Research areas', areas.join(', ') || 'Not specified'],
      ['Visa sponsorship', job.visaSponsorship ? VISA_TEXT[job.visaSponsorship] : ''],
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

export interface RestoredStars {
  /** Ids of postings found in the file, in file order, without repeats. */
  ids: string[];
  /** Posting sections that match no current posting (removed from the dataset, or edited by hand). */
  unmatched: number;
}

/**
 * Finds the postings in an exported file. Each `## ` section is matched by its `CS Picks ID` line; sections
 * without one (files exported before ids were added) by their official posting URL, else by title and school.
 */
export function restoreStarredIds(markdown: string, jobs: Job[]): RestoredStars {
  const byId = new Map(jobs.map(job => [job.id, job]));
  const unique = (key: (job: Job) => string) => {
    const counts = new Map<string, Job[]>();
    jobs.forEach(job => counts.set(key(job), [...(counts.get(key(job)) || []), job]));
    return (value: string) => counts.get(value)?.length === 1 ? counts.get(value)![0] : undefined;
  };
  const byUrl = unique(job => safeExternalUrl(job.url));
  const byHeading = unique(job => `${inline(job.title)} — ${inline(job.school)}`);

  const ids: string[] = [];
  let unmatched = 0;
  String(markdown ?? '').replace(/\r\n?/g, '\n').split(/^## /m).slice(1).forEach(section => {
    const heading = /^(?:\d+\.\s+)?(.*)$/m.exec(section)![1]!.trim();
    const id = /^- \*\*CS Picks ID:\*\* `?([^`\s]+)`?\s*$/m.exec(section)?.[1];
    const url = /^- \*\*Official posting:\*\* <([^>\s]+)>\s*$/m.exec(section)?.[1];
    // An id that is no longer listed means the posting was removed; never guess a different one for it.
    const job = id ? byId.get(id) : (url && byUrl(url)) || byHeading(heading);
    if (!job) unmatched += 1;
    else if (!ids.includes(job.id)) ids.push(job.id);
  });
  return { ids, unmatched };
}
