import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { coreAMap, fetchCsv, filterByYears, getConferenceAreaMap, getPublicationSchools, publicationMatchesConferenceSet } from '../../src/data.js';
import { areaLabels, detectRegionFromLocales, encodeInlineValue, escapeHtml, getInstitutionShortName, safeExternalUrl, scoreSuggestionMatch } from '../../src/shared.js';
import { calculateRankImpact, fuzzyMatch, parseCandidateNames } from '../../src/simulation.js';
import { hasEligiblePageRange, normalizeDblpVenue, parseDblpProfileUrl, topCoauthorsInWindow } from '../../src/dblp.js';
import { parseCsrankingsRules } from '../../src/csrankings-rules.js';
import { renderSchoolCard } from '../../src/search-cards.js';
import { calculateAreaMomentum, calculateCorpusDiagnostics, calculateDiscoveryInsights, calculateFragility, calculatePerCapita, calculateParityReport, calculatePublishingEffort, calculateResearcherPatterns, calculateSchoolMetrics, calculateSubfieldDiscoveries, collectVariantRanks, compareAreas, describeVerdict, explainRankGap, rankStabilityVariants, summarizeRankStability } from '../../src/metrics.js';
import { awardYear, buildFundingIndex, calculateFundingDiscoveries, findFundingFaculty, formatAwardPeriod, fundingFacultyNameMatches, fundingMatches, fundingSchoolNameMatches, normalizeFundingName, renderFundingFacultyCard } from '../../src/nsf.js';
import { aoeDeadline, conferenceStart, deadlineStatus, filterSchedule, formatCalendarDate, groupConferences, scheduleSuggestions } from '../../csconfs/schedule-data.js';
import { renderScheduleCard } from '../../csconfs/schedule-render.js';
import { buildConferenceEmailUrl, buildConferenceGithubIssueUrl, buildConferenceSubmissionContent } from '../../csconfs/submission.js';
test('school metrics report movement, momentum, concentration, breadth, and collaboration proxy', () => {
  const current = {
    professors: {
      Alice: { name: 'Alice', homepage: 'https://a.example', scholarid: 'a', totalAdjusted: 6 },
      Bob: { name: 'Bob', homepage: '', scholarid: '', totalAdjusted: 4 }
    },
    schools: {
      A: {
        name: 'A', rank: 2, totalCount: 20, totalAdjusted: 10,
        areas: { mlmining: { adjusted: 7, faculty: ['Alice', 'Bob'] }, ai: { adjusted: 3, faculty: ['Alice'] } },
        areaRanks: { mlmining: 3, ai: 12 }
      }
    }
  };
  const prior = { schools: { A: { rank: 5, totalAdjusted: 5, areas: { mlmining: { adjusted: 5 } } } } };
  const metrics = calculateSchoolMetrics(current, prior, 'A');

  assert.equal(metrics.rankDelta, 3);
  assert.equal(metrics.growth, 100);
  assert.equal(metrics.medianPerFaculty, 5);
  assert.equal(metrics.top3Share, 100);
  assert.equal(metrics.activeAreas, 2);
  assert.equal(metrics.sustainedAreas, 1);
  assert.equal(metrics.impliedTeamSize, 2);
  assert.equal(metrics.confidence, 'Medium');
});

test('historical school metrics use only output attributed to that school', () => {
  const current = {
    schools: {
      A: {
        name: 'A', rank: 1, totalAdjusted: 2, totalCount: 2,
        areas: { ai: { adjusted: 2, faculty: ['Mover'] } },
        areaRanks: { ai: 1 }, facultyAdjustedCounts: { Mover: 2 }
      },
      B: {
        name: 'B', rank: 2, totalAdjusted: 8, totalCount: 8,
        areas: { ai: { adjusted: 8, faculty: ['Mover'] } },
        areaRanks: { ai: 2 }, facultyAdjustedCounts: { Mover: 8 }
      }
    },
    professors: { Mover: { name: 'Mover', totalAdjusted: 10, homepage: 'x', scholarid: 'y' } }
  };
  const metricsA = calculateSchoolMetrics(current, { schools: {} }, 'A');
  const metricsB = calculateSchoolMetrics(current, { schools: {} }, 'B');
  assert.equal(metricsA.medianPerFaculty, 2);
  assert.equal(metricsB.medianPerFaculty, 8);
  assert.equal(metricsA.top1Share, 100);
});

