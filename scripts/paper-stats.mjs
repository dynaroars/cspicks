// Every number in paper/main.tex comes from this script, run against the live
// CSRankings inputs via the same modules the site ships.
//
//   node scripts/paper-stats.mjs   ->  paper/stats.json
//
// Figures drift as CSRankings updates upstream; re-run before submitting and
// reconcile the tables in paper/main.tex against the regenerated JSON.
import { writeFileSync } from 'node:fs';
import { CONFERENCE_SET_IDS, DEFAULT_END_YEAR, filterByYears, loadData } from '../src/data.js';
import { calculateFragility, calculatePerCapita, calculateSchoolMetrics, collectVariantRanks, rankStabilityVariants, summarizeRankStability } from '../src/metrics.js';

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

writeFileSync(new URL('../paper/stats.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
