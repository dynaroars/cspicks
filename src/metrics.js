import { CONFERENCE_SET_IDS, assignCompetitionRanks, filterByYears, geometricMeanScore, getConferenceAreaMap, publicationMatchesConferenceSet } from './data.js';

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
/**
 * Growth of a school's areas measured against the same areas across every
 * ranked school in the selection. Raw growth says little on its own — a 40%
 * rise means something different when the whole field rose 35%.
 */
export function calculateAreaMomentum(current, prior, schoolName, { minAdjusted = 2, limit = 4 } = {}) {
  const currentSchool = current?.schools?.[schoolName];
  if (!currentSchool) return [];
  const priorSchool = prior?.schools?.[schoolName];

  const fieldTotals = data => {
    const totals = {};
    Object.values(data?.schools || {}).forEach(school => {
      Object.entries(school.areaAdjustedCounts || {}).forEach(([area, value]) => {
        totals[area] = (totals[area] || 0) + value;
      });
    });
    return totals;
  };
  const growth = (now, before) => before > 0 ? ((now - before) / before) * 100 : null;

  const fieldNow = fieldTotals(current);
  const fieldBefore = fieldTotals(prior);

  return Object.entries(currentSchool.areaAdjustedCounts || {})
    .map(([area, value]) => {
      const before = priorSchool?.areaAdjustedCounts?.[area] || 0;
      return {
        area,
        current: value,
        prior: before,
        growth: growth(value, before),
        fieldGrowth: growth(fieldNow[area] || 0, fieldBefore[area] || 0)
      };
    })
    .filter(entry => entry.growth !== null && entry.fieldGrowth !== null
      && entry.current >= minAdjusted && entry.prior >= minAdjusted)
    .map(entry => ({ ...entry, delta: entry.growth - entry.fieldGrowth }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

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

  // Peers are only useful as "where else could I work on this?", so colleagues
  // at the target's own university are excluded from both rankings.
  const peerList = Object.values(peers).filter(peer =>
    peer.name !== professor.name && peer.totalAdjusted > 0 && peer.affiliation !== professor.affiliation);

  const similarPeers = peerList
    .map(peer => ({
      name: peer.name,
      affiliation: peer.affiliation,
      similarity: cosineSimilarity(areas,
        Object.fromEntries(Object.entries(peer.areas || {}).map(([area, values]) => [area, values.adjusted || 0])))
    }))
    .filter(peer => peer.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name))
    .slice(0, 3);

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
    similarPeers, highlights
  };
}

/**
 * The settings a ranking is computed under are choices, not facts: how many
 * years to look back, and which venues to count. Sweeping them shows how much
 * of a rank is the department and how much is the knobs.
 *
 * Region is deliberately held fixed. A rank among US schools and a rank among
 * world schools are answers to different questions, and pooling them into one
 * range would mix a scope choice into a methodology range.
 */
export const RANK_STABILITY_WINDOWS = [5, 10, 20, 30];

export function rankStabilityVariants(endYear) {
  return RANK_STABILITY_WINDOWS.flatMap(span => CONFERENCE_SET_IDS.map(confSet => ({
    key: `${span}|${confSet}`,
    span,
    confSet,
    // Inclusive, matching every other year range in the app: a 5-year window
    // ending in 2026 is 2022–2026, not 2021–2026.
    startYear: endYear - span + 1,
    endYear
  })));
}

/**
 * One sweep run. Returns every school's rank under this variant, so a single
 * pass over the data serves every school rather than one.
 */
export function collectVariantRanks(rawData, variant, { region, historyMap, aliasMap }) {
  const data = filterByYears(rawData, variant.startYear, variant.endYear, region, historyMap, aliasMap, variant.confSet);
  const ranks = {};
  let ranked = 0;
  Object.values(data.schools).forEach(school => {
    if (!school.name || !Number.isFinite(school.rank)) return;
    ranks[school.name] = school.rank;
    ranked++;
  });
  return { key: variant.key, variant, ranks, ranked };
}

/**
 * Collapse the sweep into one school's rank envelope. `samples` are the
 * `collectVariantRanks` results; variants where the school never ranks are
 * reported rather than silently dropped.
 */
export function summarizeRankStability(samples, schoolName) {
  const rows = samples.map(sample => ({
    span: sample.variant.span,
    confSet: sample.variant.confSet,
    rank: sample.ranks[schoolName] ?? null,
    of: sample.ranked
  }));
  const ranked = rows.filter(row => Number.isFinite(row.rank));
  if (!ranked.length) return null;

  const values = ranked.map(row => row.rank);
  const best = Math.min(...values);
  const worst = Math.max(...values);
  return {
    rows,
    best,
    worst,
    spread: worst - best,
    // A rank is an integer position: an even sample count would otherwise
    // report a half-place ("#12.5"), which is not a rank anyone can occupy.
    median: Math.round(median(values)),
    settings: rows.length,
    unranked: rows.length - ranked.length,
    // A rank that barely moves is a property of the department; one that swings
    // across tens of places is mostly an artifact of the settings.
    stable: worst - best <= Math.max(3, Math.round(best * 0.25))
  };
}

const formatAdjusted = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

/**
 * Decide the one line a reader should be able to stop at. "Leads in N areas"
 * measures breadth; the headline measure — rank for schools, adjusted output
 * for researchers — measures size. The two can disagree, and saying so is the
 * most useful thing on the page: it is exactly the depth-versus-breadth
 * tradeoff a single ordered list hides.
 *
 * Returns the decision only, so the branches can be tested without markup.
 */
