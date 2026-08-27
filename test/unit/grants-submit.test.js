import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGrantSubmissionContent,
  buildGrantGithubIssueUrl,
  buildGrantEmailUrl
} from '../../src/grants/submission.js';

test('grants submission helper formats reviewable JSON and URLs', () => {
  const submission = {
    submissionType: 'new_award_proposal',
    officialUrl: 'https://example.com/rfp',
    awardName: 'Example Award',
    sponsor: 'Example Sponsor'
  };

  const content = buildGrantSubmissionContent(submission);
  assert.ok(content.includes('"officialUrl": "https://example.com/rfp"'));
  assert.ok(content.includes('"awardName": "Example Award"'));

  const githubUrl = buildGrantGithubIssueUrl('Example Award (https://example.com/rfp)', content);
  assert.ok(githubUrl.startsWith('https://github.com/dynaroars/cspicks/issues/new?'));
  assert.ok(githubUrl.includes('title=CS+Picks+award+submission'));

  const emailUrl = buildGrantEmailUrl('Example Award', content);
  assert.ok(emailUrl.startsWith('mailto:root@roars.dev?'));
  assert.ok(emailUrl.includes('subject=CS+Picks+award+submission'));
});