test('researcher patterns summarize activity, area shifts, venues, and peers', () => {
  const target = {
    name: 'Target', affiliation: 'A', totalAdjusted: 4.5,
    pubs: [
      { area: 'icse', year: 2020, count: 2, adjustedcount: 1 },
      { area: 'icse', year: 2021, count: 1, adjustedcount: 0.5 },
      { area: 'ccs', year: 2024, count: 2, adjustedcount: 1 },
      { area: 'ccs', year: 2025, count: 4, adjustedcount: 2 }
    ]
  };
  const peers = {
    Target: target,
    Similar: { name: 'Similar', affiliation: 'B', totalAdjusted: 3, areas: { sec: { adjusted: 2 }, soft: { adjusted: 1 } } },
    Different: { name: 'Different', affiliation: 'C', totalAdjusted: 6, areas: { ai: { adjusted: 6 } } }
  };
  const patterns = calculateResearcherPatterns(target, peers, {
    startYear: 2020,
    endYear: 2025,
    confSet: 'csrankings-default'
  });

  assert.deepEqual(patterns.activeYears, [2020, 2021, 2024, 2025]);
  assert.deepEqual(patterns.yearly[2025], { count: 4, adjusted: 2 });
  assert.equal(patterns.peak.year, 2025);
  assert.equal(patterns.activeStreak, 2);
  assert.equal(patterns.primaryArea[0], 'sec');
  assert.deepEqual(patterns.pivot, { from: 'soft', to: 'sec', midpoint: 2022 });
  assert.equal(patterns.venueBreadth, 2);
  assert.deepEqual(patterns.venueShift, { from: 'icse', to: 'ccs' });
  assert.equal(patterns.similarPeers[0].name, 'Similar');
});

test('discovery insights rank substantive movement and ignore tiny momentum baselines', () => {
  const current = {
    professors: {
      A1: { name: 'A1', totalAdjusted: 5 },
      A2: { name: 'A2', totalAdjusted: 4 },
      A3: { name: 'A3', totalAdjusted: 3 },
      B1: { name: 'B1', totalAdjusted: 5 },
      B2: { name: 'B2', totalAdjusted: 3 },
      B3: { name: 'B3', totalAdjusted: 2 },
      C1: { name: 'C1', totalAdjusted: 2 },
      C2: { name: 'C2', totalAdjusted: 2 },
      C3: { name: 'C3', totalAdjusted: 1 }
    },
    schools: {
      A: {
        name: 'A', rank: 2, totalCount: 15, totalAdjusted: 12,
        areas: {
          ai: { adjusted: 7, faculty: ['A1', 'A2'] },
          soft: { adjusted: 5, faculty: ['A3'] }
        },
        areaRanks: { ai: 2, soft: 1 }
      },
      B: {
        name: 'B', rank: 1, totalCount: 12, totalAdjusted: 10,
        areas: { ai: { adjusted: 10, faculty: ['B1', 'B2', 'B3'] } },
        areaRanks: { ai: 1 }
      },
      C: {
        name: 'C', rank: 8, totalCount: 7, totalAdjusted: 5,
        areas: { ai: { adjusted: 5, faculty: ['C1', 'C2', 'C3'] } },
        areaRanks: { ai: 3 }
      }
    }
  };
  const prior = {
    schools: {
      A: { name: 'A', rank: 8, totalAdjusted: 3, areas: { ai: { adjusted: 3 } } },
      B: { name: 'B', rank: 1, totalAdjusted: 9, areas: { ai: { adjusted: 9 } } },
      C: { name: 'C', rank: 2, totalAdjusted: 10, areas: { ai: { adjusted: 8 }, soft: { adjusted: 2 } } }
    }
  };

  const insights = calculateDiscoveryInsights(current, prior);
  assert.equal(insights.rankClimbers[0].name, 'A');
  assert.equal(insights.rankClimbers[0].metrics.rankDelta, 6);
  assert.equal(insights.momentum[0].name, 'A');
  assert.equal(insights.breadthBuilders[0].breadthGain, 1);
  assert.equal(insights.focusedPowerhouses[0].name, 'A');
  assert.equal(insights.focusedPowerhouses[0].focusArea.area, 'soft');
  assert.equal(insights.focusedPowerhouses[0].focusArea.regionalShare, 100);
  assert.ok(insights.focusedPowerhouses[0].focusArea.specialization > 1);
  assert.equal(insights.areaBreakouts[0].name, 'A');
  assert.equal(insights.rankDroppers[0].name, 'C');
  assert.equal(insights.slowdowns[0].name, 'C');
  assert.equal(insights.outputLosses[0].name, 'C');
  assert.equal(insights.breadthContractions[0].name, 'C');
  assert.equal(insights.areaDeclines[0].name, 'C');
});

