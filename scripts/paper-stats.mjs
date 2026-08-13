// Every number in paper/main.tex comes from this script, run against the live
// CSRankings inputs via the same modules the site ships.
//
//   node scripts/paper-stats.mjs   ->  paper/stats.json
//
// Figures drift as CSRankings updates upstream; re-run before submitting and
// reconcile the tables in paper/main.tex against the regenerated JSON.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFERENCE_SET_IDS, DEFAULT_END_YEAR, coreAMap, coreAStarMap, filterByYears, getConferenceAreaMap, loadData, nextTier, parentMap } from '../src/data.js';
import { buildPriorPeriodData, calculateFragility, calculatePerCapita, calculateResearcherPatterns, calculateSchoolMetrics, calculateSubfieldDiscoveries, collectVariantRanks, compareAreas, describeVerdict, explainRankGap, rankStabilityVariants, summarizeRankStability } from '../src/metrics.js';
import { buildFundingIndex, calculateFundingDiscoveries } from '../src/nsf.js';
import { areaLabels, cleanName, getInstitutionShortName } from '../src/shared.js';

const raw = await loadData();
const out = {};

// --- 1. Dataset scale -------------------------------------------------------
const profs = Object.values(raw.professors);
const pubRecords = profs.reduce((n, p) => n + p.pubs.length, 0);
const years = profs.flatMap(p => p.pubs.map(pub => pub.year)).filter(Number.isFinite);
out.dataset = {
  professors: profs.length,
  schools: Object.keys(raw.schools).length,
  publicationRecords: pubRecords,
  minYear: years.reduce((a, b) => Math.min(a, b), Infinity),
  maxYear: years.reduce((a, b) => Math.max(a, b), -Infinity),
  withHomepage: profs.filter(p => p.homepage && !/nohomepage/i.test(p.homepage)).length,
  withScholar: profs.filter(p => p.scholarid && !/noscholarpage/i.test(p.scholarid)).length
};

// --- 2. Rank stability across all schools ----------------------------------
const region = 'us';
const variants = rankStabilityVariants(DEFAULT_END_YEAR);
const t0 = Date.now();
const samples = variants.map(v => collectVariantRanks(raw, v, { region, historyMap: null, aliasMap: null }));
out.sweepMs = Date.now() - t0;

const baseline = samples.find(s => s.variant.span === 10 && s.variant.confSet === 'csrankings-default');
const schoolNames = Object.keys(baseline.ranks);
const summaries = schoolNames
  .map(name => ({ name, baseline: baseline.ranks[name], ...summarizeRankStability(samples, name) }))
  .filter(s => s && Number.isFinite(s.baseline));

const spreads = summaries.map(s => s.spread).sort((a, b) => a - b);
const q = p => spreads[Math.floor((spreads.length - 1) * p)];
const topN = n => summaries.filter(s => s.baseline <= n);
out.stability = {
  region,
  settings: variants.length,
  schools: summaries.length,
  spreadMedian: q(0.5),
  spreadQ1: q(0.25),
  spreadQ3: q(0.75),
  spreadMax: spreads.at(-1),
  shareSpreadOver10: summaries.filter(s => s.spread > 10).length / summaries.length * 100,
  shareSpreadOver25: summaries.filter(s => s.spread > 25).length / summaries.length * 100,
  top10: { n: topN(10).length, medianSpread: median(topN(10).map(s => s.spread)) },
  top25: { n: topN(25).length, medianSpread: median(topN(25).map(s => s.spread)) },
  top50: { n: topN(50).length, medianSpread: median(topN(50).map(s => s.spread)) },
  // Do the top-10 under one setting stay in the top 10 under all of them?
  alwaysTop10: topN(10).filter(s => s.worst <= 10).length,
  examples: ['Carnegie Mellon University', 'George Mason University', 'Univ. of Illinois at Urbana-Champaign',
    'Massachusetts Institute of Technology', 'University of California - Irvine', 'Northeastern University']
    .map(name => summaries.find(s => s.name === name))
    .filter(Boolean)
    .map(s => ({ name: s.name, baseline: s.baseline, best: s.best, worst: s.worst, spread: s.spread, median: s.median }))
};