export function describeVerdict(type, entryA, entryB, aWins, bWins) {
  const headline = type === 'school'
    // Rank is the headline for a school, and lower wins.
    ? {
      leader: entryA.rank === entryB.rank ? null : (entryA.rank < entryB.rank ? 'a' : 'b'),
      phrase: `#${entryA.rank} vs #${entryB.rank}`,
      verb: 'ranks higher'
    }
    : (() => {
      // Compare at the precision the sentence quotes, or a 12.44-vs-12.35 pair
      // reads as "12.4 vs 12.4 adjusted" while naming a leader.
      const shownA = Math.round(Number(entryA.totalAdjusted || 0) * 10);
      const shownB = Math.round(Number(entryB.totalAdjusted || 0) * 10);
      return {
        leader: shownA === shownB ? null : (shownA > shownB ? 'a' : 'b'),
        phrase: `${formatAdjusted(entryA.totalAdjusted)} vs ${formatAdjusted(entryB.totalAdjusted)} adjusted`,
        verb: 'has more output'
      };
    })();
  const areaLeader = aWins === bWins ? null : (aWins > bWins ? 'a' : 'b');
  const kind = !headline.leader && !areaLeader ? 'even'
    : !headline.leader ? 'breadth-only'
      : !areaLeader || headline.leader === areaLeader ? 'agree'
        : 'split';
  return { ...headline, areaLeader, kind };
}

/**
 * Adjusted output per publishing faculty member.
 *
 * The geometric mean of Eq. (1) sums over areas, so it rewards a department for
 * being large as well as for being productive. Dividing by headcount asks a
 * different question — how much does the average member of this department
 * publish — and surfaces small departments that volume-weighted ranking buries.
 *
 * Departments below `minFaculty` are excluded rather than ranked: with two or
 * three people the ratio is dominated by one person and means little.
 */
export function calculatePerCapita(filteredData, { minFaculty = 5 } = {}) {
  const rows = Object.values(filteredData?.schools || {})
    .map(school => {
      const facultyCount = Object.keys(school.facultyAdjustedCounts || {}).length;
      return {
        name: school.name,
        school,
        facultyCount,
        overallRank: school.rank,
        perCapita: facultyCount ? (school.totalAdjusted || 0) / facultyCount : 0
      };
    })
    .filter(row => row.name && row.facultyCount >= minFaculty);
  return assignCompetitionRanks(rows, row => row.perCapita);
}

/**
 * How many departures it would take to move a department out of the top N.
 *
 * Removing faculty changes only this department's score, so every other
 * department's score is fixed and a hypothetical rank is a lookup. At each step
 * we remove whichever remaining member costs the department the most score,
 * which is not simply the most prolific one: because the score is a geometric
 * mean over areas, losing the only person in a thin area can cost more than
 * losing a bigger producer in a crowded one.
 *
 * This is a structural measure of concentration, not a claim about any
 * individual's worth, and it is reported per department rather than per person.
 */
export function calculateFragility(filteredData, schoolName, {
  thresholds = [10, 25, 50],
  maxRemovals = 15,
  // Keep going past the last threshold so the trajectory shows a curve rather
  // than a single point for departments already outside every band.
  minSteps = 5
} = {}) {
  const school = filteredData?.schools?.[schoolName];
  if (!school || !Number.isFinite(school.rank)) return null;

  // Per-person, per-area credit, accumulated by the data pipeline.
  const contributions = {};
  Object.entries(school.areas || {}).forEach(([area, data]) => {
    Object.entries(data.facultyStats || {}).forEach(([name, stats]) => {
      if (!contributions[name]) contributions[name] = {};
      contributions[name][area] = (contributions[name][area] || 0) + (stats.adjusted || 0);
    });
  });
  const names = Object.keys(contributions);
  if (!names.length) return null;

  const otherScores = Object.values(filteredData.schools)
    .filter(other => other.name !== schoolName && Number.isFinite(other.score))
    .map(other => other.score);
  const rankOf = score => 1 + otherScores.filter(other => other > score).length;

  let areaCounts = { ...school.areaAdjustedCounts };
  const remaining = new Set(names);
  const steps = [];
  const exits = {};
  // A department already outside a threshold needs no departures to leave it.
  thresholds.forEach(threshold => { if (school.rank > threshold) exits[threshold] = 0; });

  for (let removed = 1; removed <= maxRemovals && remaining.size; removed++) {
    let best = null;
    for (const name of remaining) {
      const trial = { ...areaCounts };
      Object.entries(contributions[name]).forEach(([area, adjusted]) => {
        trial[area] = Math.max(0, (trial[area] || 0) - adjusted);
      });
      // Compare on the unrounded mean: in a large department every single
      // departure moves the reported score by less than the 0.1 it rounds to,
      // so choosing on the rounded value would tie every candidate and remove
      // an arbitrary person instead of the costliest one.
      const exact = geometricMeanScore(trial);
      if (!best || exact < best.exact) best = { name, exact, counts: trial };
    }
    areaCounts = best.counts;
    remaining.delete(best.name);
    // Ranking is against other departments' rounded scores, so report rounded.
    const score = Math.round(10 * best.exact) / 10;
    const rank = rankOf(score);
    steps.push({ removed: best.name, score, rank });
    thresholds.forEach(threshold => {
      if (!(threshold in exits) && rank > threshold) exits[threshold] = removed;
    });
    if (thresholds.every(threshold => threshold in exits) && steps.length >= minSteps) break;
  }

  return { rank: school.rank, score: school.score, facultyCount: names.length, steps, exits, thresholds };
}