test('subfield discoveries rank region-wide area movement, spread, and leadership changes', () => {
  const current = {
    schools: {
      A: { name: 'A', areas: { ai: { adjusted: 7 }, soft: { adjusted: 2 }, chi: { adjusted: 2 }, robotics: { adjusted: 4 }, vision: { adjusted: 5 } } },
      B: { name: 'B', areas: { ai: { adjusted: 10 }, robotics: { adjusted: 3 } } },
      C: { name: 'C', areas: { ai: { adjusted: 5 }, robotics: { adjusted: 2 } } },
      D: { name: 'D', areas: { robotics: { adjusted: 2 } } },
      E: { name: 'E', areas: { robotics: { adjusted: 1 } } }
    }
  };
  const prior = {
    schools: {
      A: { name: 'A', areas: { ai: { adjusted: 3 }, soft: { adjusted: 5 }, robotics: { adjusted: 3 }, vision: { adjusted: 2 } } },
      B: { name: 'B', areas: { ai: { adjusted: 9 }, chi: { adjusted: 2 }, robotics: { adjusted: 2 }, vision: { adjusted: 2 } } },
      C: { name: 'C', areas: { ai: { adjusted: 8 }, robotics: { adjusted: 1 }, vision: { adjusted: 2 } } }
    }
  };

  const subfields = calculateSubfieldDiscoveries(current, prior);

  // robotics roughly doubles (6 -> 12 adjusted) and outranks ai's modest gain.
  assert.equal(subfields.growth[0].area, 'robotics');
  assert.equal(subfields.growth[0].growth, 100);
  assert.ok(subfields.growth.some(s => s.area === 'ai' && s.growth === 10));

  // soft drops the most (5 -> 2); vision also declines but less sharply.
  assert.equal(subfields.decline[0].area, 'soft');
  assert.equal(subfields.decline[0].growth, -60);

  // robotics spreads from 3 to 5 active universities.
  assert.equal(subfields.expandingReach[0].area, 'robotics');
  assert.equal(subfields.expandingReach[0].schoolGain, 2);

  // vision consolidates from 3 active universities down to 1.
  assert.equal(subfields.narrowingReach[0].area, 'vision');
  assert.equal(subfields.narrowingReach[0].schoolGain, -2);

  // chi's only active school flips from B to A; every other subfield here
  // keeps (or ties on) the same leader across both periods.
  assert.equal(subfields.leadershipChanges.length, 1);
  assert.equal(subfields.leadershipChanges[0].area, 'chi');
  assert.equal(subfields.leadershipChanges[0].formerLeader, 'B');
  assert.equal(subfields.leadershipChanges[0].newLeader, 'A');
});

