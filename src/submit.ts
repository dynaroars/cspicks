/** Shared entry point; old submission URLs retain their type and edit context. */
import { updatePageMeta } from './seo.js';

const legacyTypes: Record<string, string> = {
  'jobs-submit.html': 'job',
  'grants-submit.html': 'grant',
  'csconfs-submit.html': 'conference',
};
const legacyType = legacyTypes[location.pathname.split('/').pop() || ''];
const params = new URLSearchParams(location.search);

if (legacyType) {
  params.set('type', legacyType);
  location.replace(`submit.html?${params}${location.hash}`);
} else {
  const picker = document.getElementById('submission-type') as HTMLSelectElement;
  const type = params.get('type');
  picker.value = type === 'grant' || type === 'conference' ? type : 'job';
  picker.addEventListener('change', () => {
    // Entity identifiers belong to the previous type and must not carry across.
    location.assign(`submit.html?type=${picker.value}`);
  });
  updatePageMeta({
    title: 'Submit or update an entry - CS Picks',
    description: 'Suggest or update a CS job, award, grant, or conference.',
    path: '/submit.html',
  });
  const loadForm = picker.value === 'grant'
    ? () => import('./grants/submit.js')
    : picker.value === 'conference'
      ? () => import('./csconfs/submit.js')
      : () => import('./jobs/submit.js');
  loadForm().catch(error => {
    console.error('Failed to load submission form:', error);
    document.getElementById('submission-form-root')!.textContent = 'The submission form could not be loaded. Please reload this page to try again.';
  });
}
