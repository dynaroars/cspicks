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

/**
 * Find notable cross-school changes between two equal-length ranking periods.
 * Minimum-credit guards keep tiny denominators from dominating growth lists.
 */
export function calculateDiscoveryInsights(currentData, priorData, limit = 5) {
  const schools = Object.values(currentData?.schools || {}).map(school => {
    const prior = priorData?.schools?.[school.name];
    const metrics = calculateSchoolMetrics(currentData, priorData, school.name);
    const priorAreas = Object.values(prior?.areas || {}).filter(area => area.adjusted > 0).length;
    const topArea = Object.entries(school.areas || {})
      .map(([area, values]) => ({ area, credit: values.adjusted || 0 }))
      .sort((a, b) => b.credit - a.credit)[0];
    return {
      name: school.name,
      school,
      prior,
      metrics,
      outputGain: (school.totalAdjusted || 0) - (prior?.totalAdjusted || 0),
      breadthGain: metrics.activeAreas - priorAreas,
      topArea,
      topAreaShare: topArea && school.totalAdjusted > 0
        ? percent(topArea.credit, school.totalAdjusted)
        : 0
    };
  }).filter(item => item.metrics);

  const take = (items, compare) => [...items].sort(compare).slice(0, limit);
  const established = schools.filter(item =>
    item.prior?.rank && item.prior.totalAdjusted >= 2 && item.school.totalAdjusted >= 2
  );
  const substantive = schools.filter(item =>
    item.school.totalAdjusted >= 5 && item.metrics.facultyCount >= 3
  );

  const areaBreakouts = [];
  schools.forEach(item => {
    Object.entries(item.school.areas || {}).forEach(([area, values]) => {
      const currentCredit = values.adjusted || 0;
      const priorCredit = item.prior?.areas?.[area]?.adjusted || 0;
      const gain = currentCredit - priorCredit;
      if (currentCredit >= 2 && gain > 0) {
        areaBreakouts.push({ name: item.name, area, currentCredit, priorCredit, gain });
      }
    });
  });

  return {
    rankClimbers: take(
      established.filter(item => item.metrics.rankDelta > 0),
      (a, b) => b.metrics.rankDelta - a.metrics.rankDelta || a.metrics.rank - b.metrics.rank
    ),
    momentum: take(
      established.filter(item => item.metrics.growth > 0),
      (a, b) => b.metrics.growth - a.metrics.growth || b.outputGain - a.outputGain
    ),
    outputGains: take(
      schools.filter(item => item.outputGain > 0),
      (a, b) => b.outputGain - a.outputGain
    ),
    breadthBuilders: take(
      established.filter(item => item.breadthGain > 0),
      (a, b) => b.breadthGain - a.breadthGain || b.outputGain - a.outputGain
    ),
    balancedPortfolios: take(
      substantive,
      (a, b) => a.metrics.top3Share - b.metrics.top3Share || b.school.totalAdjusted - a.school.totalAdjusted
    ),
    focusedPowerhouses: take(
      substantive,
      (a, b) => b.topAreaShare - a.topAreaShare || b.school.totalAdjusted - a.school.totalAdjusted
    ),
    areaBreakouts: take(areaBreakouts, (a, b) => b.gain - a.gain || b.currentCredit - a.currentCredit)
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
    officialVenueMode: confSet === 'csrankings-default'
  };
}

/**
 * Measure how a school's fractional publication output is distributed across
 * subfields. The denominator is the school's full set of active faculty in the
 * period, rather than only the people who published in a given subfield. This
 * keeps a subfield represented by one person from looking like the school's
 * dominant publishing effort merely because that person's individual rate is
 * high.
 */
export function calculatePublishingEffort(
  professors,
  { startYear, endYear, parentAreas, includesPublication }
) {
  const years = endYear - startYear + 1;
  if (!Number.isFinite(years) || years <= 0) {
    return { activeFaculty: 0, subfields: [] };
  }

  const facultyOutput = [];
  Object.values(professors || {}).forEach(professor => {
    const output = {};
    (professor.pubs || []).forEach(publication => {
      if (publication.year < startYear || publication.year > endYear) return;
      if (!includesPublication(professor, publication)) return;

      const subfield = parentAreas[publication.area] || publication.area;
      const credit = Number(publication.adjustedcount) || 0;
      if (credit > 0) output[subfield] = (output[subfield] || 0) + credit;
    });
    if (Object.keys(output).length) facultyOutput.push(output);
  });

  const activeFaculty = facultyOutput.length;
  if (!activeFaculty) return { activeFaculty: 0, subfields: [] };

  const totals = {};
  const researchers = {};
  facultyOutput.forEach(output => {
    Object.entries(output).forEach(([subfield, credit]) => {
      totals[subfield] = (totals[subfield] || 0) + credit;
      researchers[subfield] = (researchers[subfield] || 0) + 1;
    });
  });

  const subfields = Object.entries(totals).map(([subfield, total]) => ({
    subfield,
    total,
    activeResearchers: researchers[subfield],
    effort: total / activeFaculty / years
  })).sort((a, b) => b.effort - a.effort || a.subfield.localeCompare(b.subfield));

  return { activeFaculty, subfields };
}
