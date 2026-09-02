import { CONFERENCE_SET_IDS, assignCompetitionRanks, filterByYears, geometricMeanScore, getConferenceAreaMap, publicationMatchesConferenceSet } from '../data.js';
import { cosineSimilarity, percent, sumBy, topEntry } from './math.js';
import type { FilteredProfessor } from '../types.js';

export function calculateResearcherPatterns(
  professor: FilteredProfessor | null,
  peers: Record<string, FilteredProfessor> = {},
  options: { startYear?: number, endYear?: number, confSet?: string, areaMap?: Record<string, string> } = {}
) {
  if (!professor) return null;
  const startYear = Number(options.startYear);
  const endYear = Number(options.endYear);
  const confSet = options.confSet || 'all-union';
  const areaMap = options.areaMap || getConferenceAreaMap(confSet);
  const publications = (professor.pubs || []).filter(pub =>
    pub.year >= startYear && pub.year <= endYear && publicationMatchesConferenceSet(pub, confSet)
  );
  if (!publications.length) return null;

  const yearly: Record<number, { count: number, adjusted: number }> = {};
  const areas: Record<string, number> = {};
  const venues: Record<string, { count: number, adjusted: number, years: Set<number> }> = {};
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
  const periodAreas = (range: (publication: FilteredProfessor['pubs'][number]) => boolean) => {
    const counts: Record<string, number> = {};
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
  const earlyVenues: Record<string, number> = {};
  const recentVenues: Record<string, number> = {};
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

  const highlights: string[] = [];
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
