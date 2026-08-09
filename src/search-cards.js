import he from 'he';
import { getConferenceAreaMap, schoolAliases } from './data.js';
import { areaLabels, cleanName, escapeHtml, getConferenceLabel, safeExternalUrl } from './shared.js';

function actionAttributes(action, values = {}) {
  return Object.entries({ action, ...values })
    .map(([key, value]) => `data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="${escapeHtml(value)}"`)
    .join(' ');
}

export function getDBLPUrl(originalName) {
  let name = originalName
    .replace(/ Jr\./g, '_Jr.')
    .replace(/ II/g, '_II')
    .replace(/ III/g, '_III')
    .replace(/'|\-|\./g, '=');
  name = he.encode(name, { useNamedReferences: true, allowUnsafeSymbols: true })
    .replace(/&/g, '=')
    .replace(/;/g, '=');

  const parts = name.split(' ');
  let lastName = parts.at(-1);
  if (parseInt(lastName) > 0) {
    const suffix = parts.pop();
    lastName = `${parts.at(-1)}_${suffix}`;
  }
  parts.pop();
  const firstNames = encodeURIComponent(parts.join(' ').replace(/\s/g, '_').replace(/-/g, '='));
  return `https://dblp.org/pers/hd/${lastName[0].toLowerCase()}/${lastName}:${firstNames}`;
}

function renderAffiliationLink(school, yearRange = '') {
  return `<button type="button" class="inline-link" ${actionAttributes('search-query', { query: school })}>${escapeHtml(school)}</button>${yearRange ? ` <span class="affiliation-years">(${escapeHtml(yearRange)})</span>` : ''}`;
}

function renderAffiliations(prof, context) {
  const { historicalMode, historyMap, aliasMap, rawData, startYear, endYear } = context;
  if (!historicalMode || !historyMap?.[prof.name]) return renderAffiliationLink(prof.affiliation);

  const currentYear = new Date().getFullYear();
  const pubYears = new Set(prof.pubs.map(pub => pub.year));
  const schoolsWithPapers = new Set();
  prof.pubs.forEach(pub => {
    historyMap[prof.name]
      .filter(segment => pub.year >= segment.start && pub.year <= segment.end)
      .forEach(segment => schoolsWithPapers.add(aliasMap?.[segment.school] || segment.school));
  });

  const affiliations = new Map();
  historyMap[prof.name].forEach(segment => {
    const hasPapers = Array.from(pubYears).some(year => year >= segment.start && year <= segment.end);
    const significant = segment.end - segment.start + 1 >= 2 || segment.end >= currentYear;
    const school = aliasMap?.[segment.school] || segment.school;
    if (!hasPapers || !significant || segment.end < startYear || segment.start > endYear
      || !rawData.schools?.[school] || !schoolsWithPapers.has(school)) return;

    const existing = affiliations.get(school);
    affiliations.set(school, existing
      ? { start: Math.min(existing.start, segment.start), end: Math.max(existing.end, segment.end) }
      : { start: segment.start, end: segment.end });
  });

  const sorted = [...affiliations.entries()].sort(([, a], [, b]) => b.end - a.end || b.start - a.start);
  if (!sorted.length) return renderAffiliationLink(prof.affiliation);
  const format = ([school, range]) => {
    const endLabel = range.end >= currentYear ? 'current' : range.end;
    return renderAffiliationLink(school, range.start === range.end ? `${range.start}` : `${range.start}–${endLabel}`);
  };
  if (sorted.length === 1) return format(sorted[0]);
  return `${format(sorted[0])}<details class="affiliation-history"><summary>+${sorted.length - 1} more</summary><span>${sorted.slice(1).map(format).join(', ')}</span></details>`;
}

function renderActivityGraph(prof, context) {
  const { startYear, endYear, confSet } = context;
  const activePubs = prof.pubs.filter(pub => pub.year >= startYear && pub.year <= endYear);
  if (!activePubs.length) return '';
  const effectiveStart = Math.min(...activePubs.map(pub => pub.year));
  const effectiveEnd = Math.max(...activePubs.map(pub => pub.year));
  const areaMap = getConferenceAreaMap(confSet);
  const yearStats = {};
  for (let year = effectiveStart; year <= effectiveEnd; year++) yearStats[year] = { count: 0, adjusted: 0, areas: {} };
  activePubs.forEach(pub => {
    const stats = yearStats[pub.year];
    stats.count += pub.count;
    stats.adjusted += pub.adjustedcount;
    const area = areaMap[pub.area] || pub.area;
    if (!stats.areas[area]) stats.areas[area] = { count: 0, adjusted: 0 };
    stats.areas[area].count += pub.count;
    stats.areas[area].adjusted += pub.adjustedcount;
  });
  const maxCount = Math.max(...Object.values(yearStats).map(stats => stats.adjusted));
  if (!maxCount) return '';
  const yearCount = effectiveEnd - effectiveStart + 1;
  const barWidth = yearCount > 20 ? 'minmax(12px, 1fr)' : 'minmax(18px, 1fr)';

  return `
    <div class="activity-graph">
      <h4>Activity (${effectiveStart}-${effectiveEnd})</h4>
      <div class="activity-bars" style="grid-template-columns: repeat(${yearCount}, ${barWidth});">
        ${Object.entries(yearStats).map(([year, stats]) => {
          const breakdown = Object.entries(stats.areas)
            .sort(([, a], [, b]) => b.adjusted - a.adjusted)
            .map(([area, values]) => `${areaLabels[area] || area}: ${Math.ceil(values.count)} ${Math.ceil(values.count) === 1 ? 'paper' : 'papers'} (${values.adjusted.toFixed(1)} adjusted)`)
            .join(', ');
          const paperCount = Math.ceil(stats.count);
          const total = `${paperCount} ${paperCount === 1 ? 'paper' : 'papers'} (${stats.adjusted.toFixed(1)} adjusted)`;
          const tooltip = stats.count ? `${year}: ${total}${breakdown ? ` — ${breakdown}` : ''}` : `${year}: No papers`;
          return `<div class="year-column" data-tooltip="${escapeHtml(tooltip)}"><div class="bar" style="height: ${Math.max(stats.adjusted / maxCount * 100, 2)}%;"></div><div class="year-label">'${year.slice(-2)}</div></div>`;
        }).join('')}
      </div>
    </div>`;
}

export function renderProfessorCard(prof, context) {
  const sortedAreas = Object.entries(prof.areas).sort(([, a], [, b]) => b.adjusted - a.adjusted);
  const exact = cleanName(prof.name).toLowerCase() === context.currentQuery;
  const papers = [...(prof.pubs || [])].sort((a, b) => b.year - a.year);
  const homepage = safeExternalUrl(prof.homepage);
  const scholar = prof.scholarid ? `https://scholar.google.com/citations?user=${encodeURIComponent(prof.scholarid)}` : null;
  const orcid = prof.orcid ? `https://orcid.org/${encodeURIComponent(prof.orcid)}` : null;
  const honors = [
    prof.turingAwardYear ? `<span class="honor-badge honor-turing" title="Turing Award recipient in ${prof.turingAwardYear}">🏆 Turing Award · ${prof.turingAwardYear}</span>` : '',
    prof.acmFellowYear ? `<span class="honor-badge honor-acm" title="Named an ACM Fellow in ${prof.acmFellowYear}">ACM Fellow · ${prof.acmFellowYear}</span>` : ''
  ].filter(Boolean).join('');
  const headerTag = exact ? 'div' : 'button';
  const headerAttributes = exact
    ? ''
    : `type="button" ${actionAttributes('open-target', { targetType: 'researcher', targetName: prof.name })}`;

  return `
    <div class="card${exact ? '' : ' collapsed'}" data-name="${escapeHtml(cleanName(prof.name))}">
      <${headerTag} class="card-header" ${headerAttributes}>
        <span class="professor-heading"><h2>${escapeHtml(cleanName(prof.name))}</h2>${honors ? `<span class="faculty-honors">${honors}</span>` : ''}</span>${exact ? '' : '<span class="toggle-icon" aria-hidden="true">▼</span>'}
      </${headerTag}>
      <div class="card-content">
        <div class="card-subtitle">${renderAffiliations(prof, context)}</div>
        <div class="card-stats"><strong>${prof.totalPapers}</strong> papers (<strong>${prof.totalAdjusted.toFixed(1)}</strong> adjusted)<span class="faculty-funding-stat" data-funding-faculty="${escapeHtml(prof.name)}"></span></div>
        <div class="card-links">
          ${homepage !== '#' ? `<a href="${escapeHtml(homepage)}" target="_blank" rel="noopener noreferrer" class="card-link">Website</a>` : ''}
          ${scholar ? `<a href="${escapeHtml(scholar)}" target="_blank" rel="noopener noreferrer" class="card-link">Google Scholar</a>` : ''}
          ${orcid ? `<a href="${escapeHtml(orcid)}" target="_blank" rel="noopener noreferrer" class="card-link">ORCID</a>` : ''}
          <a href="${escapeHtml(getDBLPUrl(prof.name))}" target="_blank" rel="noopener noreferrer" class="card-link">DBLP</a>
        </div>
        ${prof.unitNotes?.length ? `<div class="faculty-unit-notes">CSRankings unit: ${prof.unitNotes.map(escapeHtml).join(', ')}</div>` : ''}
        ${renderActivityGraph(prof, context)}
        <div class="stats-list">${sortedAreas.map(([area, stats]) => {
          const paperCount = Math.ceil(stats.count);
          return `<div class="stat-item"><button type="button" class="inline-link stat-label" ${actionAttributes('search-query', { query: areaLabels[area] || area })}>${escapeHtml(areaLabels[area] || area)}</button><span class="stat-count">${paperCount} ${paperCount === 1 ? 'paper' : 'papers'} (${stats.adjusted.toFixed(1)} adjusted)</span></div>`;
        }).join('')}</div>
        ${papers.length ? `<button type="button" class="papers-toggle" data-action="toggle-papers">▶ Show Papers</button><div class="papers-list">${papers.map(pub => `<div class="paper-item"><span class="paper-venue">${escapeHtml(getConferenceLabel(pub.area))}</span> <span class="paper-year">${pub.year}</span>: ${pub.count} paper(s), ${pub.adjustedcount.toFixed(2)} adjusted</div>`).join('')}</div>` : ''}
      </div>
    </div>`;
}