// --- 3. Venue-set sensitivity (H5) ------------------------------------------
// Kendall tau-b and top-k overlap between conference sets at a fixed window.
function kendallTau(pairs) {
  let concordant = 0, discordant = 0, tiedA = 0, tiedB = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const da = pairs[i][0] - pairs[j][0];
      const db = pairs[i][1] - pairs[j][1];
      if (da === 0 && db === 0) continue;
      if (da === 0) { tiedA++; continue; }
      if (db === 0) { tiedB++; continue; }
      if (da * db > 0) concordant++; else discordant++;
    }
  }
  const n0 = concordant + discordant;
  return (concordant - discordant) / Math.sqrt((n0 + tiedA) * (n0 + tiedB));
}
function median(v) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const atTen = confSet => samples.find(s => s.variant.span === 10 && s.variant.confSet === confSet).ranks;
out.venueSensitivity = [];
for (let i = 0; i < CONFERENCE_SET_IDS.length; i++) {
  for (let j = i + 1; j < CONFERENCE_SET_IDS.length; j++) {
    const a = atTen(CONFERENCE_SET_IDS[i]);
    const b = atTen(CONFERENCE_SET_IDS[j]);
    const shared = Object.keys(a).filter(name => name in b);
    const pairs = shared.map(name => [a[name], b[name]]);
    const top10 = (ranks) => new Set(Object.entries(ranks).filter(([, r]) => r <= 10).map(([n]) => n));
    const [ta, tb] = [top10(a), top10(b)];
    const overlap = [...ta].filter(n => tb.has(n)).length;
    out.venueSensitivity.push({
      a: CONFERENCE_SET_IDS[i], b: CONFERENCE_SET_IDS[j],
      shared: shared.length,
      tau: kendallTau(pairs),
      medianAbsRankChange: median(pairs.map(([x, y]) => Math.abs(x - y))),
      maxAbsRankChange: pairs.reduce((m, [x, y]) => Math.max(m, Math.abs(x - y)), 0),
      top10Overlap: overlap,
      top10Jaccard: overlap / new Set([...ta, ...tb]).size
    });
  }
}

// --- 4. Concentration (H2) --------------------------------------------------
const current = filterByYears(raw, DEFAULT_END_YEAR - 10, DEFAULT_END_YEAR, region, null, null, 'csrankings-default');
const ranked = Object.values(current.schools).filter(s => Number.isFinite(s.rank));
const conc = ranked.map(s => ({ name: s.name, rank: s.rank, ...calculateSchoolMetrics(current, current, s.name) }))
  .filter(s => s.facultyCount >= 5);
out.concentration = {
  schools: conc.length,
  medianTop3Share: median(conc.map(s => s.top3Share)),
  medianTop1Share: median(conc.map(s => s.top1Share)),
  shareTop3Over50: conc.filter(s => s.top3Share > 50).length / conc.length * 100,
  top25MedianTop3: median(conc.filter(s => s.rank <= 25).map(s => s.top3Share)),
  tailMedianTop3: median(conc.filter(s => s.rank > 100).map(s => s.top3Share)),
  medianFaculty: median(conc.map(s => s.facultyCount))
};

// --- 5. Per-faculty ordering vs the CSRankings ordering ---------------------
const perCapita = calculatePerCapita(current);
const pcByName = new Map(perCapita.map(row => [row.name, row]));
const pcPairs = perCapita.filter(row => Number.isFinite(row.overallRank)).map(row => [row.overallRank, row.rank]);
const csTop10 = perCapita.filter(row => row.overallRank <= 10).map(row => row.name);
const pcTop10 = perCapita.filter(row => row.rank <= 10).map(row => row.name);
out.perCapita = {
  schools: perCapita.length,
  minFaculty: 5,
  tau: kendallTau(pcPairs),
  medianAbsRankChange: median(pcPairs.map(([a, b]) => Math.abs(a - b))),
  maxAbsRankChange: pcPairs.reduce((m, [a, b]) => Math.max(m, Math.abs(a - b)), 0),
  csTop10RetainedInPcTop10: csTop10.filter(name => pcByName.get(name).rank <= 10).length,
  csTop10Size: csTop10.length,
  top10: perCapita.slice(0, 10).map(row => ({
    name: row.name, perCapita: row.perCapita, faculty: row.facultyCount, overallRank: row.overallRank, pcRank: row.rank
  })),
  // Departments that gain the most from being measured by rate rather than volume.
  biggestGains: [...perCapita].filter(r => Number.isFinite(r.overallRank))
    .sort((a, b) => (b.overallRank - b.rank) - (a.overallRank - a.rank)).slice(0, 5)
    .map(r => ({ name: r.name, overallRank: r.overallRank, pcRank: r.rank, faculty: r.facultyCount }))
};

