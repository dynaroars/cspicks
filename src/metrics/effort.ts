import type { FilteredData, Professor, Publication } from '../types.js';

export function calculatePublishingEffort(
  professors: Record<string, Professor>,
  { startYear, endYear, parentAreas, includesPublication }: {
    startYear: number;
    endYear: number;
    parentAreas: Record<string, string>;
    includesPublication: (professor: Professor, publication: Publication) => boolean;
  }
) {
  const years = endYear - startYear + 1;
  if (!Number.isFinite(years) || years <= 0) {
    return { activeFaculty: 0, subfields: [] };
  }

  const facultyOutput: Record<string, number>[] = [];
  Object.values(professors || {}).forEach(professor => {
    const output: Record<string, number> = {};
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

  const totals: Record<string, number> = {};
  const researchers: Record<string, number> = {};
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

export function calculateAreaMomentum(current: FilteredData, prior: FilteredData | null, schoolName: string, { minAdjusted = 2, limit = 4 } = {}) {
  const currentSchool = current?.schools?.[schoolName];
  if (!currentSchool) return [];
  const priorSchool = prior?.schools?.[schoolName];

  const fieldTotals = (data: FilteredData | null) => {
    const totals: Record<string, number> = {};
    Object.values(data?.schools || {}).forEach(school => {
      Object.entries(school.areaAdjustedCounts || {}).forEach(([area, value]) => {
        totals[area] = (totals[area] || 0) + value;
      });
    });
    return totals;
  };
  const growth = (now: number, before: number) => before > 0 ? ((now - before) / before) * 100 : null;

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
    .map(entry => ({ ...entry, delta: entry.growth! - entry.fieldGrowth! }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}