test('area vs area comparison reports growth, new entrants, and who bridges both fields', () => {
  const current = {
    schools: {
      A: { name: 'A', areas: { ai: { adjusted: 6, faculty: ['Alice', 'Bob'] }, vision: { adjusted: 3, faculty: ['Alice'] } } },
      B: { name: 'B', areas: { ai: { adjusted: 4, faculty: ['Carol'] }, vision: { adjusted: 5, faculty: ['Dan', 'Erin'] } } },
      C: { name: 'C', areas: { vision: { adjusted: 2, faculty: ['Erin'] } } }
    }
  };
  const prior = {
    schools: {
      A: { name: 'A', areas: { ai: { adjusted: 5, faculty: ['Alice'] }, vision: { adjusted: 2, faculty: ['Alice'] } } },
      B: { name: 'B', areas: { ai: { adjusted: 4, faculty: ['Carol'] }, vision: { adjusted: 6, faculty: ['Dan'] } } }
    }
  };

  const cmp = compareAreas(current, prior, 'ai', 'vision');

  assert.equal(cmp.a.currentTotal, 10);
  assert.equal(cmp.a.priorTotal, 9);
  assert.ok(Math.abs(cmp.a.growth - (100 / 9)) < 1e-9);
  assert.deepEqual(cmp.a.newFaculty, ['Bob']);
  assert.deepEqual(cmp.a.schools.map(s => s.name), ['A', 'B']);

  assert.equal(cmp.b.currentTotal, 10);
  assert.equal(cmp.b.priorTotal, 8);
  assert.equal(cmp.b.growth, 25);
  assert.deepEqual(cmp.b.newFaculty, ['Erin']);
  assert.deepEqual(cmp.b.schools.map(s => s.name), ['B', 'A', 'C']);

  // Alice is the only researcher active in both AI and Vision this period.
  assert.deepEqual(cmp.bothFaculty, ['Alice']);

  // A and B both publish in both fields; C only publishes in vision.
  assert.deepEqual(cmp.bothSchools.map(s => s.name), ['A', 'B']);
  assert.deepEqual(cmp.bothSchools.find(s => s.name === 'A'), { name: 'A', creditA: 6, creditB: 3 });
});

test('publishing effort includes only the selected school and uses all active faculty', () => {
  const professors = {
    Alice: {
      affiliation: 'George Mason University',
      pubs: [{ area: 'icse', year: 2025, adjustedcount: 4 }]
    },
    Bob: {
      affiliation: 'George Mason University',
      pubs: [{ area: 'ccs', year: 2025, adjustedcount: 2 }]
    },
    Outsider: {
      affiliation: 'Other University',
      pubs: [{ area: 'focs', year: 2025, adjustedcount: 100 }]
    }
  };

  const result = calculatePublishingEffort(professors, {
    startYear: 2025,
    endYear: 2025,
    parentAreas: { icse: 'soft', ccs: 'sec', focs: 'act' },
    includesPublication: professor => professor.affiliation === 'George Mason University'
  });

  assert.equal(result.activeFaculty, 2);
  assert.deepEqual(result.subfields.map(area => area.subfield), ['soft', 'sec']);
  assert.equal(result.subfields[0].effort, 2);
  assert.equal(result.subfields[1].effort, 1);
});

test('rank gap explanation uses geometric-mean log contributions', () => {
  const gaps = explainRankGap(
    { areaAdjustedCounts: { ai: 9, mlmining: 1 } },
    { areaAdjustedCounts: { ai: 1, mlmining: 3 } }
  );
  assert.equal(gaps[0].area, 'ai');
  assert.equal(gaps[0].leader, 'a');
  assert.ok(gaps[0].logGap > 0);
});

test('parity audit validates ranked data', () => {
  const raw = { professors: { Alice: {} } };
  const filtered = {
    professors: { Alice: { homepage: 'https://a.example' } },
    schools: {
      A: { name: 'A', rank: 1, score: 2, country: 'us', totalCount: 2, totalAdjusted: 1, areas: { ai: { adjusted: 1 } } }
    }
  };
  const report = calculateParityReport(raw, filtered);
  assert.equal(report.totalMismatches, 0);
  assert.equal(report.rankOrderIssues, 0);
  assert.equal(report.officialVenueMode, true);
  // Defaults (official venue set, no per-capita, no History) reproduce CSRankings.
  assert.equal(report.matchesCsrankings, true);
  assert.deepEqual(report.divergences, []);

  // Each mode that reorders or reattributes output is reported as a divergence.
  const perCapita = calculateParityReport(raw, filtered, 'csrankings-default', { perCapita: true });
  assert.equal(perCapita.matchesCsrankings, false);
  assert.deepEqual(perCapita.divergences, ['per-capita ranking']);

  const everything = calculateParityReport(raw, filtered, 'core', { perCapita: true, historical: true });
  assert.equal(everything.matchesCsrankings, false);
  assert.equal(everything.divergences.length, 3);

  const inconsistent = calculateParityReport(raw, {
    ...filtered,
    schools: { A: { ...filtered.schools.A, totalAdjusted: 99 } }
  });
  assert.equal(inconsistent.matchesCsrankings, false);
  assert.equal(inconsistent.totalMismatches, 1);
});

