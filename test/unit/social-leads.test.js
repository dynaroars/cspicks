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
