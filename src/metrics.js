import { filterByYears } from './data.js';

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percent(part, total) {
  return total > 0 ? (part / total) * 100 : 0;
}

function hasProfileValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'noscholarpage' && normalized !== 'nohomepage';
}

export function getSchoolFaculty(filteredData, schoolName) {
  const school = filteredData.schools?.[schoolName];
  if (!school) return [];
  const names = new Set();
  Object.values(school.areas || {}).forEach(area => {
    (area.faculty || []).forEach(name => names.add(name));
  });
  return [...names]
    .map(name => filteredData.professors?.[name])
    .filter(Boolean);
}

export function calculateSchoolMetrics(currentData, priorData, schoolName) {
  const school = currentData.schools?.[schoolName];
  if (!school) return null;
  const prior = priorData?.schools?.[schoolName];
  const faculty = getSchoolFaculty(currentData, schoolName);
  const contributions = faculty.map(prof => prof.totalAdjusted || 0).sort((a, b) => b - a);
  const total = school.totalAdjusted || 0;
  const priorTotal = prior?.totalAdjusted || 0;
  const growth = priorTotal > 0 ? ((total - priorTotal) / priorTotal) * 100 : (total > 0 ? 100 : 0);
  const rankDelta = prior?.rank && school.rank ? prior.rank - school.rank : null;
  const activeAreas = Object.entries(school.areas || {}).filter(([, area]) => area.adjusted > 0);
  const sustainedAreas = activeAreas.filter(([area]) => (prior?.areas?.[area]?.adjusted || 0) > 0).length;
  const profileFields = faculty.length * 2;
  const profileFieldsPresent = faculty.reduce((sum, prof) => sum + hasProfileValue(prof.homepage) + hasProfileValue(prof.scholarid), 0);
  const profileCoverage = percent(profileFieldsPresent, profileFields);
  const confidence = profileCoverage >= 80 ? 'High' : profileCoverage >= 50 ? 'Medium' : 'Review';

  return {
    rank: school.rank,
    rankDelta,
    totalAdjusted: total,
    growth,
    facultyCount: faculty.length,
    medianPerFaculty: median(contributions),
    top1Share: percent(contributions[0] || 0, total),
    top3Share: percent(contributions.slice(0, 3).reduce((sum, value) => sum + value, 0), total),
    top5Share: percent(contributions.slice(0, 5).reduce((sum, value) => sum + value, 0), total),
    activeAreas: activeAreas.length,
    sustainedAreas,
    topTenAreas: activeAreas.filter(([area]) => (school.areaRanks?.[area] || Infinity) <= 10).length,
    collaborationRetention: percent(total, school.totalCount || 0),
    impliedTeamSize: total > 0 ? (school.totalCount || 0) / total : 0,
    profileCoverage,
    confidence
  };
}

export function buildPriorPeriodData(rawData, startYear, endYear, region, historyMap, aliasMap, confSet) {
  const span = endYear - startYear + 1;
  return filterByYears(rawData, startYear - span, startYear - 1, region, historyMap, aliasMap, confSet);
}

export function explainRankGap(schoolA, schoolB) {
  const areas = new Set([
    ...Object.keys(schoolA?.areaAdjustedCounts || {}),
    ...Object.keys(schoolB?.areaAdjustedCounts || {})
  ]);
  return [...areas].map(area => {
    const a = schoolA?.areaAdjustedCounts?.[area] || 0;
    const b = schoolB?.areaAdjustedCounts?.[area] || 0;
    const logGap = Math.log1p(a) - Math.log1p(b);
    return { area, a, b, logGap, leader: logGap >= 0 ? 'a' : 'b' };
  }).sort((x, y) => Math.abs(y.logGap) - Math.abs(x.logGap));
}

export function calculateParityReport(rawData, filteredData, confSet = 'csrankings-default') {
  const schools = Object.values(filteredData.schools || {});
  const professors = Object.values(filteredData.professors || {});
  const totalMismatches = schools.filter(school => {
    const areaTotal = Object.values(school.areas || {}).reduce((sum, area) => sum + area.adjusted, 0);
    return Math.abs(areaTotal - school.totalAdjusted) > 1e-6;
  }).length;
  const sorted = [...schools].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const rankOrderIssues = sorted.filter((school, index) => index > 0 && school.score > sorted[index - 1].score).length;
  const institutionCoverage = percent(
    schools.filter(school => school.country || school.region).length,
    schools.length
  );
  const profileCoverage = percent(
    professors.filter(prof => hasProfileValue(prof.homepage) || hasProfileValue(prof.scholarid)).length,
    professors.length
  );

  return {
    sourceFaculty: Object.keys(rawData.professors || {}).length,
    rankedSchools: schools.length,
    totalMismatches,
    rankOrderIssues,
    institutionCoverage,
    profileCoverage,
    officialVenueMode: confSet === 'csrankings-default',
    fractionalCredit: true
  };
}

export function rankingsToCsv(filteredData) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['Rank', 'University', 'Score', 'Raw publications', 'Fractional credit', 'Active areas']];
  Object.values(filteredData.schools || {})
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .forEach(school => rows.push([
      school.rank,
      school.name,
      school.score,
      school.totalCount.toFixed(2),
      school.totalAdjusted.toFixed(2),
      Object.values(school.areas || {}).filter(area => area.adjusted > 0).length
    ]));
  return rows.map(row => row.map(quote).join(',')).join('\n');
}
