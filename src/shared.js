export const areaLabels = {
  'ai': 'AI',
  'vision': 'Computer Vision',
  'mlmining': 'Machine Learning',
  'nlp': 'NLP',
  'inforet': 'Info Retrieval',
  'arch': 'Architecture',
  'sec': 'Security',
  'mod': 'Databases',
  'da': 'Design Automation',
  'bed': 'Embedded & Real-Time',
  'hpc': 'HPC',
  'mobile': 'Mobile Computing',
  'metrics': 'Measurement',
  'ops': 'Operating Systems',
  'plan': 'Programming Languages',
  'soft': 'Software Engineering',
  'comm': 'Networks',
  'graph': 'Graphics',
  'act': 'Algorithms',
  'crypt': 'Cryptography',
  'log': 'Logic & Verification',
  'bio': 'Comp. Biology',
  'ecom': 'Econ & Computation',
  'chi': 'HCI',
  'robotics': 'Robotics',
  'visualization': 'Visualization',
  'csed': 'CS Education'
};

export const conferenceLabels = {
  pets: 'PETS (Privacy Enhancing Technologies Symposium)'
};

export function getConferenceLabel(key) {
  return conferenceLabels[key] || key.toUpperCase();
}

export function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text: isDark ? '#e0e0e0' : '#666666',
    grid: isDark ? '#3d4043' : '#e5e7eb',
    title: isDark ? '#ffffff' : '#111111'
  };
}

export function updateChartDefaults(Chart) {
  const colors = getChartColors();
  Chart.defaults.color = colors.text;
  Chart.defaults.borderColor = colors.grid;
  Chart.defaults.plugins.title.color = colors.title;
  Chart.defaults.plugins.legend.labels.color = colors.text;
  Chart.defaults.scale.ticks.color = colors.text;
  Chart.defaults.scale.title.color = colors.text;
}

export function cleanName(name) {
  return name.replace(/\s+\d+$/, '');
}

const institutionShortNames = {
  'Carnegie Mellon University': 'CMU',
  'George Mason University': 'GMU',
  'Massachusetts Institute of Technology': 'MIT',
  'Georgia Institute of Technology': 'Georgia Tech',
  'California Inst. of Technology': 'Caltech',
  'University of Illinois at Urbana-Champaign': 'UIUC',
  'Univ. of Illinois at Urbana-Champaign': 'UIUC',
  'University of Maryland, College Park': 'UMD',
  'Univ. of Maryland - College Park': 'UMD',
  'University of Texas at Austin': 'UT Austin',
  'University of Wisconsin - Madison': 'UW–Madison',
  'University of Michigan': 'UMich',
  'University of Pennsylvania': 'Penn',
  'Pennsylvania State University': 'Penn State',
  'University of Southern California': 'USC',
  'University of Washington': 'UW',
  'Virginia Polytechnic Institute and State University': 'Virginia Tech',
  'New York University': 'NYU',
  'University of North Carolina at Chapel Hill': 'UNC',
  'University of Massachusetts Amherst': 'UMass Amherst',
  'University of California, Berkeley': 'UC Berkeley',
  'University of California - Berkeley': 'UC Berkeley',
  'University of California, Los Angeles': 'UCLA',
  'University of California - Los Angeles': 'UCLA',
  'University of California, San Diego': 'UCSD',
  'University of California - San Diego': 'UCSD',
  'University of California, Santa Barbara': 'UCSB',
  'University of California - Santa Barbara': 'UCSB',
  'University of California, Irvine': 'UC Irvine',
  'University of California - Irvine': 'UC Irvine'
};

export function getInstitutionShortName(name) {
  return institutionShortNames[name] || name;
}

export function updateHistoryWarning(elementOrId, enabled) {
  const warning = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId;
  if (!warning) return;

  warning.classList.toggle('history-enabled', enabled);
  if (warning.classList.contains('compact-history-status')) {
    warning.innerHTML = enabled
      ? '⚠ Historical affiliations are estimates and may be incomplete.'
      : 'ⓘ Current affiliations · Past work follows today’s faculty roster.';
    return;
  }
  warning.innerHTML = enabled
    ? '<strong>Estimated historical affiliations.</strong> Publications use OpenAlex and manual year-specific affiliations. Records may be incomplete or incorrect: uncovered years are omitted, while researchers with no history record fall back to their current university.'
    : '<strong>Current-roster view.</strong> Past publications are assigned to each researcher’s current CSRankings university. Results describe today’s roster, not necessarily the university’s actual faculty at that time.';
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Produces a value that is safe inside a quoted inline-handler argument.
// decodeURIComponent() must be used by the handler before consuming it.
export function encodeInlineValue(value) {
  return encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
  } catch {
    return '#';
  }
}
