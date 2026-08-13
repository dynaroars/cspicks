import he from 'he';
import { schoolAliases } from './data.js';
import { areaLabels, cleanName, countryFlag, escapeHtml, getConferenceLabel, getInstitutionShortName, safeExternalUrl } from './shared.js';

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

// Inline so the icons inherit the theme's text color and cost no extra request.
const profileIcons = {
  website: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"/></svg>',
  scholar: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Z"/><path d="M6 13.2V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.8l-6 3.3-6-3.3Z"/></svg>',
  orcid: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7" y="10" width="1.8" height="7.5"/><circle cx="7.9" cy="7.4" r="1.1"/><path d="M11.2 10h3.4c2.4 0 4 1.6 4 3.7s-1.6 3.8-4 3.8h-3.4V10Zm1.8 1.7v4.1h1.5c1.4 0 2.3-.8 2.3-2s-.9-2.1-2.3-2.1H13Z"/></svg>',
  dblp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M14 4v5h5M8 13h8M8 17h5"/></svg>'
};

function profileLink(url, kind, label) {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="profile-link" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${profileIcons[kind]}</a>`;
}

function renderProfileLinks(prof) {
  const homepage = safeExternalUrl(prof.homepage);
  const links = [
    homepage !== '#' ? profileLink(homepage, 'website', 'Website') : '',
    prof.scholarid ? profileLink(`https://scholar.google.com/citations?user=${encodeURIComponent(prof.scholarid)}`, 'scholar', 'Google Scholar') : '',
    prof.orcid ? profileLink(`https://orcid.org/${encodeURIComponent(prof.orcid)}`, 'orcid', 'ORCID') : '',
    profileLink(getDBLPUrl(prof.name), 'dblp', 'DBLP')
  ].filter(Boolean).join('');
  return `<span class="profile-links">${links}</span>`;
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

export function renderProfessorCard(prof, context) {
  // A professor's flag is their current institution's country.
  const profCountry = context.rawData?.schools?.[prof.affiliation];
  const profRank = Number.isFinite(context.rankOverride) ? context.rankOverride : prof.rank;
  const rankPrefix = context.showRankings && Number.isFinite(profRank)
    ? `<span class="result-position">${profRank}.</span> `
    : '';
  // In an area or conference view the professor's totals are already scoped to
  // it, so the header can say how much of their work landed there.
  const scopedPapers = context.scopedStats
    ? `<span class="card-badge">${prof.totalPapers} ${prof.totalPapers === 1 ? 'paper' : 'papers'} (${prof.totalAdjusted.toFixed(1)} adjusted)</span>`
    : '';
  const sortedAreas = Object.entries(prof.areas).sort(([, a], [, b]) => b.adjusted - a.adjusted);
  const exact = cleanName(prof.name).toLowerCase() === context.currentQuery;
  const papers = [...(prof.pubs || [])].sort((a, b) => b.year - a.year);
  const honors = [
    prof.turingAwardYear ? `<span class="honor-badge honor-turing" title="Turing Award recipient in ${prof.turingAwardYear}">🏆 Turing Award · ${prof.turingAwardYear}</span>` : '',
    prof.acmFellowYear ? `<span class="honor-badge honor-acm" title="Named an ACM Fellow in ${prof.acmFellowYear}">ACM Fellow · ${prof.acmFellowYear}</span>` : ''
  ].filter(Boolean).join('');
  const headerTag = exact ? 'div' : 'button';
  const headerAttributes = exact
    ? ''
    : `type="button" ${actionAttributes('open-target', { targetType: 'researcher', targetName: prof.name })}`;

  const historicalAffiliations = context.historicalMode && context.historyMap?.[prof.name]
    ? renderAffiliations(prof, context)
    : '';

  return `
    <div class="card${exact ? '' : ' collapsed'}" data-name="${escapeHtml(cleanName(prof.name))}">
      <div class="card-header-row">
        <${headerTag} class="card-header" ${headerAttributes}>
          <span class="professor-heading">${rankPrefix}${countryFlag(profCountry?.country, profCountry?.countryName)}<h2>${escapeHtml(cleanName(prof.name))}</h2><span class="professor-affiliation">${escapeHtml(context.compactNames ? getInstitutionShortName(prof.affiliation || '') : (prof.affiliation || ''))}</span>${scopedPapers}${honors ? `<span class="faculty-honors">${honors}</span>` : ''}</span>
        </${headerTag}>
        ${renderProfileLinks(prof)}
      </div>
      <div class="card-content">
        ${historicalAffiliations ? `<div class="card-subtitle">${historicalAffiliations}</div>` : ''}
        <div class="card-stats"><strong>${prof.totalPapers}</strong> papers (<strong>${prof.totalAdjusted.toFixed(1)}</strong> adjusted)</div>
        ${prof.unitNotes?.length ? `<div class="faculty-unit-notes">Unit: ${prof.unitNotes.map(escapeHtml).join(', ')}</div>` : ''}
        <div class="stats-list">${sortedAreas.map(([area, stats]) => {
          const paperCount = Math.ceil(stats.count);
          return `<div class="stat-item"><button type="button" class="inline-link stat-label" ${actionAttributes('search-query', { query: areaLabels[area] || area })}>${escapeHtml(areaLabels[area] || area)}</button><span class="stat-count">${paperCount} ${paperCount === 1 ? 'paper' : 'papers'} (${stats.adjusted.toFixed(1)} adjusted)</span></div>`;
        }).join('')}</div>
        ${papers.length ? `<button type="button" class="papers-toggle" data-action="toggle-papers">▶ Show Papers</button><div class="papers-list">${papers.map(pub => `<div class="paper-item"><span class="paper-venue">${escapeHtml(getConferenceLabel(pub.area))}</span> <span class="paper-year">${pub.year}</span>: ${pub.count} paper(s), ${pub.adjustedcount.toFixed(2)} adjusted</div>`).join('')}</div>` : ''}
      </div>
    </div>`;
}

