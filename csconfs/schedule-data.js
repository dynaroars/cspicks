import { getConferenceAreaMap, publicationMatchesConferenceSet } from '../src/data.js';
import { areaLabels } from '../src/shared.js';

const DAY = 86400000;

export function calendarParts(value) {
  if (!value || String(value).toUpperCase() === 'TBD') return null;
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  // Event ranges are display text, not single instants. Native Date parsing
  // famously reads "January 10-16, 2027" as January 10, 2016.
  if (/\b\d{1,2}\s*[-–—]\s*\d{1,2}\b/.test(text)) return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()];
  return null;
}

export function aoeDeadline(value) {
  const parts = calendarParts(value);
  return parts ? Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 11, 59, 59, 999) : null;
}

export function conferenceStart(value, fallbackYear) {
  if (!value) return null;
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const monthNames = 'january february march april may june july august september october november december';
  const match = text.toLowerCase().match(new RegExp(`(${monthNames.split(' ').join('|')}|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[^0-9]*([0-9]{1,2})?`, 'i'));
  if (!match) return null;
  const month = monthNames.split(' ').findIndex(name => name.startsWith(match[1].slice(0, 3).toLowerCase()));
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const withoutYear = text.replace(/\b20\d{2}\b/g, '');
  const dayMatch = withoutYear.match(/\b([1-9]|[12][0-9]|3[01])\b/);
  return Date.UTC(Number(yearMatch?.[1] || fallbackYear), month, Number(dayMatch?.[1] || 1));
}

export function formatCalendarDate(value) {
  const parts = calendarParts(value);
  if (!parts) return value && String(value).toUpperCase() !== 'TBD' ? String(value) : '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
}

export function deadlineStatus(value, now = Date.now()) {
  const instant = aoeDeadline(value);
  if (instant === null) return { text: 'TBD', className: 'is-tbd', instant: null };
  if (instant < now) return { text: 'Passed', className: 'is-passed', instant };
  const days = Math.ceil((instant - now) / DAY);
  if (days === 0) return { text: 'Closes today (AoE)', className: 'is-urgent', instant };
  return {
    text: `${days} day${days === 1 ? '' : 's'} left`,
    className: days <= 7 ? 'is-urgent' : days <= 30 ? 'is-soon' : '',
    instant
  };
}

export function conferenceAreas(conf) {
  const map = getConferenceAreaMap('all-union');
  return [...new Set(conf.venueKeys.map(key => map[key]).filter(Boolean))];
}

export function groupConferences(conferences) {
  const grouped = new Map();
  for (const conf of conferences) {
    const key = `${conf.name}\u0000${conf.year}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(conf);
  }
  return [...grouped.values()];
}

function isUpcoming(group, now) {
  if (group.some(conf => {
    const deadline = aoeDeadline(conf.deadline);
    return deadline !== null && deadline >= now;
  })) return true;
  const event = conferenceStart(group[0].date, group[0].year);
  if (event !== null && event >= now) return true;
  return group[0].year > new Date(now).getUTCFullYear();
}

function nextDeadline(group, now) {
  return Math.min(...group.map(conf => aoeDeadline(conf.deadline)).filter(value => value !== null && value >= now));
}

function scheduleSortKey(group, now) {
  const deadline = nextDeadline(group, now);
  if (Number.isFinite(deadline)) return deadline;
  const event = conferenceStart(group[0].date, group[0].year);
  // Dated conferences without a future submission deadline follow all open
  // deadlines, while concluded conferences always stay at the end.
  return event !== null && event >= now ? 1e16 + event : Infinity;
}

function searchText(group) {
  const conf = group[0];
  const areas = conferenceAreas(conf).map(area => `${area} ${areaLabels[area] || ''}`);
  return [conf.name, conf.description, conf.place, ...conf.venueKeys, ...areas].filter(Boolean).join(' ').toLowerCase();
}

export function filterSchedule(conferences, {
  startYear,
  endYear,
  confSet = 'all-union',
  query = '',
  upcomingOnly = true,
  now = Date.now()
}) {
  const normalized = query.trim().toLowerCase();
  return groupConferences(conferences)
    .filter(group => group[0].year >= startYear && group[0].year <= endYear)
    .filter(group => group[0].venueKeys.some(area => publicationMatchesConferenceSet({ area }, confSet)))
    .filter(group => !normalized || searchText(group).includes(normalized))
    .filter(group => !upcomingOnly || isUpcoming(group, now))
    .sort((a, b) => {
      const deadlineA = scheduleSortKey(a, now);
      const deadlineB = scheduleSortKey(b, now);
      if (deadlineA !== deadlineB) return deadlineA - deadlineB;
      const eventA = conferenceStart(a[0].date, a[0].year) ?? Infinity;
      const eventB = conferenceStart(b[0].date, b[0].year) ?? Infinity;
      return eventA - eventB || a[0].name.localeCompare(b[0].name);
    });
}

export function scheduleSuggestions(conferences, startYear, endYear, confSet) {
  const eligible = conferences.filter(conf => conf.year >= startYear && conf.year <= endYear
    && conf.venueKeys.some(area => publicationMatchesConferenceSet({ area }, confSet)));
  const names = [...new Set(eligible.map(conf => conf.name))].sort();
  const areaCounts = new Map();
  groupConferences(eligible).forEach(group => {
    conferenceAreas(group[0]).forEach(area => areaCounts.set(area, (areaCounts.get(area) || 0) + 1));
  });
  return {
    conferences: names.map(label => ({ label, detail: 'Conference' })),
    areas: [...areaCounts.entries()].map(([area, count]) => ({
      label: areaLabels[area] || area.toUpperCase(),
      detail: `Research area · ${count} conference${count === 1 ? '' : 's'}`,
      searchTerms: area
    })).sort((a, b) => a.label.localeCompare(b.label))
  };
}
