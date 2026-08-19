import { CONFERENCE_SET_IDS, assignCompetitionRanks, filterByYears, geometricMeanScore, getConferenceAreaMap, publicationMatchesConferenceSet } from '../data.js';
import { percent } from './math.js';
import { calculateSchoolMetrics } from './school.js';

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

/**
 * The subfield-level counterpart to calculateDiscoveryInsights: instead of
 * asking which universities moved, asks which research areas themselves grew,
 * shrank, broadened, narrowed, or changed leader region-wide. Same
 * equal-length-period comparison and minimum-credit guards.
 */
export function calculateSubfieldDiscoveries(currentData, priorData, limit = 5) {
  const areasOf = data => Object.values(data?.schools || {}).flatMap(school => Object.keys(school.areas || {}));
  const areas = new Set([...areasOf(currentData), ...areasOf(priorData)]);

  const activeSchools = (data, area) => Object.values(data?.schools || {})
    .map(school => ({ name: school.name, credit: school.areas?.[area]?.adjusted || 0 }))
    .filter(row => row.credit > 0);

  const leadersOf = rows => {
    const max = rows.reduce((best, row) => Math.max(best, row.credit), 0);
    return max > 0 ? rows.filter(row => row.credit === max).map(row => row.name) : [];
  };

  const summaries = [...areas].map(area => {
    const current = activeSchools(currentData, area);
    const prior = activeSchools(priorData, area);
    const currentTotal = current.reduce((sum, row) => sum + row.credit, 0);
    const priorTotal = prior.reduce((sum, row) => sum + row.credit, 0);
    const currentLeaders = leadersOf(current);
    const priorLeaders = leadersOf(prior);
    const leaderChanged = priorLeaders.length > 0 && currentLeaders.length > 0
      && !currentLeaders.some(name => priorLeaders.includes(name));

    return {
      area, currentTotal, priorTotal,
      growth: priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal) * 100 : (currentTotal > 0 ? 100 : 0),
      schoolCount: current.length,
      priorSchoolCount: prior.length,
      schoolGain: current.length - prior.length,
      leaderChanged,
      newLeader: currentLeaders[0] || null,
      formerLeader: priorLeaders[0] || null
    };
  });

  const take = (items, compare) => [...items].sort(compare).slice(0, limit);
  // Both periods need at least a small amount of real output, so a subfield
  // with a couple of stray publications doesn't dominate a percentage list.
  const established = summaries.filter(s => s.priorTotal >= 2 && s.currentTotal >= 2);
  const withSpread = summaries.filter(s => s.priorSchoolCount >= 3);

  return {
    growth: take(
      established.filter(s => s.growth > 0),
      (a, b) => b.growth - a.growth || b.currentTotal - a.currentTotal
    ),
    decline: take(
      established.filter(s => s.growth < 0),
      (a, b) => a.growth - b.growth || b.priorTotal - a.priorTotal
    ),
    expandingReach: take(
      withSpread.filter(s => s.schoolGain > 0),
      (a, b) => b.schoolGain - a.schoolGain || b.schoolCount - a.schoolCount
    ),
    narrowingReach: take(
      withSpread.filter(s => s.schoolGain < 0),
      (a, b) => a.schoolGain - b.schoolGain || a.schoolCount - b.schoolCount
    ),
    leadershipChanges: take(
      established.filter(s => s.leaderChanged),
      (a, b) => b.currentTotal - a.currentTotal
    )
  };
}

/**
 * Head-to-head between two research areas: region-wide totals, growth versus
 * the preceding equal-length period, and the universities and researchers
 * active in both - the area-level counterpart to a school-vs-school or
 * researcher-vs-researcher comparison.
 */
