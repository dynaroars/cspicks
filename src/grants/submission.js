import { GITHUB_REPO, SUBMISSION_EMAIL, buildSubmissionContent, createSubmissionUrlBuilders } from '../submission.js';

export { GITHUB_REPO, SUBMISSION_EMAIL };

export function buildGrantSubmissionContent(submission) {
  return buildSubmissionContent(submission);
}

const { buildGithubIssueUrl, buildEmailUrl } = createSubmissionUrlBuilders({
  typeLabel: 'award',
  updateNoun: 'CS award / grant update',
  verifyNote: 'Please verify the cited official URL before applying this update.',
  emailIntro: 'Here is my proposed CS award / grant update:'
});

export const buildGrantGithubIssueUrl = buildGithubIssueUrl;
export const buildGrantEmailUrl = buildEmailUrl;