// These percentages are shares of this one university's own score, so they say
// nothing about how it stands against anyone else — the ranked subfield list
// above is what answers that.
const SCORE_MIX_HELP = 'A univ\'s CSRankings score is the geometric mean of its output across all areas, where each area enters as ln(adjusted pubs + 1). This splits that score into the share each area supplies. The percentages are internal to this univ and always add up to 100%, so a large share means the area drives this univ\'s own score \u2014 not that it leads other univs in that area. For standing against other univs, use the ranked subfield list above.';

function renderSubfieldContributions(school) {
  const contributions = Object.entries(school.areaAdjustedCounts || {})
    .filter(([, value]) => value > 0)
    .map(([area, value]) => ({ area, value, weight: Math.log(value + 1) }))
    .sort((a, b) => b.weight - a.weight);
  const totalWeight = contributions.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return '';
  // Bars are scaled against the largest share, not against 100%. Every area's
  // share is small (the top one is usually under 8%), so drawing each bar at its
  // literal percentage of the width leaves 26 near-identical stubs.
  const topWeight = contributions[0].weight;
  return `<div class="school-rank-attribution"><details class="attribution-details" open><summary class="attribution-summary"><span>Subfield Share of This University's Score</span><span class="tooltip-trigger contribution-tooltip" tabindex="0" aria-label="About this university's score breakdown">ⓘ<span class="tooltip-content">${escapeHtml(SCORE_MIX_HELP)}</span></span></summary><div class="attribution-content">${contributions.map(item => {
    const percentage = item.weight / totalWeight * 100;
    return `<div class="contribution-item"><div class="contribution-info"><span class="contribution-label">${escapeHtml(areaLabels[item.area] || item.area)}</span><span class="contribution-value">${item.value.toFixed(1)} adjusted (${percentage.toFixed(1)}%)</span></div><div class="contribution-bar-container"><div class="contribution-bar" style="width: ${(item.weight / topWeight * 100).toFixed(1)}%;"></div></div></div>`;
  }).join('')}</div></details></div>`;
}

function facultyButton(name, school, stats, rank = null) {
  const paperCount = Math.ceil(stats.count);
  const rankPrefix = Number.isFinite(rank) ? `<span class="faculty-tag-rank">${rank}.</span> ` : '';
  return `<button type="button" class="faculty-tag" ${actionAttributes('professor-at-school', { professorName: name, affiliation: school })}>${rankPrefix}<span>${escapeHtml(cleanName(name))}</span> <small class="faculty-tag-stats">${paperCount} ${paperCount === 1 ? 'paper' : 'papers'} (${stats.adjusted.toFixed(1)} adjusted)</small></button>`;
}

// What one professor contributed to one area at one school. Pre-aggregated by
// the data pipeline; the fallback covers school objects assembled by a search
// (conference views) rather than by `filterByYears`.
function areaFacultyStats(data, area, name, appData) {
  const stored = data.facultyStats?.[name];
  if (stored) return stored;
  const prof = appData.professors[name];
  if (!prof) return { count: 0, adjusted: 0 };
  if (areaLabels[area]) return prof.areas[area] || { count: 0, adjusted: 0 };
  return prof.pubs.filter(pub => pub.area === area).reduce((totals, pub) => ({
    count: totals.count + pub.count,
    adjusted: totals.adjusted + pub.adjustedcount
  }), { count: 0, adjusted: 0 });
}