export function compareAreas(currentData, priorData, areaA, areaB) {
  const schoolsIn = (data, area) => Object.values(data?.schools || {})
    .map(school => ({ name: school.name, credit: school.areas?.[area]?.adjusted || 0 }))
    .filter(row => row.credit > 0)
    .sort((a, b) => b.credit - a.credit);

  const facultyIn = (data, area) => {
    const names = new Set();
    Object.values(data?.schools || {}).forEach(school => {
      (school.areas?.[area]?.faculty || []).forEach(name => names.add(name));
    });
    return names;
  };

  const totalOf = (data, area) => Object.values(data?.schools || {})
    .reduce((sum, school) => sum + (school.areas?.[area]?.adjusted || 0), 0);

  const sideOf = area => {
    const currentTotal = totalOf(currentData, area);
    const priorTotal = totalOf(priorData, area);
    const currentFaculty = facultyIn(currentData, area);
    const priorFaculty = facultyIn(priorData, area);
    return {
      area,
      currentTotal,
      priorTotal,
      growth: priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal) * 100 : (currentTotal > 0 ? 100 : 0),
      schools: schoolsIn(currentData, area),
      facultyCount: currentFaculty.size,
      // In the field now but not in the preceding period at all - a fresh
      // entrant to the subfield, not just someone publishing more there.
      newFaculty: [...currentFaculty].filter(name => !priorFaculty.has(name)).sort()
    };
  };

  const a = sideOf(areaA);
  const b = sideOf(areaB);

  const facultyA = facultyIn(currentData, areaA);
  const facultyB = facultyIn(currentData, areaB);
  const bothFaculty = [...facultyA].filter(name => facultyB.has(name)).sort();

  const creditBByName = new Map(b.schools.map(row => [row.name, row.credit]));
  const bothSchools = a.schools
    .filter(row => creditBByName.has(row.name))
    .map(row => ({ name: row.name, creditA: row.credit, creditB: creditBByName.get(row.name) }))
    .sort((x, y) => (y.creditA + y.creditB) - (x.creditA + x.creditB));

  return { a, b, bothFaculty, bothSchools };
}

/**
 * The same head-to-head as compareAreas, one level down: two individual venues
 * rather than two research areas. School rollups are keyed by top-level area,
 * so venue totals have to come from each professor's own publication list,
 * where the conference key survives.
 */
export function compareConferences(currentData, priorData, confA, confB) {
  const collect = (data, conf) => {
    const totals = { conf, total: 0, schools: new Map(), faculty: new Set() };
    Object.values(data?.professors || {}).forEach(professor => {
      const credit = (professor.pubs || [])
        .filter(pub => pub.area === conf)
        .reduce((sum, pub) => sum + (Number(pub.adjustedcount) || 0), 0);
      if (credit <= 0) return;
      totals.total += credit;
      totals.faculty.add(professor.name);
      const school = professor.affiliation;
      if (school) totals.schools.set(school, (totals.schools.get(school) || 0) + credit);
    });
    return totals;
  };

  const build = conf => {
    const now = collect(currentData, conf);
    const before = collect(priorData, conf);
    return {
      area: conf,
      currentTotal: now.total,
      priorTotal: before.total,
      growth: before.total > 0
        ? ((now.total - before.total) / before.total) * 100
        : (now.total > 0 ? 100 : 0),
      schools: [...now.schools.entries()]
        .map(([name, credit]) => ({ name, credit }))
        .sort((x, y) => y.credit - x.credit),
      facultyCount: now.faculty.size,
      newFaculty: [...now.faculty].filter(name => !before.faculty.has(name)).sort(),
      faculty: now.faculty
    };
  };

  const a = build(confA);
  const b = build(confB);
  const bothFaculty = [...a.faculty].filter(name => b.faculty.has(name)).sort();
  const creditBByName = new Map(b.schools.map(row => [row.name, row.credit]));
  const bothSchools = a.schools
    .filter(row => creditBByName.has(row.name))
    .map(row => ({ name: row.name, creditA: row.credit, creditB: creditBByName.get(row.name) }))
    .sort((x, y) => (y.creditA + y.creditB) - (x.creditA + x.creditB));

  return { a, b, bothFaculty, bothSchools };
}