// --- 6. Fragility -----------------------------------------------------------
const bandOf = rank => (rank <= 10 ? 10 : rank <= 25 ? 25 : rank <= 50 ? 50 : null);
const frag = [];
for (const school of ranked) {
  const band = bandOf(school.rank);
  if (!band) continue;
  const f = calculateFragility(current, school.name);
  if (!f || f.facultyCount < 5) continue;
  const metrics = calculateSchoolMetrics(current, current, school.name);
  frag.push({ name: school.name, rank: school.rank, band, faculty: f.facultyCount,
    departures: f.exits[band], top3Share: metrics.top3Share });
}
const withExit = frag.filter(f => Number.isFinite(f.departures) && f.departures > 0);
const byBand = band => withExit.filter(f => f.band === band).map(f => f.departures);
out.fragility = {
  schools: frag.length,
  resolved: withExit.length,
  unresolved: frag.length - withExit.length,
  medianDepartures: median(withExit.map(f => f.departures)),
  oneDeparture: withExit.filter(f => f.departures === 1).length,
  twoOrFewer: withExit.filter(f => f.departures <= 2).length,
  byBand: {
    10: { n: byBand(10).length, median: median(byBand(10)) },
    25: { n: byBand(25).length, median: median(byBand(25)) },
    50: { n: byBand(50).length, median: median(byBand(50)) }
  },
  // Fragility should track concentration; report both for the departments where
  // a single departure is enough.
  singleDepartureMedianTop3: median(withExit.filter(f => f.departures === 1).map(f => f.top3Share)),
  resilientMedianTop3: median(withExit.filter(f => f.departures >= 4).map(f => f.top3Share)),
  examples: ['Rice University', 'Carnegie Mellon University', 'George Mason University', 'Massachusetts Inst. of Technology', 'Northeastern University']
    .map(name => frag.find(f => f.name === name)).filter(Boolean)
};

// --- 7. Venue-set movers, named ---------------------------------------------
// The pairwise correlations above are aggregates. These are the departments a
// reader would actually notice moving when the venue set changes.
const short = name => getInstitutionShortName(name);
const rankUnder = Object.fromEntries(CONFERENCE_SET_IDS.map(id => [id, atTen(id)]));
const venueRows = schoolNames
  .map(name => ({
    name,
    short: short(name),
    ranks: Object.fromEntries(CONFERENCE_SET_IDS.map(id => [id, rankUnder[id][name] ?? null]))
  }))
  .filter(row => CONFERENCE_SET_IDS.every(id => Number.isFinite(row.ranks[id])));

const defaultVsCoreShift = row => row.ranks.core - row.ranks['csrankings-default'];
out.venueMovers = {
  schools: venueRows.length,
  // Departments CORE A* treats most differently from the CSRankings default.
  towardCore: [...venueRows].sort((a, b) => defaultVsCoreShift(a) - defaultVsCoreShift(b)).slice(0, 8)
    .map(r => ({ ...r, shift: defaultVsCoreShift(r) })),
  awayFromCore: [...venueRows].sort((a, b) => defaultVsCoreShift(b) - defaultVsCoreShift(a)).slice(0, 8)
    .map(r => ({ ...r, shift: defaultVsCoreShift(r) })),
  // The four top-tens side by side: same field, four defensible venue lists.
  topTens: Object.fromEntries(CONFERENCE_SET_IDS.map(id => [
    id,
    Object.entries(rankUnder[id]).filter(([, r]) => r <= 10)
      .sort((a, b) => a[1] - b[1]).map(([name, r]) => ({ name, short: short(name), rank: r }))
  ]))
};

// --- 7b. What the venue sets actually disagree about ------------------------
// The rank movement above has a cause, and it is visible in the venue lists
// themselves rather than in any ranking.
const csDefaultMap = Object.fromEntries(Object.entries(parentMap).filter(([id]) => !nextTier[id]));
const coreAllMap = { ...coreAStarMap, ...coreAMap };
const venueSets = {
  'csrankings-default': csDefaultMap,
  csrankings: parentMap,
  core: coreAStarMap,
  'core-a': coreAllMap
};
const perAreaCount = map => Object.values(map).reduce((acc, area) => {
  acc[area] = (acc[area] || 0) + 1;
  return acc;
}, {});
const allAreas = [...new Set(Object.values(parentMap).concat(Object.values(coreAllMap)))];
const counts = Object.fromEntries(Object.entries(venueSets).map(([id, map]) => [id, perAreaCount(map)]));

