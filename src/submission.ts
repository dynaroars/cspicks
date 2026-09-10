export const GITHUB_REPO = 'dynaroars/cspicks';
export const SUBMISSION_EMAIL = 'root@roars.dev';

export function buildSubmissionContent(submission: unknown) {
  return JSON.stringify(submission, null, 2);
}

export function createSubmissionUrlBuilders({ typeLabel, updateNoun, verifyNote, emailIntro }: {
  typeLabel: string;
  updateNoun: string;
  verifyNote: string;
  emailIntro: string;
}) {
  return {
    buildGithubIssueUrl(label: string, content: string) {
      const params = new URLSearchParams({
        title: `CS Picks ${typeLabel} submission: ${label}`,
        body: `## Proposed ${updateNoun}\n\n\`\`\`json\n${content}\n\`\`\`\n\n${verifyNote}`
      });
      return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
    },
    buildEmailUrl(label: string, content: string) {
      const params = new URLSearchParams({
        subject: `CS Picks ${typeLabel} submission: ${label}`,
        body: `Hello CS Picks maintainers,\n\n${emailIntro}\n\n${content}\n`
      });
      return `mailto:${SUBMISSION_EMAIL}?${params.toString()}`;
    }
  };
}