function renderSubfieldContributions(school) {
  const contributions = Object.entries(school.areaAdjustedCounts || {})
    .filter(([, value]) => value > 0)
    .map(([area, value]) => ({ area, value, weight: Math.log(value + 1) }))
    .sort((a, b) => b.weight - a.weight);
  const totalWeight = contributions.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return '';
  return `<div class="school-rank-attribution"><details class="attribution-details"><summary class="attribution-summary"><span>Subfield Contributions</span><span class="tooltip-trigger contribution-tooltip" tabindex="0" aria-label="About subfield contributions">ⓘ<span class="tooltip-content">Shows how each research area contributes to the CSRankings geometric-mean score using ln(adjusted count + 1).</span></span></summary><div class="attribution-content">${contributions.map(item => {
    const percentage = item.weight / totalWeight * 100;
    return `<div class="contribution-item"><div class="contribution-info"><span class="contribution-label">${escapeHtml(areaLabels[item.area] || item.area)}</span><span class="contribution-value">${item.value.toFixed(1)} adjusted (${percentage.toFixed(1)}%)</span></div><div class="contribution-bar-container"><div class="contribution-bar" style="width: ${percentage}%;"></div></div></div>`;
  }).join('')}</div></details></div>`;
}

export function renderSchoolCard(school, filterArea, context) {
  const { appData, currentQuery } = context;
  const sortedAreas = filterArea
    ? (school.areas[filterArea] ? [[filterArea, school.areas[filterArea]]] : [])
    : Object.entries(school.areas).sort(([a], [b]) => (school.areaRanks?.[a] || 9999) - (school.areaRanks?.[b] || 9999));
  const exact = school.name.toLowerCase() === currentQuery
    || schoolAliases[currentQuery]?.toLowerCase() === school.name.toLowerCase();
  const faculty = new Set(Object.values(school.areas).flatMap(area => area.faculty));
  const areaCount = Object.values(school.areas).filter(area => area.adjusted > 0).length;
  const departmentHomepage = safeExternalUrl(school.homepage);
  const institutionMetadata = school.countryName || school.country || '';
  const position = Number.isInteger(context.resultPosition)
    ? `<span class="result-position">${context.resultPosition}.</span> `
    : '';
  const headerTag = exact ? 'div' : 'button';
  const headerAttributes = exact
    ? ''
    : `type="button" ${actionAttributes('open-target', { targetType: 'school', targetName: school.name })}`;

  return `<div class="card${exact ? '' : ' collapsed'}" data-name="${escapeHtml(school.name)}">
    <${headerTag} class="card-header" ${headerAttributes}><h2>${position}${escapeHtml(school.name)}<span class="card-badge">${faculty.size} Faculty</span><span class="card-badge">${areaCount} Areas</span></h2>${exact ? '' : '<span class="toggle-icon" aria-hidden="true">▼</span>'}</${headerTag}>
    <div class="card-content">${institutionMetadata || departmentHomepage !== '#' ? `<div class="school-metadata">${institutionMetadata ? `<span>${escapeHtml(institutionMetadata)}</span>` : ''}${departmentHomepage !== '#' ? `<a href="${escapeHtml(departmentHomepage)}" target="_blank" rel="noopener noreferrer">Department website</a>` : ''}</div>` : ''}${renderSubfieldContributions(school)}<div class="stats-list">${sortedAreas.map(([area, data]) => {
      const prefix = filterArea ? '' : (school.areaRanks?.[area] ? `${school.areaRanks[area]}. ` : '');
      const label = areaLabels[area] || getConferenceLabel(area);
      const facultyHtml = data.faculty.sort((a, b) => {
        const adjusted = name => areaLabels[area]
          ? appData.professors[name]?.areas[area]?.adjusted || 0
          : appData.professors[name]?.pubs.filter(pub => pub.area === area).reduce((sum, pub) => sum + pub.adjustedcount, 0) || 0;
        return adjusted(b) - adjusted(a);
      }).map(name => {
        const prof = appData.professors[name];
        const pubs = prof && !areaLabels[area] ? prof.pubs.filter(pub => pub.area === area) : null;
        const count = pubs?.reduce((sum, pub) => sum + pub.count, 0);
        const adjusted = pubs?.reduce((sum, pub) => sum + pub.adjustedcount, 0);
        const paperCount = prof ? Math.ceil(pubs ? count : prof.totalPapers) : 0;
        const adjustedCount = prof ? (pubs ? adjusted : prof.totalAdjusted).toFixed(1) : '0.0';
        const stats = prof ? `<small class="faculty-tag-stats">${paperCount} ${paperCount === 1 ? 'paper' : 'papers'} (${adjustedCount} adjusted)</small>` : '';
        return `<button type="button" class="faculty-tag" ${actionAttributes('professor-at-school', { professorName: name, affiliation: school.name })}><span>${escapeHtml(cleanName(name))}</span> ${stats}</button>`;
      }).join('');
      const paperCount = Math.ceil(data.count);
      return `<div class="school-area-section"><div class="school-area-header"><button type="button" class="inline-link" ${actionAttributes('search-query', { query: areaLabels[area] || area })}>${escapeHtml(prefix + label)}</button><span>${paperCount} ${paperCount === 1 ? 'paper' : 'papers'} (${data.adjusted.toFixed(1)} adjusted)</span></div><div class="faculty-list">${facultyHtml}</div></div>`;
    }).join('')}</div></div></div>`;
}
