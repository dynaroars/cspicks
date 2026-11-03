#!/usr/bin/env node
/**
 * Atom feeds of newly added jobs and awards (public/feeds/jobs.xml, public/feeds/grants.xml), built on predev/prebuild
 * from each record's `addedAt`. The output is gitignored: it is derived data, regenerated on every build.
 *
 *   npm run feeds
 */
import fs from 'node:fs/promises';

const SITE = 'https://cspicks.roars.dev';
const MAX_ENTRIES = 100;

const escapeXml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Newest first; ties keep a stable order by title. */
export function newestEntries(records, { max = MAX_ENTRIES } = {}) {
  return records
    .filter(record => ISO_DAY.test(String(record.addedAt ?? '')))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || String(a.id).localeCompare(String(b.id)))
    .slice(0, max);
}

export function atomFeed({ title, subtitle, page, feedUrl, entries, now = new Date() }) {
  const updated = entries[0] ? `${entries[0].addedAt}T00:00:00Z` : now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <subtitle>${escapeXml(subtitle)}</subtitle>
  <link href="${escapeXml(page)}"/>
  <link rel="self" href="${escapeXml(feedUrl)}"/>
  <id>${escapeXml(feedUrl)}</id>
  <updated>${updated}</updated>
  <author><name>CS Picks</name></author>
${entries.map(entry => `  <entry>
    <title>${escapeXml(entry.title)}</title>
    <link href="${escapeXml(entry.link)}"/>
    <link rel="related" href="${escapeXml(entry.official)}"/>
    <id>${escapeXml(entry.link)}</id>
    <updated>${entry.addedAt}T00:00:00Z</updated>
    <published>${entry.addedAt}T00:00:00Z</published>
    <summary>${escapeXml(entry.summary)}</summary>
  </entry>`).join('\n')}
</feed>
`;
}

export function jobsFeed(jobs, now = new Date()) {
  const entries = newestEntries(jobs.filter(job => !job.closedAt)).map(job => ({
    addedAt: job.addedAt,
    title: `${job.title} — ${job.school}`,
    link: `${SITE}/jobs.html?q=${encodeURIComponent(job.id)}&status=all#${encodeURIComponent(job.id)}`,
    official: job.url,
    summary: [job.department, [job.city, job.state, job.country && job.country !== 'US' ? job.country : ''].filter(Boolean).join(', '),
      job.deadline ? `Deadline ${job.deadline}${job.rolling ? ' (priority date; rolling review)' : ''}` : job.rolling ? 'Rolling review' : '',
      job.summary].filter(Boolean).join(' · ')
  }));
  return atomFeed({ title: 'CS Picks: new academic CS jobs', subtitle: 'Faculty, teaching, research, postdoc, and lab positions newly added to CS Picks',
    page: `${SITE}/jobs.html`, feedUrl: `${SITE}/feeds/jobs.xml`, entries, now });
}

export function grantsFeed(grants, now = new Date()) {
  const entries = newestEntries(grants.filter(grant => grant.status !== 'historical')).map(grant => ({
    addedAt: grant.addedAt,
    title: `${grant.name} (${grant.sponsor})`,
    link: `${SITE}/grants.html?q=${encodeURIComponent(grant.id)}#${encodeURIComponent(grant.id)}`,
    official: grant.url,
    summary: [`For: ${grant.whoFor}`, `Deadline: ${grant.deadline}`, `Funding: ${grant.amount}`, grant.summary].join(' · ')
  }));
  return atomFeed({ title: 'CS Picks: new CS awards, fellowships, and grants', subtitle: 'Research funding opportunities newly added to CS Picks',
    page: `${SITE}/grants.html`, feedUrl: `${SITE}/feeds/grants.xml`, entries, now });
}

async function main() {
  const read = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));
  const [jobs, grants] = await Promise.all([read('../public/jobs.json'), read('../public/grants.json')]);
  const dir = new URL('../public/feeds/', import.meta.url);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(new URL('jobs.xml', dir), jobsFeed(jobs));
  await fs.writeFile(new URL('grants.xml', dir), grantsFeed(grants));
  console.log('Wrote public/feeds/jobs.xml and public/feeds/grants.xml');
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) await main();