test('corpus diagnostics compute Shannon entropy, HHI, Gini, and graph metrics', () => {
  const raw = {
    professors: {
      'Alice [1]': { unitNotes: ['1'] },
      Bob: {},
      Charlie: {}
    }
  };
  const filtered = {
    professors: {
      'Alice [1]': { totalCount: 6, totalAdjusted: 3, pubs: [{ area: 'ai' }, { area: 'vision' }] },
      Bob: { totalCount: 2, totalAdjusted: 1, pubs: [{ area: 'ai' }] },
      Charlie: { totalCount: 0, totalAdjusted: 0, pubs: [] }
    },
    schools: {
      SchoolA: {
        totalAdjusted: 4,
        areas: {
          ai: { adjusted: 2 },
          vision: { adjusted: 2 }
        }
      }
    }
  };

  const diagnostics = calculateCorpusDiagnostics(raw, filtered);
  assert.equal(diagnostics.activeFacultyCount, 2);
  // With equal split across 2 areas (p = 0.5 each): H = - (0.5 ln 0.5 + 0.5 ln 0.5) = ln 2 ≈ 0.693 nats, 100% uniformity
  assert.ok(Math.abs(diagnostics.entropy - Math.log(2)) < 1e-4);
  assert.ok(Math.abs(diagnostics.normalizedEntropy - 100) < 1e-4);
  // HHI = 50^2 + 50^2 = 5000
  assert.equal(diagnostics.hhi, 5000);
  // Alice has 2 subfields, Bob has 1 -> 50% bridge ratio
  assert.equal(diagnostics.bridgeRatio, 50);
  // Coauthorship depth: 8 raw / 4 adjusted = 2.0
  assert.equal(diagnostics.coauthorshipDepth, 2);
  // Disambiguated authors count: 'Alice [1]' has unit notes
  assert.equal(diagnostics.disambiguatedAuthors, 1);
  // Gini is > 0 since Alice has 3 and Bob has 1
  assert.ok(diagnostics.gini > 0);
  assert.ok(diagnostics.top10Concentration > 0);
});

test('area momentum compares a school against the field, not against itself', () => {
  const school = (name, areas) => ({ name, areaAdjustedCounts: areas, areas: {}, totalAdjusted: 0 });
  const current = { schools: {
    Target: school('Target', { robotics: 14, act: 10, bio: 1 }),
    Other: school('Other', { robotics: 86, act: 190, bio: 9 })
  } };
  const prior = { schools: {
    Target: school('Target', { robotics: 10, act: 10, bio: 1 }),
    Other: school('Other', { robotics: 90, act: 90, bio: 9 })
  } };

  const momentum = calculateAreaMomentum(current, prior, 'Target');
  const byArea = Object.fromEntries(momentum.map(entry => [entry.area, entry]));

  // Robotics grew 40% here while the field grew exactly 0%.
  assert.equal(byArea.robotics.growth, 40);
  assert.equal(byArea.robotics.fieldGrowth, 0);
  assert.equal(byArea.robotics.delta, 40);
  // Flat output is a real decline when the field doubled.
  assert.equal(byArea.act.growth, 0);
  assert.equal(byArea.act.fieldGrowth, 100);
  assert.equal(byArea.act.delta, -100);
  // Areas too small to be meaningful are dropped.
  assert.equal('bio' in byArea, false);
  // Ordered by the size of the gap, whichever direction it points.
  assert.equal(momentum[0].area, 'act');
  assert.equal(calculateAreaMomentum(current, prior, 'Missing School').length, 0);
});

