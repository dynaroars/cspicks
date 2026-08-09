import { filterByYears, getConferenceAreaMap, publicationMatchesConferenceSet } from './data.js';

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
  const contributions = faculty
    .map(prof => school.facultyAdjustedCounts
      ? school.facultyAdjustedCounts[prof.name] || 0
      : prof.totalAdjusted || 0)
    .sort((a, b) => b - a);
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
  const regionalAreaTotals = {};
  let regionalTotal = 0;
  Object.values(currentData?.schools || {}).forEach(school => {
    regionalTotal += school.totalAdjusted || 0;
    Object.entries(school.areas || {}).forEach(([area, values]) => {
      regionalAreaTotals[area] = (regionalAreaTotals[area] || 0) + (values.adjusted || 0);
    });
  });

  const schools = Object.values(currentData?.schools || {}).map(school => {
    const prior = priorData?.schools?.[school.name];
    const metrics = calculateSchoolMetrics(currentData, priorData, school.name);
    const priorAreas = Object.values(prior?.areas || {}).filter(area => area.adjusted > 0).length;
    const topArea = Object.entries(school.areas || {})
      .map(([area, values]) => ({ area, credit: values.adjusted || 0 }))
      .sort((a, b) => b.credit - a.credit)[0];
    const focusArea = Object.entries(school.areas || {})
      .map(([area, values]) => {
        const credit = values.adjusted || 0;
        const portfolioShare = percent(credit, school.totalAdjusted || 0);
        const regionalBaseline = percent(regionalAreaTotals[area] || 0, regionalTotal);
        return {
          area,
          credit,
          regionalShare: percent(credit, regionalAreaTotals[area] || 0),
          portfolioShare,
          regionalBaseline,
          specialization: regionalBaseline > 0 ? portfolioShare / regionalBaseline : 0,
          areaRank: school.areaRanks?.[area] || null
        };
      })
      .filter(area => area.credit >= 2 && area.areaRank && area.areaRank <= 25)
      .sort((a, b) => b.specialization - a.specialization || b.regionalShare - a.regionalShare)[0];
    return {
      name: school.name,
      school,
      prior,
      metrics,
      outputGain: (school.totalAdjusted || 0) - (prior?.totalAdjusted || 0),
      breadthGain: metrics.activeAreas - priorAreas,
      topArea,
      focusArea,
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
  const portfolioSchools = schools.filter(item =>
    item.school.totalAdjusted >= 5 && item.metrics.facultyCount >= 5
  );

  const areaBreakouts = [];
  const areaDeclines = [];
  schools.forEach(item => {
    const areas = new Set([
      ...Object.keys(item.school.areas || {}),
      ...Object.keys(item.prior?.areas || {})
    ]);
    areas.forEach(area => {
      const currentCredit = item.school.areas?.[area]?.adjusted || 0;
      const priorCredit = item.prior?.areas?.[area]?.adjusted || 0;
      const gain = currentCredit - priorCredit;
      if (currentCredit >= 2 && gain > 0) {
        areaBreakouts.push({ name: item.name, area, currentCredit, priorCredit, gain });
      }
      if (priorCredit >= 2 && gain < 0) {
        areaDeclines.push({ name: item.name, area, currentCredit, priorCredit, gain });
      }
    });
  });

  return {
    rankClimbers: take(
      established.filter(item => item.metrics.rankDelta > 0),
      (a, b) => b.metrics.rankDelta - a.metrics.rankDelta || a.metrics.rank - b.metrics.rank
    ),
    rankDroppers: take(
      established.filter(item => item.metrics.rankDelta < 0),
      (a, b) => a.metrics.rankDelta - b.metrics.rankDelta || a.metrics.rank - b.metrics.rank
    ),
    momentum: take(
      established.filter(item => item.metrics.growth > 0),
      (a, b) => b.metrics.growth - a.metrics.growth || b.outputGain - a.outputGain
    ),
    slowdowns: take(
      established.filter(item => item.metrics.growth < 0),
      (a, b) => a.metrics.growth - b.metrics.growth || a.outputGain - b.outputGain
    ),
    outputGains: take(
      schools.filter(item => item.outputGain > 0),
      (a, b) => b.outputGain - a.outputGain
    ),
    outputLosses: take(
      schools.filter(item => item.prior && item.outputGain < 0),
      (a, b) => a.outputGain - b.outputGain
    ),
    breadthBuilders: take(
      established.filter(item => item.breadthGain > 0),
      (a, b) => b.breadthGain - a.breadthGain || b.outputGain - a.outputGain
    ),
    breadthContractions: take(
      established.filter(item => item.breadthGain < 0),
      (a, b) => a.breadthGain - b.breadthGain || a.outputGain - b.outputGain
    ),
    balancedPortfolios: take(
      portfolioSchools,
      (a, b) => a.metrics.top3Share - b.metrics.top3Share || b.school.totalAdjusted - a.school.totalAdjusted
    ),
    focusedPowerhouses: take(
      substantive.filter(item => item.focusArea),
      (a, b) => b.focusArea.specialization - a.focusArea.specialization || b.focusArea.regionalShare - a.focusArea.regionalShare
    ),
    areaBreakouts: take(areaBreakouts, (a, b) => b.gain - a.gain || b.currentCredit - a.currentCredit),
    areaDeclines: take(areaDeclines, (a, b) => a.gain - b.gain || b.priorCredit - a.priorCredit)
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

function sumBy(items, value) {
  return items.reduce((total, item) => total + value(item), 0);
}

function topEntry(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
}

function cosineSimilarity(first, second) {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  let dot = 0;
  let firstLength = 0;
  let secondLength = 0;
  keys.forEach(key => {
    const a = first[key] || 0;
    const b = second[key] || 0;
    dot += a * b;
    firstLength += a * a;
    secondLength += b * b;
  });
  return firstLength && secondLength ? dot / Math.sqrt(firstLength * secondLength) : 0;
}

/** Individual patterns based only on eligible CSRankings aggregate rows. */
export function calculateResearcherPatterns(professor, peers = {}, options = {}) {
  if (!professor) return null;
  const startYear = Number(options.startYear);
  const endYear = Number(options.endYear);
  const confSet = options.confSet || 'csrankings-default';
  const areaMap = options.areaMap || getConferenceAreaMap(confSet);
  const publications = (professor.pubs || []).filter(pub =>
    pub.year >= startYear && pub.year <= endYear && publicationMatchesConferenceSet(pub, confSet)
  );
  if (!publications.length) return null;

  const yearly = {};
  const areas = {};
  const venues = {};
  publications.forEach(pub => {
    if (!yearly[pub.year]) yearly[pub.year] = { count: 0, adjusted: 0 };
    yearly[pub.year].count += pub.count || 0;
    yearly[pub.year].adjusted += pub.adjustedcount || 0;
    const area = areaMap[pub.area] || pub.area;
    areas[area] = (areas[area] || 0) + (pub.adjustedcount || 0);
    if (!venues[pub.area]) venues[pub.area] = { count: 0, adjusted: 0, years: new Set() };
    venues[pub.area].count += pub.count || 0;
    venues[pub.area].adjusted += pub.adjustedcount || 0;
    venues[pub.area].years.add(pub.year);
  });

  const activeYears = Object.keys(yearly).map(Number).sort((a, b) => a - b);
  const selectedYears = Math.max(1, endYear - startYear + 1);
  const totalAdjusted = sumBy(publications, pub => pub.adjustedcount || 0);
  const totalPapers = sumBy(publications, pub => pub.count || 0);
  const peak = Object.entries(yearly).sort(([, a], [, b]) => b.adjusted - a.adjusted)[0];
  let activeStreak = 1;
  for (let index = activeYears.length - 1; index > 0 && activeYears[index] - activeYears[index - 1] === 1; index--) activeStreak++;

  const recentStart = Math.max(startYear, endYear - 2);
  const priorStart = Math.max(startYear, recentStart - 3);
  const recentAdjusted = sumBy(publications.filter(pub => pub.year >= recentStart), pub => pub.adjustedcount || 0);
  const priorAdjusted = sumBy(publications.filter(pub => pub.year >= priorStart && pub.year < recentStart), pub => pub.adjustedcount || 0);
  const momentum = priorAdjusted > 0 ? ((recentAdjusted - priorAdjusted) / priorAdjusted) * 100 : null;
  const annualValues = Array.from({ length: selectedYears }, (_, index) => yearly[startYear + index]?.adjusted || 0);
  const annualMean = sumBy(annualValues, value => value) / selectedYears;
  const annualVariance = sumBy(annualValues, value => (value - annualMean) ** 2) / selectedYears;
  const volatility = annualMean > 0 ? Math.sqrt(annualVariance) / annualMean : 0;

  const primaryArea = topEntry(areas);
  const areaShares = Object.values(areas).map(value => value / totalAdjusted).filter(value => value > 0);
  const entropy = areaShares.length > 1
    ? -sumBy(areaShares, share => share * Math.log(share)) / Math.log(areaShares.length)
    : 0;
  const midpoint = Math.floor((startYear + endYear) / 2);
  const periodAreas = range => {
    const counts = {};
    publications.filter(range).forEach(pub => {
      const area = areaMap[pub.area] || pub.area;
      counts[area] = (counts[area] || 0) + (pub.adjustedcount || 0);
    });
    return counts;
  };
  const earlyAreas = periodAreas(pub => pub.year <= midpoint);
  const recentAreas = periodAreas(pub => pub.year > midpoint);
  const earlyPrimary = topEntry(earlyAreas);
  const recentPrimary = topEntry(recentAreas);
  const pivot = earlyPrimary && recentPrimary && earlyPrimary[0] !== recentPrimary[0]
    && earlyPrimary[1] >= 0.5 && recentPrimary[1] >= 0.5
    ? { from: earlyPrimary[0], to: recentPrimary[0], midpoint }
    : null;
  const emergingAreas = Object.keys(recentAreas).filter(area => (recentAreas[area] || 0) >= 0.5 && !(earlyAreas[area] > 0));
  const dormantAreas = Object.keys(earlyAreas).filter(area => (earlyAreas[area] || 0) >= 0.5 && !(recentAreas[area] > 0));

  const topVenue = Object.entries(venues).sort(([, a], [, b]) => b.adjusted - a.adjusted)[0] || null;
  const venueConcentration = topVenue ? percent(topVenue[1].adjusted, totalAdjusted) : 0;
  const mostPersistentVenue = Object.entries(venues).sort(([, a], [, b]) => b.years.size - a.years.size || b.adjusted - a.adjusted)[0] || null;
  const earlyVenues = {};
  const recentVenues = {};
  publications.forEach(pub => {
    const target = pub.year <= midpoint ? earlyVenues : recentVenues;
    target[pub.area] = (target[pub.area] || 0) + (pub.adjustedcount || 0);
  });
  const earlyTopVenue = topEntry(earlyVenues);
  const recentTopVenue = topEntry(recentVenues);
  const venueShift = earlyTopVenue && recentTopVenue && earlyTopVenue[0] !== recentTopVenue[0]
    ? { from: earlyTopVenue[0], to: recentTopVenue[0] }
    : null;

  const peerList = Object.values(peers).filter(peer => peer.name !== professor.name && peer.totalAdjusted > 0);
  const currentTotal = professor.totalAdjusted ?? totalAdjusted;
  const percentile = peerList.length
    ? percent(peerList.filter(peer => peer.totalAdjusted <= currentTotal).length, peerList.length)
    : null;
  const similarPeers = peerList.map(peer => ({
    name: peer.name,
    affiliation: peer.affiliation,
    similarity: cosineSimilarity(areas, Object.fromEntries(Object.entries(peer.areas || {}).map(([area, values]) => [area, values.adjusted || 0])))
  })).filter(peer => peer.similarity > 0).sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name)).slice(0, 3);

  const highlights = [];
  if (pivot) highlights.push(`Primary research emphasis shifted between the earlier and later halves of the selected period.`);
  if (momentum !== null && Math.abs(momentum) >= 25) highlights.push(`Recent three-year adjusted output is ${Math.abs(momentum).toFixed(0)}% ${momentum > 0 ? 'higher' : 'lower'} than the preceding three-year window.`);
  if (primaryArea && percent(primaryArea[1], totalAdjusted) >= 60) highlights.push(`${percent(primaryArea[1], totalAdjusted).toFixed(0)}% of adjusted output is concentrated in one research area.`);
  if (!highlights.length && activeYears.length >= 3) highlights.push(`Eligible publications appear in ${activeYears.length} of ${selectedYears} selected years.`);

  return {
    publications, yearly, totalAdjusted, totalPapers, activeYears,
    consistency: percent(activeYears.length, selectedYears), activeStreak,
    peak: peak ? { year: Number(peak[0]), ...peak[1] } : null,
    recentAdjusted, priorAdjusted, momentum, volatility,
    areas, breadth: Object.keys(areas).length, primaryArea,
    primaryAreaShare: primaryArea ? percent(primaryArea[1], totalAdjusted) : 0,
    balance: entropy * 100, pivot, emergingAreas, dormantAreas,
    venues, venueBreadth: Object.keys(venues).length, topVenue,
    venueConcentration, mostPersistentVenue, venueShift,
    percentile, similarPeers, highlights
  };
}
