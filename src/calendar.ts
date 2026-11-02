/**
 * iCalendar (.ics) export for Awards and Jobs deadlines: all-day events with reminders a week and a day ahead,
 * so a starred shortlist can live in Google Calendar, Outlook, or Apple Calendar.
 */

export interface CalendarEvent {
  /** Stable per item and stage, so re-importing updates events instead of duplicating them. */
  uid: string;
  /** YYYY-MM-DD; exported as an all-day event. */
  date: string;
  title: string;
  description?: string;
  url?: string;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** RFC 5545 TEXT escaping. */
function escapeText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets, as RFC 5545 requires (approximated by UTF-16 units, safe for ASCII-heavy text). */
function fold(line: string) {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

const compactDay = (day: string) => day.replace(/-/g, '');

function nextDay(day: string) {
  const match = DAY_RE.exec(day)!;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return date.toISOString().slice(0, 10);
}

function stamp(now: number) {
  return new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildCalendar(events: CalendarEvent[], { name = 'CS Picks deadlines', now = Date.now() }: { name?: string; now?: number } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CS Picks//cspicks.roars.dev//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`
  ];
  for (const event of events) {
    if (!DAY_RE.test(event.date)) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(event.uid)}@cspicks.roars.dev`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDay(event.date)}`,
      `DTEND;VALUE=DATE:${compactDay(nextDay(event.date))}`,
      `SUMMARY:${escapeText(event.title)}`,
      ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
      ...(event.url ? [`URL:${event.url.replace(/[\r\n]/g, '')}`] : []),
      'TRANSP:TRANSPARENT',
      ...[['P7D', 'in one week'], ['P1D', 'tomorrow']].flatMap(([trigger, when]) => [
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(`${event.title} ${when}`)}`, `TRIGGER:-${trigger}`, 'END:VALARM'
      ]),
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Browser download of a generated file. */
export function downloadFile(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCalendar(fileName: string, events: CalendarEvent[], name?: string) {
  downloadFile(fileName, buildCalendar(events, { name }), 'text/calendar;charset=utf-8');
}
