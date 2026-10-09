export const GITHUB_REPO = 'dynaroars/cspicks';
export const SUBMISSION_EMAIL = 'root@roars.dev';

export function buildSubmissionContent(submission: unknown) {
  if (submission && typeof submission === 'object' && 'type' in submission &&
      submission.type === 'new' && 'notes' in submission &&
      typeof submission.notes === 'string' && Object.keys(submission).length === 2) {
    return submission.notes;
  }
  return formatSubmissionFields(submission);
}

function fieldLabel(key: string) {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/\burl\b/g, 'URL').replace(/\bid\b/g, 'ID');
}

function formatSubmissionFields(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(formatSubmissionFields).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value !== 'object') return String(value);
  return Object.entries(value)
    .filter(([, entry]) => entry != null && entry !== '' && !(Array.isArray(entry) && !entry.length))
    .map(([key, entry]) => {
      const text = formatSubmissionFields(entry);
      const display = key === 'type' || key === 'submissionType' ? text.replace(/_/g, ' ') : text;
      return `${fieldLabel(key)}:${typeof entry === 'object' && !Array.isArray(entry) ? '\n' : ' '}${display}`;
    }).join('\n\n');
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
        body: `## Proposed ${updateNoun}\n\n${content}\n\n${verifyNote}`
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
