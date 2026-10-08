import { GITHUB_REPO, SUBMISSION_EMAIL, buildSubmissionContent, createSubmissionUrlBuilders } from '../submission.js';

export { GITHUB_REPO, SUBMISSION_EMAIL };

export function buildJobSubmissionContent(submission: unknown) {
  return buildSubmissionContent(submission);
}

const { buildGithubIssueUrl, buildEmailUrl } = createSubmissionUrlBuilders({
  typeLabel: 'job',
  updateNoun: 'US academic CS job posting',
  verifyNote: 'Please verify the posting on the official department or university page before adding it.',
  emailIntro: 'Here is my proposed US academic CS job posting or update:'
});

export const buildJobGithubIssueUrl = buildGithubIssueUrl;
export const buildJobEmailUrl = buildEmailUrl;
