import { getConferenceAreaMap, publicationMatchesConferenceSet } from '../data.js';
import { cleanName } from '../shared.js';
import { searchAuthor, fetchAuthorStats, parseDblpProfileUrl } from '../dblp.js';
import { calculateRankImpact, fuzzyMatch } from '../simulation.js';
import type { DblpAuthorResult } from '../dblp.js';
import type { FilterController } from '../filters.js';
import type { FilteredData, FilteredSchool } from '../types.js';
import type { CandidateResult, CandidateStats } from './candidate-results.js';

export async function performCandidatesAnalysis(
  selectedUniv: FilteredSchool,
  uniqueNames: string[],
  { filters, selectedDblpProfiles, appData }: {
    filters: FilterController;
    selectedDblpProfiles: Map<string, DblpAuthorResult>;
    appData: FilteredData;
  }
) {
  const candidateResults: CandidateResult[] = [];

  const confMap = getConferenceAreaMap(filters.confSet);

  for (const name of uniqueNames) {
    try {
      const selectedDblpProfile = selectedDblpProfiles.get(name.toLowerCase());
      let profData = null;
      if (!selectedDblpProfile && appData.professors[name]) {
        profData = appData.professors[name];
      } else if (!selectedDblpProfile) {
        const targetFacultyNames = new Set<string>();
        Object.values(selectedUniv.areas).forEach(a => a.faculty.forEach(f => targetFacultyNames.add(f)));
        for (const fName of targetFacultyNames) {
          if (fuzzyMatch(fName, name)) {
            profData = appData.professors[fName];
            break;
          }
        }
        if (!profData) {
          for (const pName of Object.keys(appData.professors)) {
            if (!pName.toLowerCase().includes(name.split(' ').pop().toLowerCase()) &&
              Math.abs(pName.length - name.length) > 3) continue;

            if (fuzzyMatch(pName, name)) {
              profData = appData.professors[pName];
              break;
            }
          }
        }
      }

      let stats: CandidateStats;
      let displayName = name;
      let usedCSRankings = false;

      if (profData && profData.pubs && profData.pubs.length > 0) {
        // Use CSRankings data for existing professors
        displayName = cleanName(profData.name);

        // Filter pubs by year range AND conference set
        const yearFiltered = profData.pubs.filter(p => p.year >= filters.startYear && p.year <= filters.endYear);

        const confFilteredPubs = yearFiltered.filter(p => publicationMatchesConferenceSet(p, filters.confSet));

        console.log('CSRankings match for:', name, '→', profData.name, 'pubs:', profData.pubs.length, 'filtered:', confFilteredPubs.length);

        if (confFilteredPubs.length === 0) {
          // No papers in this year range/conf set - show as such
          candidateResults.push({ name: displayName, error: `No publication records found in ${filters.startYear}–${filters.endYear} for the active conference set` });
          continue;
        }

        usedCSRankings = true;

        stats = {
          totalAdjusted: 0,
          totalPapers: 0,
          areas: {},
          papers: []
        };

        confFilteredPubs.forEach(pub => {
          const area = confMap[pub.area] || pub.area;

          stats.totalAdjusted += pub.adjustedcount;
          stats.totalPapers += pub.count;

          if (!stats.areas[area]) {
            stats.areas[area] = { count: 0, adjusted: 0 };
          }
          stats.areas[area].count += pub.count;
          stats.areas[area].adjusted += pub.adjustedcount;

          stats.papers.push({
            title: `${area.toUpperCase()} publication`,
            venue: pub.area.toUpperCase(),
            year: pub.year,
            count: pub.count,
            adjusted: pub.adjustedcount,
            area: area
          });
        });

        stats.papers.sort((a, b) => b.year - a.year);
      } else {
        // External candidate - query DBLP

        const linkedProfile = parseDblpProfileUrl(name);
        if (!linkedProfile && /^https?:\/\//i.test(name)) {
          candidateResults.push({ name, error: 'Use a DBLP author-profile link containing /pid/, such as https://dblp.org/pid/12/3456.html' });
          continue;
        }

        let searchName = name;
        let dblpSuffix = null;
        const suffixMatch = name.match(/^(.+?)\s+(\d{4})$/);
        if (suffixMatch) {
          searchName = suffixMatch[1];
          dblpSuffix = suffixMatch[2];
        }

        let best: DblpAuthorResult | (NonNullable<typeof linkedProfile> & { name?: string }) | undefined = linkedProfile || selectedDblpProfile;
        if (!best) {
          const searchResults = await searchAuthor(searchName);
          if (dblpSuffix) {
            const numSuffix = parseInt(dblpSuffix, 10);
            best = searchResults.find(r => {
              if (numSuffix === 0) {
                return !r.pid.includes('-');
              }
              return r.pid.endsWith(`-${numSuffix}`);
            });
            if (!best) {
              best = searchResults.find(r =>
                r.name.includes(dblpSuffix) || r.name.endsWith(dblpSuffix)
              );
            }
            if (!best) best = searchResults[0];
          } else {
            best = searchResults[0];
          }
        }

        if (!best) {
          candidateResults.push({ name, error: 'No matching profile found in the faculty roster or DBLP search' });
          continue;
        }

        displayName = best.name || `DBLP profile ${best.pid}`;

        stats = await fetchAuthorStats(best.pid, filters.startYear, filters.endYear, filters.confSet);
        if (!stats) {
          candidateResults.push({ name, error: 'We couldn\'t retrieve publication records from DBLP. Please verify the profile is accessible.' });
          continue;
        }
        if (!best.name && stats.aliases?.length) displayName = stats.aliases[0];
      }

      let sourceSchool = null;
      let isRemovalMode = false;
      // The roster spelling being removed (target school if isRemovalMode, or
      // sourceSchool on a transfer) — needed under Per capita so the
      // hypothetical faculty count drops by exactly this one entry.
      let matchedFacultyName = null;

      // Get all name variants to check (includes DBLP aliases)
      const namesToCheck = [displayName];
      if (stats.aliases && stats.aliases.length > 0) {
        stats.aliases.forEach(alias => {
          if (!namesToCheck.includes(alias)) namesToCheck.push(alias);
        });
      }

      const targetFaculty = new Set<string>();
      Object.values(selectedUniv.areas).forEach(a => a.faculty.forEach(f => targetFaculty.add(f)));

      // Check if any alias matches target school faculty
      outerRemoval:
      for (const nameVariant of namesToCheck) {
        for (const f of targetFaculty) {
          if (fuzzyMatch(f, nameVariant)) {
            isRemovalMode = true;
            matchedFacultyName = f;
            break outerRemoval;
          }
        }
      }

      // Check if any alias matches another school's faculty (transfer mode)
      if (!isRemovalMode) {
        outerSource:
        for (const s of Object.values(appData.schools)) {
          if (s.name === selectedUniv.name) continue;
          const sFaculty = new Set<string>();
          Object.values(s.areas).forEach(a => a.faculty.forEach(f => sFaculty.add(f)));

          for (const nameVariant of namesToCheck) {
            for (const f of sFaculty) {
              if (fuzzyMatch(f, nameVariant)) {
                sourceSchool = s;
                matchedFacultyName = f;
                break outerSource;
              }
            }
          }
        }
      }

      const ops = [];
      if (isRemovalMode) {
        ops.push({ school: selectedUniv, stats, isRemoval: true, facultyKey: matchedFacultyName });
      } else {
        ops.push({ school: selectedUniv, stats, isRemoval: false, facultyKey: displayName });
      }

      if (sourceSchool && !isRemovalMode) {
        ops.push({ school: sourceSchool, stats, isRemoval: true, facultyKey: matchedFacultyName });
      }
      const impactMap = calculateRankImpact(appData.schools, ops, { perCapita: filters.perCapita });
      const targetImpact = impactMap.get(selectedUniv.name) || { overall: 0, areas: {}, rankBefore: selectedUniv.rank, rankAfter: selectedUniv.rank };
      const rankDelta = targetImpact.overall;
      const areaDeltas = targetImpact.areas;
      const sourceImpactEntry = sourceSchool ? impactMap.get(sourceSchool.name) : null;
      const sourceImpact = sourceImpactEntry ? sourceImpactEntry.overall : null;

      candidateResults.push({
        name: displayName,
        stats,
        rankDelta,
        currentRank: targetImpact.rankBefore,
        newRank: targetImpact.rankAfter,
        areaDeltas,
        isRemoval: isRemovalMode,
        usedCSRankings: usedCSRankings,
        sourceSchool: sourceSchool ? { name: sourceSchool.name, delta: sourceImpact } : null,
        error: null
      });
    } catch (err) {
      console.error('Simulator error for:', name, err);
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Stack:', error.stack);
      candidateResults.push({ name, error: `An unexpected error occurred while retrieving data: ${error.message}. Please try again.` });
    }
  }

  candidateResults.sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    // Sort by impact descending
    return Math.abs(b.rankDelta || 0) - Math.abs(a.rankDelta || 0);
  });

  return candidateResults;
}