// CSRankings and CORE A* disagree venue by venue, not just in size.
const csOnly = Object.keys(parentMap).filter(id => !coreAStarMap[id]);
const aStarOnly = Object.keys(coreAStarMap).filter(id => !parentMap[id]);
out.venueComposition = {
  sizes: Object.fromEntries(Object.entries(venueSets).map(([id, map]) => [id, Object.keys(map).length])),
  sharedCsAStar: Object.keys(parentMap).filter(id => coreAStarMap[id]).length,
  csOnlyCount: csOnly.length,
  aStarOnlyCount: aStarOnly.length,
  // Areas CORE A* covers with no venue at all: under Eq. 1 they contribute a
  // factor of exactly 1 to every department, so the area stops discriminating.
  areasWithoutAStar: allAreas.filter(a => !counts.core[a]).map(a => ({
    area: a, label: areaLabels[a] || a, defaultVenues: counts['csrankings-default'][a] || 0
  })).sort((x, y) => y.defaultVenues - x.defaultVenues),
  perArea: allAreas.map(a => ({
    area: a, label: areaLabels[a] || a,
    default: counts['csrankings-default'][a] || 0,
    all: counts.csrankings[a] || 0,
    aStar: counts.core[a] || 0,
    aAndAStar: counts['core-a'][a] || 0,
    csOnly: csOnly.filter(id => parentMap[id] === a),
    aStarOnly: aStarOnly.filter(id => coreAStarMap[id] === a)
  })).sort((x, y) => (y.csOnly.length + y.aStarOnly.length) - (x.csOnly.length + x.aStarOnly.length)),
  agreeExactly: allAreas.filter(a =>
    !csOnly.some(id => parentMap[id] === a) && !aStarOnly.some(id => coreAStarMap[id] === a))
    .map(a => areaLabels[a] || a)
};

// Does a department's exposure to the dropped areas predict how far it falls?
const aStarData = filterByYears(raw, DEFAULT_END_YEAR - 10, DEFAULT_END_YEAR, region, null, null, 'core');
const droppedAreas = out.venueComposition.areasWithoutAStar.map(r => r.area);
const exposure = Object.values(current.schools)
  .filter(s => Number.isFinite(s.rank) && Number.isFinite(aStarData.schools[s.name]?.rank))
  .map(s => {
    const inDropped = droppedAreas.reduce((sum, a) => sum + (s.areaAdjustedCounts?.[a] || 0), 0);
    return {
      name: s.name, short: short(s.name),
      defaultRank: s.rank, aStarRank: aStarData.schools[s.name].rank,
      shift: aStarData.schools[s.name].rank - s.rank,
      droppedShare: s.totalAdjusted ? (inDropped / s.totalAdjusted) * 100 : 0
    };
  });
const pearson = (xs, ys) => {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); dx += (x - mx) ** 2; dy += (ys[i] - my) ** 2; });
  return num / Math.sqrt(dx * dy);
};
const heavy = exposure.filter(r => r.droppedShare >= 20);
const light = exposure.filter(r => r.droppedShare < 10);
out.venueComposition.droppedAreaExposure = {
  schools: exposure.length,
  medianDroppedShare: median(exposure.map(r => r.droppedShare)),
  correlation: pearson(exposure.map(r => r.droppedShare), exposure.map(r => r.shift)),
  heavy: { n: heavy.length, medianShift: median(heavy.map(r => r.shift)) },
  light: { n: light.length, medianShift: median(light.map(r => r.shift)) },
  mostExposed: [...exposure].sort((a, b) => b.droppedShare - a.droppedShare).slice(0, 6)
};

// --- 8. The two departmental orderings, side by side ------------------------
const bySchoolRank = Object.values(current.schools).filter(s => Number.isFinite(s.rank))
  .sort((a, b) => a.rank - b.rank);
out.perCapita.sideBySide = Array.from({ length: 15 }, (_, i) => {
  const cs = bySchoolRank[i];
  const pc = perCapita[i];
  return {
    position: i + 1,
    csName: cs?.name ?? null,
    csShort: cs ? short(cs.name) : null,
    csScore: cs?.score ?? null,
    pcName: pc?.name ?? null,
    pcShort: pc ? short(pc.name) : null,
    pcValue: pc?.perCapita ?? null,
    pcFaculty: pc?.facultyCount ?? null,
    // Where the per-capita leader sits in the CSRankings order, and vice versa.
    pcOverallRank: pc?.overallRank ?? null,
    csPerCapitaRank: cs ? (pcByName.get(cs.name)?.rank ?? null) : null
  };
});
out.perCapita.top10.forEach(row => { row.short = short(row.name); });
out.perCapita.biggestGains.forEach(row => { row.short = short(row.name); });
out.stability.examples.forEach(row => { row.short = short(row.name); });
out.fragility.examples.forEach(row => { row.short = short(row.name); });

