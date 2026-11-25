import test from 'node:test';
import assert from 'node:assert/strict';
import { isLead, leadPriority, matchSchool, mergeSameLink, normalizeUrl, officialLinkFromMirror, postLinks, similarGrants } from '../../scripts/social-leads.mjs';

const fold = name => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|of|at)\b/g, ' ').replace(/\s+/g, ' ').trim();
const schools = ['University of North Carolina', 'University of North Carolina at Charlotte', 'Univ. of California - Santa Barbara', 'Rice University']
  .map(name => ({ name, folded: fold(name).replace(/\buniv\b/g, 'university'), country: 'US' }));

test('job leads keep computing faculty and postdoc ads and drop student, staff, and non-computing posts', () => {
  assert.equal(isLead('jobs', 'Rice University is hiring: Full and Associate Professor Positions in Computer Science #professor #computerscience'), true);
  assert.equal(isLead('jobs', 'Max Planck Institut fur Informatik is hiring: Postdoc in Algorithms and Complexity #postdoc #computerscience'), true);
  assert.equal(isLead('jobs', 'CNRS is hiring: Postdoctoral Researcher in Machine Learning for Turbulent Flow #postdoc #physics'), false);
  assert.equal(isLead('jobs', 'Linkoping University is hiring: PhD Student in Computer Science with a focus on Formal Verification'), false);
  assert.equal(isLead('jobs', 'Freie Universitat Berlin is hiring: Student Assistant in Business Informatics #computerscience'), false);
  assert.equal(isLead('jobs', 'We are recruiting PhD students and a postdoc in computer science!'), true);
});

test('award leads need a call to action and skip winner announcements and paper calls', () => {
  assert.equal(isLead('awards', 'Last call: Amazon Research Awards proposals are due November 11.', true), true);
  assert.equal(isLead('awards', 'Congratulations to the recipient of the 2026 Ken Kennedy Award for computing!', true), false);
  assert.equal(isLead('awards', 'Call for papers: submit your paper on computing by Dec 1 deadline', true), false);
  assert.equal(isLead('awards', 'Fellowship applications are open for biology postdocs, deadline Jan 5', false), false);
  assert.equal(isLead('awards', 'Fellowship applications are open for computer science PhD students, deadline Jan 5', false), true);
});

test('school hints use the bot line exactly and read CSRankings abbreviations, and never widen a vague name to a campus', () => {
  assert.equal(matchSchool('University of North Carolina is hiring: Open Rank Professor', schools).school?.name, 'University of North Carolina');
  assert.equal(matchSchool('University of California, Santa Barbara (@ucsantabarbara.bsky.social) is hiring: Lecturer', schools).school?.name, 'Univ. of California - Santa Barbara');
  assert.equal(matchSchool('The Rice University is hiring:\nAssistant Professor', schools).school?.name, 'Rice University');
  assert.equal(matchSchool('Open rank job at somewhere else', schools).school, null);
  assert.ok(leadPriority('jobs', 'Rice University is hiring: Assistant Professor in Computer Science') > leadPriority('jobs', 'Rice University is hiring: Postdoc in Data Science'));
});

test('links: mirrors yield the official ad, tracking is ignored, and one page is one lead', () => {
  assert.equal(officialLinkFromMirror('<a href="https://tenuretracker.info/x">x</a><a href="https://fonts.googleapis.com/a">f</a><a href="https://apply.interfolio.com/191855">Apply</a>'), 'https://apply.interfolio.com/191855');
  assert.equal(normalizeUrl('https://www.cra.org/awards/?utm_source=bsky#top'), normalizeUrl('http://cra.org/awards'));
  assert.deepEqual(postLinks({ record: { facets: [{ features: [{ uri: 'https://a.edu/job' }, { tag: 'cs' }] }], embed: { external: { uri: 'https://a.edu/job' } } } }), ['https://a.edu/job']);
  const merged = mergeSameLink([
    { sourcePost: 'https://bsky.app/profile/a/post/2', links: ['https://cra.org/awards/?utm_source=x'] },
    { sourcePost: 'https://bsky.app/profile/a/post/1', links: ['https://cra.org/awards'] },
    { sourcePost: 'https://bsky.app/profile/a/post/0', links: [] }
  ]);
  assert.deepEqual(merged.map(lead => [lead.sourcePost, lead.alsoPosted]), [
    ['https://bsky.app/profile/a/post/2', ['https://bsky.app/profile/a/post/1']],
    ['https://bsky.app/profile/a/post/0', []]
  ]);
  assert.deepEqual(similarGrants('Last call: Amazon Research Awards proposals are due', [{ id: 'ara', shortName: 'Amazon Research Awards', name: 'Amazon Research Awards (ARA)' }, { id: 'x', shortName: 'CAREER', name: 'NSF CAREER' }]), ['ara']);
});

test('X post URLs are read from free text, and both X embed formats become leads with the post date and real links', async () => {
  const { tweetIds, tweetFromSyndication, tweetFromOembed } = await import('../../scripts/social-leads.mjs');
  assert.deepEqual(tweetIds('see https://x.com/TTIC_Connect/status/1980343485019611146?s=20 and https://twitter.com/i/web/status/123456789,'
    + ' https://mobile.twitter.com/a_b/statuses/123456789 https://x.com/TTIC_Connect'), ['1980343485019611146', '123456789']);

  const syndicated = tweetFromSyndication({
    id_str: '1980343485019611146', created_at: '2025-10-20T18:40:54.000Z', user: { screen_name: 'TTIC_Connect' },
    text: 'TTIC is hiring tenure-track faculty! Apply by Dec 1: https://t.co/a https://t.co/b',
    entities: { urls: [{ expanded_url: 'https://buff.ly/wv1sA0i' }, { expanded_url: 'https://x.com/TTIC_Connect/status/1980343485019611146/photo/1' }] }
  });
  assert.equal(syndicated?.sourcePost, 'https://x.com/TTIC_Connect/status/1980343485019611146');
  assert.equal(syndicated?.date, '2025-10-20');
  assert.deepEqual(syndicated?.links, ['https://buff.ly/wv1sA0i']);

  const embedded = tweetFromOembed({
    url: 'https://x.com/AlexanderSpangh/status/2125326336483070174',
    html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">I&#39;m hiring &amp; recruiting<br><br>'
      + '<a href="https://x.com/hashtag/CS?src=hash">#CS</a> <a href="https://t.co/9xBMOJmFbP">https://t.co/9xBMOJmFbP</a> '
      + '<a href="https://t.co/pic">pic.twitter.com/pic</a></p>&mdash; Alex Spangher (@AlexanderSpangh) '
      + '<a href="https://x.com/AlexanderSpangh/status/2125326336483070174?ref_src=twsrc%5Etfw">November 24, 2026</a></blockquote>'
  });
  assert.equal(embedded?.date, '2026-11-24');
  assert.equal(embedded?.author, 'AlexanderSpangh');
  assert.match(embedded?.text ?? '', /^I'm hiring & recruiting\n\n#CS https:\/\/t\.co\/9xBMOJmFbP/);
  assert.deepEqual(embedded?.links, ['https://t.co/9xBMOJmFbP']);
  assert.equal(tweetFromOembed({ html: '<p>no url</p>' }), null);
});