// The whole department in one list, ordered by output — the view CSRankings
// gives when a university is expanded.
function renderFacultyRoster(school, context) {
  const counts = school.facultyCounts || {};
  const roster = Object.entries(school.facultyAdjustedCounts || {})
    .map(([name, adjusted]) => ({ name, stats: { count: counts[name] || 0, adjusted } }))
    .sort((a, b) => b.stats.adjusted - a.stats.adjusted || cleanName(a.name).localeCompare(cleanName(b.name)));
  if (!roster.length) return '';

  // Ranks tie on the number the tag actually shows, so two people both listed
  // as "3.4 adjusted" never carry different ranks.
  let rank = 0;
  let previous = null;
  roster.forEach(entry => {
    const shown = entry.stats.adjusted.toFixed(1);
    if (shown !== previous) rank += 1;
    entry.rank = rank;
    previous = shown;
  });

  const tags = roster
    .map(entry => facultyButton(entry.name, school.name, entry.stats, context.showRankings ? entry.rank : null))
    .join('');

  // No heading: the card badge already says how many faculty there are.
  return `<div class="school-faculty-roster"><div class="faculty-list">${tags}</div></div>`;
}

export function renderSchoolCard(school, filterArea, context) {
  const { appData, currentQuery } = context;
  const sortedAreas = filterArea
    ? (school.areas[filterArea] ? [[filterArea, school.areas[filterArea]]] : [])
    : Object.entries(school.areas).sort(([a], [b]) => (school.areaRanks?.[a] || 9999) - (school.areaRanks?.[b] || 9999));
  const exact = school.name.toLowerCase() === currentQuery
    || schoolAliases[currentQuery]?.toLowerCase() === school.name.toLowerCase();
  const faculty = new Set(filterArea
    ? (school.areas[filterArea]?.faculty || [])
    : Object.values(school.areas).flatMap(area => area.faculty));
  const areaCount = Object.values(school.areas).filter(area => area.adjusted > 0).length;
  const scopedArea = filterArea ? school.areas[filterArea] : null;
  const badges = filterArea
    ? `<span class="card-badge">${faculty.size} Faculty</span><span class="card-badge">${Math.ceil(scopedArea?.count || 0)} ${Math.ceil(scopedArea?.count || 0) === 1 ? 'paper' : 'papers'} (${(scopedArea?.adjusted || 0).toFixed(1)} adjusted)</span>`
    : `<span class="card-badge">${faculty.size} Faculty</span><span class="card-badge">${areaCount} Areas</span>`;
  const departmentHomepage = safeExternalUrl(school.homepage);
  const institutionMetadata = school.countryName || school.country || '';
  // In an area or conference view the meaningful rank is within that area.
  const rankValue = Number.isFinite(context.rankOverride) ? context.rankOverride : school.rank;
  const rankPrefix = context.showRankings && Number.isFinite(rankValue)
    ? `<span class="result-position">${rankValue}.</span> `
    : '';
  const headerTag = exact ? 'div' : 'button';
  const headerAttributes = exact
    ? ''
    : `type="button" ${actionAttributes('open-target', { targetType: 'school', targetName: school.name })}`;

  return `<div class="card${exact ? '' : ' collapsed'}" data-name="${escapeHtml(school.name)}">
    <${headerTag} class="card-header" ${headerAttributes}><h2>${rankPrefix}${countryFlag(school.country, school.countryName)}${escapeHtml(context.compactNames ? getInstitutionShortName(school.name) : school.name)}${badges}</h2></${headerTag}>
    <div class="card-content">${institutionMetadata || departmentHomepage !== '#' ? `<div class="school-metadata">${institutionMetadata ? `<span>${escapeHtml(institutionMetadata)}</span>` : ''}${departmentHomepage !== '#' ? `<a href="${escapeHtml(departmentHomepage)}" target="_blank" rel="noopener noreferrer">Department website</a>` : ''}</div>` : ''}${filterArea ? '' : renderFacultyRoster(school, context)}<div class="stats-list">${sortedAreas.map(([area, data]) => {
      const prefix = filterArea || !context.showRankings ? '' : (school.areaRanks?.[area] ? `${school.areaRanks[area]}. ` : '');
      const label = areaLabels[area] || getConferenceLabel(area);
      // Each name carries what that person published *in this area*, not their
      // department-wide total.
      const facultyHtml = data.faculty
        .map(name => ({ name, stats: areaFacultyStats(data, area, name, appData) }))
        .sort((a, b) => b.stats.adjusted - a.stats.adjusted || cleanName(a.name).localeCompare(cleanName(b.name)))
        .map(entry => facultyButton(entry.name, school.name, entry.stats))
        .join('');
      const paperCount = Math.ceil(data.count);
      return `<div class="school-area-section"><div class="school-area-header"><button type="button" class="inline-link" ${actionAttributes('search-query', { query: areaLabels[area] || area })}>${escapeHtml(prefix + label)}</button><span>${paperCount} ${paperCount === 1 ? 'paper' : 'papers'} (${data.adjusted.toFixed(1)} adjusted)</span></div><div class="faculty-list">${facultyHtml}</div></div>`;
    }).join('')}</div>${renderSubfieldContributions(school)}</div></div>`;
}
