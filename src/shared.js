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
