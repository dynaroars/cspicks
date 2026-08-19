export const GITHUB_REPO = 'dynaroars/cspicks';
export const SUBMISSION_EMAIL = 'root@roars.dev';

export function buildConferenceSubmissionContent(submission) {
  return JSON.stringify(submission, null, 2);
}

export function buildConferenceGithubIssueUrl(label, content) {
  const params = new URLSearchParams({
    title: `CS Picks conference submission: ${label}`,
    body: `## Proposed conference schedule update\n\n\`\`\`json\n${content}\n\`\`\`\n\nPlease verify the cited official source before applying this update.`,
  });
  return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
}

export function buildConferenceEmailUrl(label, content) {
  const params = new URLSearchParams({
    subject: `CS Picks conference submission: ${label}`,
    body: `Hello CS Picks maintainers,\n\nHere is my proposed conference schedule update. The official source is included in the submission.\n\n${content}\n`,
  });
  return `mailto:${SUBMISSION_EMAIL}?${params.toString()}`;
}
