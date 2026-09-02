import { GITHUB_REPO, SUBMISSION_EMAIL, buildSubmissionContent, createSubmissionUrlBuilders } from '../src/submission.js';

export { GITHUB_REPO, SUBMISSION_EMAIL };

export function buildConferenceSubmissionContent(submission: unknown) {
  return buildSubmissionContent(submission);
}

const { buildGithubIssueUrl, buildEmailUrl } = createSubmissionUrlBuilders({
  typeLabel: 'conference',
  updateNoun: 'conference schedule update',
  verifyNote: 'Please verify the cited official source before applying this update.',
  emailIntro: 'Here is my proposed conference schedule update. The official source is included in the submission.'
});

export const buildConferenceGithubIssueUrl = buildGithubIssueUrl;
export const buildConferenceEmailUrl = buildEmailUrl;