test('rank stability sweeps every window and conference set, holding region fixed', () => {
  const variants = rankStabilityVariants(2026);
  assert.equal(variants.length, 20);
  assert.deepEqual([...new Set(variants.map(v => v.confSet))], ['csrankings-default', 'csrankings', 'core', 'core-a', 'all-union']);
  // Windows are inclusive of both endpoints, so a 5-year window is 2022–2026.
  assert.deepEqual(variants[0], { key: '5|csrankings-default', span: 5, confSet: 'csrankings-default', startYear: 2022, endYear: 2026 });

  const data = {
    schools: { Steady: { country: 'us' }, Swingy: { country: 'us' } },
    professors: {
      // Steady publishes an always-counted venue; Swingy publishes one the
      // default set excludes, so Swingy's standing depends on the setting.
      // The margin is wide because school scores round to one decimal, which
      // collapses small differences into ties.
      Steady: { name: 'Steady', affiliation: 'Steady', pubs: [{ area: 'icse', year: 2025, count: 4, adjustedcount: 4 }] },
      Swingy: { name: 'Swingy', affiliation: 'Swingy', pubs: [{ area: 'ase', year: 2025, count: 60, adjustedcount: 60 }] }
    }
  };
  const samples = rankStabilityVariants(2026).map(variant =>
    collectVariantRanks(data, variant, { region: 'us', historyMap: null, aliasMap: null }));

  const steady = summarizeRankStability(samples, 'Steady');
  const swingy = summarizeRankStability(samples, 'Swingy');
  assert.equal(steady.settings, 20);
  // Steady leads wherever ASE is excluded and trails wherever it counts, so the
  // same department holds two different ranks depending on the setting alone.
  assert.equal(steady.best, 1);
  assert.equal(steady.worst, 2);
  assert.equal(steady.spread, 1);
  assert.equal(steady.stable, true);
  // Swingy simply does not exist under the four default-venue settings.
  assert.equal(swingy.best, 1);
  assert.equal(swingy.unranked, 4, 'settings where a school never ranks are reported, not dropped');
  assert.equal(swingy.rows.filter(row => row.rank === null).length, 4);
  assert.equal(summarizeRankStability(samples, 'Nonexistent University'), null);
});

test('a comparison verdict separates who is bigger from who is broader', () => {
  const school = (rank) => ({ rank });
  const person = (totalAdjusted) => ({ totalAdjusted });

  // Rank and breadth agree: one plain statement.
  assert.deepEqual(describeVerdict('school', school(1), school(32), 19, 8), {
    leader: 'a', phrase: '#1 vs #32', verb: 'ranks higher', areaLeader: 'a', kind: 'agree'
  });
  // The higher-ranked school is the narrower one — the case worth surfacing.
  assert.equal(describeVerdict('school', school(12), school(18), 6, 15).kind, 'split');
  assert.equal(describeVerdict('school', school(12), school(18), 6, 15).leader, 'a');
  assert.equal(describeVerdict('school', school(12), school(18), 6, 15).areaLeader, 'b');
  // Tied rank, unequal breadth.
  assert.equal(describeVerdict('school', school(4), school(4), 3, 9).kind, 'breadth-only');
  // Nothing separates them at all.
  assert.equal(describeVerdict('school', school(4), school(4), 5, 5).kind, 'even');
  // Researchers are judged on adjusted output, not rank.
  const researcher = describeVerdict('researcher', person(12.4), person(8.1), 5, 3);
  assert.equal(researcher.verb, 'has more output');
  assert.equal(researcher.phrase, '12.4 vs 8.1 adjusted');
  assert.equal(researcher.leader, 'a');
});