// --- 9. Researchers ---------------------------------------------------------
const areaLabelOf = area => areaLabels[area] || area;
const profs10 = Object.values(current.professors).filter(p => (p.totalAdjusted || 0) > 0);
const profTotal = profs10.reduce((sum, p) => sum + p.totalAdjusted, 0);
const byOutput = [...profs10].sort((a, b) => b.totalAdjusted - a.totalAdjusted);
const areaShareOf = professor => {
  const values = Object.values(professor.areas || {}).map(a => a.adjusted || 0);
  const top = values.reduce((m, v) => Math.max(m, v), 0);
  return professor.totalAdjusted ? (top / professor.totalAdjusted) * 100 : 0;
};
const primaryAreaOf = professor => Object.entries(professor.areas || {})
  .sort(([, a], [, b]) => (b.adjusted || 0) - (a.adjusted || 0))[0]?.[0] ?? null;

const cumulative = (n) => byOutput.slice(0, n).reduce((sum, p) => sum + p.totalAdjusted, 0) / profTotal * 100;
const researcherRow = p => ({
  name: cleanName(p.name),
  affiliation: p.affiliation,
  short: short(p.affiliation),
  adjusted: p.totalAdjusted,
  papers: p.totalPapers ?? Math.ceil(p.totalCount || 0),
  breadth: Object.keys(p.areas || {}).length,
  primaryArea: areaLabelOf(primaryAreaOf(p)),
  primaryShare: areaShareOf(p),
  rank: p.rank
});

// Per-area leaders: the single most prolific researcher in each subfield.
const areaKeys = [...new Set(Object.values(current.schools).flatMap(s => Object.keys(s.areaAdjustedCounts || {})))].sort();
const leaderIn = area => profs10
  .map(p => ({ p, credit: p.areas?.[area]?.adjusted || 0 }))
  .filter(row => row.credit > 0)
  .sort((a, b) => b.credit - a.credit)[0];

out.researchers = {
  population: profs10.length,
  totalAdjusted: profTotal,
  medianBreadth: median(profs10.map(p => Object.keys(p.areas || {}).length)),
  medianAdjusted: median(profs10.map(p => p.totalAdjusted)),
  // Concentration of output across individuals, the researcher-level analogue
  // of the departmental concentration result.
  top1PercentShare: cumulative(Math.round(profs10.length * 0.01)),
  top5PercentShare: cumulative(Math.round(profs10.length * 0.05)),
  top10PercentShare: cumulative(Math.round(profs10.length * 0.10)),
  singleAreaShare: profs10.filter(p => Object.keys(p.areas || {}).length === 1).length / profs10.length * 100,
  specialistShare: profs10.filter(p => areaShareOf(p) >= 60).length / profs10.length * 100,
  generalistShare: profs10.filter(p => Object.keys(p.areas || {}).length >= 4).length / profs10.length * 100,
  top: byOutput.slice(0, 15).map(researcherRow),
  // Breadth at the top: the most prolific researchers who are also the widest.
  broadest: [...byOutput.slice(0, 300)].sort((a, b) =>
    Object.keys(b.areas || {}).length - Object.keys(a.areas || {}).length
    || b.totalAdjusted - a.totalAdjusted).slice(0, 8).map(researcherRow),
  areaLeaders: areaKeys.map(area => {
    const row = leaderIn(area);
    if (!row) return null;
    return {
      area, label: areaLabelOf(area),
      name: cleanName(row.p.name),
      affiliation: row.p.affiliation,
      short: short(row.p.affiliation),
      credit: row.credit,
      overallRank: row.p.rank
    };
  }).filter(Boolean)
};

