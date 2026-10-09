import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJobSubmissionContent, buildJobGithubIssueUrl, buildJobEmailUrl } from '../../src/jobs/submission.js';
import { buildGrantSubmissionContent, buildGrantGithubIssueUrl } from '../../src/grants/submission.js';
import { buildConferenceSubmissionContent, buildConferenceGithubIssueUrl } from '../../csconfs/submission.js';

test('quick submissions preserve free text in GitHub issues across all forms', () => {
  const notes = 'https://jobs.tcu.edu/jobs/assistant-professor-of-computer-science-tcu-main-campus-texas-united-states\nPlease add this posting.';
  for (const [contentBuilder, issueBuilder] of [
    [buildJobSubmissionContent, buildJobGithubIssueUrl],
    [buildGrantSubmissionContent, buildGrantGithubIssueUrl],
    [buildConferenceSubmissionContent, buildConferenceGithubIssueUrl]
  ]) {
    const content = contentBuilder({ type: 'new', notes });
    assert.equal(content, notes);
    const body = new URL(issueBuilder('new submission', content)).searchParams.get('body');
    assert.ok(body.includes(`\n\n${notes}\n\n`));
    assert.doesNotMatch(body, /```|"type"|"notes"/);
  }
});

test('detailed job submissions keep lists, flags, and multiline notes readable', () => {
  const content = buildJobSubmissionContent({
    submissionType: 'edit_existing_job',
    existingId: 'example-job',
    areas: ['AI', 'Systems'],
    rolling: true,
    closedOrFilled: false,
    deadline: null,
    additionalNotes: 'Updated deadline.\nSee the official page.'
  });
  assert.match(content, /Submission type: edit existing job/);
  assert.match(content, /Existing ID: example-job/);
  assert.match(content, /Areas: AI, Systems/);
  assert.match(content, /Rolling: Yes/);
  assert.match(content, /Closed or filled: No/);
  assert.doesNotMatch(content, /Deadline/);
  assert.match(content, /Additional notes: Updated deadline\.\nSee the official page\./);
  const email = new URL(buildJobEmailUrl('Example job', content));
  assert.ok(email.searchParams.get('body').includes(content));
});