test('per-faculty ranking reorders the field and ignores tiny departments', () => {
  const prof = (name, affiliation, adjusted) => ({
    name, affiliation, pubs: [{ area: 'icse', year: 2025, count: adjusted, adjustedcount: adjusted }]
  });
  const professors = {};
  // Big wins on total output (120 vs 30) but loses on rate (3.0 vs 6.0 each).
  // The margin is wide because school scores round to one decimal place, which
  // collapses smaller differences into ties.
  for (let i = 0; i < 40; i++) professors[`Big${i}`] = prof(`Big${i}`, 'Big University', 3);
  for (let i = 0; i < 5; i++) professors[`Small${i}`] = prof(`Small${i}`, 'Small College', 6);
  professors.Solo = prof('Solo', 'Tiny Institute', 50);

  const data = filterByYears({
    schools: { 'Big University': { country: 'us' }, 'Small College': { country: 'us' }, 'Tiny Institute': { country: 'us' } },
    professors
  }, 2025, 2025, 'us');

  // The geometric mean rewards Big's volume; per-faculty rewards Small's rate.
  assert.ok(data.schools['Big University'].rank < data.schools['Small College'].rank);
  const perCapita = calculatePerCapita(data);
  assert.equal(perCapita[0].name, 'Small College');
  assert.equal(perCapita[0].perCapita, 6);
  assert.equal(perCapita[0].overallRank, data.schools['Small College'].rank);
  assert.equal(perCapita[1].name, 'Big University');
  assert.equal(perCapita[1].perCapita, 3);
  // One prolific person is not a department: below the floor it is omitted.
  assert.equal(perCapita.some(row => row.name === 'Tiny Institute'), false);
  assert.equal(calculatePerCapita(data, { minFaculty: 1 })[0].name, 'Tiny Institute');
});

test('fragility counts the departures that move a university out of a rank band', () => {
  const prof = (name, affiliation, adjusted) => ({
    name, affiliation, pubs: [{ area: 'icse', year: 2025, count: adjusted, adjustedcount: adjusted }]
  });
  const professors = {
    // Concentrated: one person carries almost everything.
    Star: prof('Star', 'Concentrated University', 40),
    Minor: prof('Minor', 'Concentrated University', 1),
    // Broad: the same total spread over four people.
    B1: prof('B1', 'Broad University', 10), B2: prof('B2', 'Broad University', 10),
    B3: prof('B3', 'Broad University', 10), B4: prof('B4', 'Broad University', 10),
    Rival: prof('Rival', 'Rival University', 20)
  };
  const data = filterByYears({
    schools: {
      'Concentrated University': { country: 'us' }, 'Broad University': { country: 'us' }, 'Rival University': { country: 'us' }
    },
    professors
  }, 2025, 2025, 'us');

  const concentrated = calculateFragility(data, 'Concentrated University', { thresholds: [2] });
  const broad = calculateFragility(data, 'Broad University', { thresholds: [2] });
  assert.equal(concentrated.facultyCount, 2);
  // Losing the one carrier drops the concentrated department immediately; the
  // broad one absorbs the same loss.
  assert.equal(concentrated.exits[2], 1);
  assert.ok(broad.exits[2] === undefined || broad.exits[2] > 1);
  // Each step re-ranks against the other universities, which do not change.
  assert.ok(concentrated.steps[0].rank > concentrated.rank);
  assert.equal(calculateFragility(data, 'Nonexistent University'), null);
});

test('coauthor windows are derived from cached per-year counts', () => {
  // One cached profile answers every year window, so changing the year filter
  // costs no further DBLP requests.
  const records = [
    { name: 'Steady Collaborator', years: { 2015: 2, 2020: 3, 2024: 1 } },
    { name: 'Recent Collaborator', years: { 2023: 4, 2024: 4 } },
    { name: 'Old Collaborator', years: { 2001: 9 } }
  ];

  assert.deepEqual(topCoauthorsInWindow(records, { startYear: 2020, endYear: 2026 }), [
    { name: 'Recent Collaborator', papers: 8 },
    { name: 'Steady Collaborator', papers: 4 }
  ]);
  assert.deepEqual(topCoauthorsInWindow(records, { startYear: 2000, endYear: 2010 }), [
    { name: 'Old Collaborator', papers: 9 }
  ]);
  assert.deepEqual(topCoauthorsInWindow(records, { startYear: 2020, endYear: 2026, limit: 1 }), [
    { name: 'Recent Collaborator', papers: 8 }
  ]);
  // A window with no joint papers yields nothing rather than zero-count rows.
  assert.deepEqual(topCoauthorsInWindow(records, { startYear: 2005, endYear: 2010 }), []);
  assert.deepEqual(topCoauthorsInWindow([], { startYear: 2020, endYear: 2026 }), []);
  assert.deepEqual(topCoauthorsInWindow(undefined, {}), []);
});