// A researcher profile, as the analysis panel computes it.
const areaMap10 = getConferenceAreaMap('csrankings-default');
const patternOf = name => {
  const professor = raw.professors[name];
  if (!professor) return null;
  const patterns = calculateResearcherPatterns(professor, current.professors, {
    startYear: DEFAULT_END_YEAR - 10, endYear: DEFAULT_END_YEAR, confSet: 'csrankings-default', areaMap: areaMap10
  });
  if (!patterns) return null;
  return {
    name: cleanName(name),
    affiliation: professor.affiliation,
    short: short(professor.affiliation),
    adjusted: patterns.totalAdjusted,
    papers: patterns.totalPapers,
    breadth: patterns.breadth,
    primaryArea: patterns.primaryArea ? areaLabelOf(patterns.primaryArea[0]) : null,
    primaryShare: patterns.primaryAreaShare,
    balance: patterns.balance,
    consistency: patterns.consistency,
    momentum: patterns.momentum,
    volatility: patterns.volatility,
    venueBreadth: patterns.venueBreadth,
    venueConcentration: patterns.venueConcentration,
    topVenue: patterns.topVenue ? patterns.topVenue[0] : null,
    peakYear: patterns.peak?.year ?? null,
    pivot: patterns.pivot ? { from: areaLabelOf(patterns.pivot.from), to: areaLabelOf(patterns.pivot.to) } : null,
    emergingAreas: (patterns.emergingAreas || []).map(areaLabelOf),
    similarPeers: (patterns.similarPeers || []).map(peer => ({
      name: cleanName(peer.name), short: short(peer.affiliation), similarity: peer.similarity
    }))
  };
};
// Profiled researchers are drawn from the head of the output ordering, so the
// table is reproducible from the data rather than hand-picked.
out.researchers.profiles = byOutput.slice(0, 6).map(p => patternOf(p.name)).filter(Boolean);

// --- 10. Fields -------------------------------------------------------------
const prior = buildPriorPeriodData(raw, DEFAULT_END_YEAR - 10, DEFAULT_END_YEAR, region, null, null, 'csrankings-default');
const areaTotal = (data, area) => Object.values(data.schools)
  .reduce((sum, s) => sum + (s.areas?.[area]?.adjusted || 0), 0);
const areaSchools = (data, area) => Object.values(data.schools)
  .map(s => ({ name: s.name, short: short(s.name), credit: s.areas?.[area]?.adjusted || 0 }))
  .filter(row => row.credit > 0).sort((a, b) => b.credit - a.credit);
const areaFaculty = (data, area) => new Set(Object.values(data.schools)
  .flatMap(s => s.areas?.[area]?.faculty || [])).size;

const fieldRows = areaKeys.map(area => {
  const total = areaTotal(current, area);
  const before = areaTotal(prior, area);
  const schools = areaSchools(current, area);
  const top5 = schools.slice(0, 5).reduce((sum, s) => sum + s.credit, 0);
  return {
    area, label: areaLabelOf(area), total, prior: before,
    growth: before > 0 ? ((total - before) / before) * 100 : null,
    schools: schools.length,
    faculty: areaFaculty(current, area),
    perFaculty: areaFaculty(current, area) ? total / areaFaculty(current, area) : 0,
    leader: schools[0] ? { name: schools[0].name, short: schools[0].short, credit: schools[0].credit } : null,
    runnerUp: schools[1] ? { short: schools[1].short, credit: schools[1].credit } : null,
    // How much of a subfield's national output sits in five departments.
    top5Share: total ? (top5 / total) * 100 : 0
  };
}).sort((a, b) => b.total - a.total);

const subfields = calculateSubfieldDiscoveries(current, prior, 6);
out.fields = {
  areas: fieldRows.length,
  rows: fieldRows,
  totalAdjusted: fieldRows.reduce((sum, r) => sum + r.total, 0),
  medianTop5Share: median(fieldRows.map(r => r.top5Share)),
  growth: subfields.growth.map(r => ({ label: areaLabelOf(r.area), ...r })),
  decline: subfields.decline.map(r => ({ label: areaLabelOf(r.area), ...r })),
  leadershipChanges: subfields.leadershipChanges.map(r => ({
    label: areaLabelOf(r.area),
    newLeader: r.newLeader ? short(r.newLeader) : null,
    formerLeader: r.formerLeader ? short(r.formerLeader) : null,
    currentTotal: r.currentTotal, growth: r.growth
  })),
  // Two subfields head to head, as the area-comparison view reports them.
  headToHead: (() => {
    const cmp = compareAreas(current, prior, 'mlmining', 'plan');
    const side = s => ({
      label: areaLabelOf(s.area), total: s.currentTotal, prior: s.priorTotal, growth: s.growth,
      schools: s.schools.length, faculty: s.facultyCount, newFaculty: s.newFaculty.length,
      top3: s.schools.slice(0, 3).map(r => ({ short: short(r.name), credit: r.credit }))
    });
    return { a: side(cmp.a), b: side(cmp.b), bothFaculty: cmp.bothFaculty.length,
      bothSchools: cmp.bothSchools.slice(0, 5).map(r => ({ short: short(r.name), creditA: r.creditA, creditB: r.creditB })) };
  })()
};

