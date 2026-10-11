import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubmissionContent, grantSubmission } from '../../src/submission.js';

test('grants submission helper formats readable text and URLs', () => {
  const submission = {
    submissionType: 'new_award_proposal',
    officialUrl: 'https://example.com/rfp',
    awardName: 'Example Award',
    sponsor: 'Example Sponsor'
  };

  const content = buildSubmissionContent(submission);
  assert.ok(content.includes('Official URL: https://example.com/rfp'));
  assert.ok(content.includes('Award name: Example Award'));
  assert.ok(content.includes('Submission type: new award proposal'));

  const githubUrl = grantSubmission.buildGithubIssueUrl('Example Award (https://example.com/rfp)', content);
  assert.ok(githubUrl.startsWith('https://github.com/dynaroars/cspicks/issues/new?'));
  assert.ok(githubUrl.includes('title=CS+Picks+award+submission'));

  const emailUrl = grantSubmission.buildEmailUrl('Example Award', content);
  assert.ok(emailUrl.startsWith('mailto:root@roars.dev?'));
  assert.ok(emailUrl.includes('subject=CS+Picks+award+submission'));
});
