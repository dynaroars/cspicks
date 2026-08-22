export const GITHUB_REPO = 'dynaroars/cspicks';
export const SUBMISSION_EMAIL = 'root@roars.dev';

export function buildGrantSubmissionContent(submission) {
  return JSON.stringify(submission, null, 2);
}

export function buildGrantGithubIssueUrl(label, content) {
  const params = new URLSearchParams({
    title: `CS Picks award submission: ${label}`,
    body: `## Proposed CS award / grant update\n\n\`\`\`json\n${content}\n\`\`\`\n\nPlease verify the cited official URL before applying this update.`
  });
  return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
}

export function buildGrantEmailUrl(label, content) {
  const params = new URLSearchParams({
    subject: `CS Picks award submission: ${label}`,
    body: `Hello CS Picks maintainers,\n\nHere is my proposed CS award / grant update:\n\n${content}\n`
  });
  return `mailto:${SUBMISSION_EMAIL}?${params.toString()}`;
}