// --- 11. Head-to-head comparisons -------------------------------------------
// Reimplements the per-area margin loop the comparison view renders, which
// lives in the DOM layer and cannot be imported outside a browser.
function headToHead(type, entryA, entryB, nameA, nameB) {
  if (!entryA || !entryB) return null;
  const allAreas = [...new Set([...Object.keys(entryA.areas || {}), ...Object.keys(entryB.areas || {})])];
  const rows = allAreas.map(area => ({
    area, label: areaLabelOf(area),
    a: entryA.areas[area]?.adjusted || 0,
    b: entryB.areas[area]?.adjusted || 0
  })).map(r => ({ ...r, margin: r.a - r.b })).sort((x, y) => (y.a + y.b) - (x.a + x.b));
  const aWins = rows.filter(r => r.margin > 0).length;
  const bWins = rows.filter(r => r.margin < 0).length;
  const verdict = describeVerdict(type, entryA, entryB, aWins, bWins);
  return {
    type,
    a: { name: nameA, short: type === 'school' ? short(nameA) : cleanName(nameA) },
    b: { name: nameB, short: type === 'school' ? short(nameB) : cleanName(nameB) },
    scoreboard: type === 'school'
      ? {
        rank: [entryA.rank, entryB.rank],
        papers: [Math.ceil(entryA.totalCount), Math.ceil(entryB.totalCount)],
        adjusted: [entryA.totalAdjusted, entryB.totalAdjusted],
        faculty: [Object.keys(entryA.facultyAdjustedCounts || {}).length, Object.keys(entryB.facultyAdjustedCounts || {}).length],
        areasLed: [aWins, bWins]
      }
      : {
        affiliation: [entryA.affiliation, entryB.affiliation],
        papers: [entryA.totalPapers ?? Math.ceil(entryA.totalCount), entryB.totalPapers ?? Math.ceil(entryB.totalCount)],
        adjusted: [entryA.totalAdjusted, entryB.totalAdjusted],
        activeAreas: [Object.keys(entryA.areas || {}).length, Object.keys(entryB.areas || {}).length],
        areasLed: [aWins, bWins]
      },
    verdict: { kind: verdict.kind, phrase: verdict.phrase, leader: verdict.leader, areaLeader: verdict.areaLeader },
    topAreas: rows.slice(0, 8),
    rankGap: type === 'school'
      ? explainRankGap(entryA, entryB).slice(0, 5).map(r => ({ label: areaLabelOf(r.area), a: r.a, b: r.b, logGap: r.logGap, leader: r.leader }))
      : null
  };
}
const s = name => current.schools[name];
out.comparisons = {
  // A split decision: one department ranks higher, the other leads more areas.
  schools: [
    headToHead('school', s('Univ. of Illinois at Urbana-Champaign'), s('Massachusetts Inst. of Technology'),
      'Univ. of Illinois at Urbana-Champaign', 'Massachusetts Inst. of Technology'),
    headToHead('school', s('George Mason University'), s('Rice University'), 'George Mason University', 'Rice University')
  ].filter(Boolean),
  researchers: (() => {
    const [a, b] = byOutput.slice(0, 2);
    return [headToHead('researcher', a, b, a.name, b.name)].filter(Boolean);
  })()
};

// --- 12. NSF funding --------------------------------------------------------
const nsfPath = new URL('../public/nsf-awards.json', import.meta.url);
const nsfData = JSON.parse(readFileSync(nsfPath, 'utf8'));
const fundingNow = buildFundingIndex(nsfData, DEFAULT_END_YEAR - 10, DEFAULT_END_YEAR);
const fundingPrior = buildFundingIndex(nsfData, DEFAULT_END_YEAR - 20, DEFAULT_END_YEAR - 11);
const fundingDiscoveries = calculateFundingDiscoveries(fundingNow, fundingPrior, current.schools);

const fundingRankByName = new Map(fundingNow.schools.map((row, i) => [row.name, i + 1]));
const fundingPairs = fundingNow.schools
  .map((row, i) => ({ name: row.name, fundingRank: i + 1, pubRank: current.schools[row.name]?.rank }))
  .filter(row => Number.isFinite(row.pubRank));
const directorates = {};
fundingNow.awards.forEach(a => { directorates[a.directorate || 'unknown'] = (directorates[a.directorate || 'unknown'] || 0) + 1; });

out.nsf = {
  syncedAt: nsfData.syncedAt,
  awardsTotal: nsfData.awards.length,
  awardsInWindow: fundingNow.awards.length,
  coverage: nsfData.coverage,
  window: [DEFAULT_END_YEAR - 10, DEFAULT_END_YEAR],
  schoolsMatched: fundingNow.schools.length,
  facultyMatched: fundingNow.faculty.length,
  totalAttributed: fundingNow.schools.reduce((sum, r) => sum + r.attributedAmount, 0),
  directorates: Object.entries(directorates).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, count]) => ({ name, count })),
  // Does NSF money order departments the way publications do?
  tau: kendallTau(fundingPairs.map(r => [r.fundingRank, r.pubRank])),
  medianAbsRankChange: median(fundingPairs.map(r => Math.abs(r.fundingRank - r.pubRank))),
  topSchools: fundingNow.schools.slice(0, 15).map((row, i) => ({
    name: row.name, short: short(row.name), fundingRank: i + 1,
    amount: row.attributedAmount, awards: row.awards.length, faculty: row.faculty.length,
    pubRank: current.schools[row.name]?.rank ?? null
  })),
  topFaculty: fundingNow.faculty.slice(0, 12).map((row, i) => ({
    name: cleanName(row.name), affiliation: row.affiliation, short: short(row.affiliation),
    fundingRank: i + 1, amount: row.attributedAmount, projectValue: row.totalAwardAmount, awards: row.awards.length
  })),
  fundingAhead: fundingDiscoveries.fundingAhead.map(r => ({
    short: short(r.school.name), fundingRank: r.fundingRank, publicationRank: r.publicationRank, gap: r.gap,
    amount: r.school.attributedAmount
  })),
  publicationsAhead: fundingDiscoveries.publicationsAhead.map(r => ({
    short: short(r.school.name), fundingRank: r.fundingRank, publicationRank: r.publicationRank, gap: r.gap,
    amount: r.school.attributedAmount
  })),
  fastestGrowth: fundingDiscoveries.fastestGrowth.map(r => ({
    short: short(r.school.name), amount: r.school.attributedAmount, priorAmount: r.priorAmount, growth: r.growth
  })),
  broadParticipation: fundingDiscoveries.broadParticipation.map(r => ({
    short: short(r.name), faculty: r.faculty.length, amount: r.attributedAmount, awards: r.awards.length
  })),
  largestCollaborations: fundingDiscoveries.largestCollaborations.map(a => ({
    id: a.id, title: a.title, program: a.program, directorate: a.directorate,
    total: a.collaborativeTotalAmount, parts: a.collaborativeAwardCount
  })),
  // The autocomplete's third suggestion group: NSF program names.
  topPrograms: (() => {
    const counts = {};
    fundingNow.awards.forEach(a => { if (a.program) counts[a.program] = (counts[a.program] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  })()
};

// --- 13. Figure series ------------------------------------------------------
// pgfplots reads these directly, so no figure quotes a number the pipeline did
// not produce.
const figDir = new URL('../paper/data/', import.meta.url);
mkdirSync(figDir, { recursive: true });
const writeDat = (file, header, rows) =>
  writeFileSync(new URL(file, figDir), `${header}\n${rows.join('\n')}\n`);
// Labels land in tick marks and node text, where an unescaped & is an
// alignment tab and kills the build.
const texLabel = value => String(value)
  .replace(/[&%$#_]/g, m => `\\${m}`)
  .replace(/[–—]/g, '--');

writeDat('spread-cdf.dat', 'spread share',
  [...new Set(spreads)].sort((a, b) => a - b)
    .map(v => `${v} ${(spreads.filter(x => x <= v).length / spreads.length * 100).toFixed(2)}`));

writeDat('spread-by-rank.dat', 'baseline spread',
  summaries.sort((a, b) => a.baseline - b.baseline).map(sm => `${sm.baseline} ${sm.spread}`));

writeDat('percapita-scatter.dat', 'csrank pcrank label',
  perCapita.filter(r => Number.isFinite(r.overallRank))
    .map(r => `${r.overallRank} ${r.rank} {${texLabel(short(r.name))}}`));

writeDat('funding-scatter.dat', 'pubrank fundrank label',
  fundingPairs.map(r => `${r.pubRank} ${r.fundingRank} {${texLabel(short(r.name))}}`));

writeDat('field-totals.dat', 'idx total growth label',
  fieldRows.map((r, i) => `${i + 1} ${r.total.toFixed(1)} ${(r.growth ?? 0).toFixed(1)} {${texLabel(r.label)}}`));

writeFileSync(new URL('../paper/stats.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(Object.entries(out).map(([k, v]) => `${k}: ${Array.isArray(v) ? `${v.length} rows` : typeof v === 'object' ? `${Object.keys(v).length} keys` : v}`).join('\n'));
