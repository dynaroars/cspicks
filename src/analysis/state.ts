import bundledRules from '../csrankings-rules.generated.js';
import type { Chart } from '../charts.js';
import type { CsrankingsRules } from '../csrankings-rules.js';
import type { FilterController } from '../filters.js';
import type { RawData } from '../types.js';

export interface AnalysisTarget {
  type: 'school' | 'researcher';
  name: string;
}

export interface AnalysisState {
  rawData: RawData;
  filters: FilterController;
  chartInstance: Chart | null;
  currentTab: string;
  selectedTarget: AnalysisTarget | null;
  activeVenueRules: CsrankingsRules;
  venueRulesCheckedAt: Date | null;
  conferenceFilterContext: string | null;
  analysisReady: boolean;
}

export const state: AnalysisState = {
  rawData: { professors: {}, schools: {} },
  filters: null!,
  chartInstance: null,
  currentTab: 'schools',
  selectedTarget: null,
  activeVenueRules: bundledRules as CsrankingsRules,
  venueRulesCheckedAt: null,
  conferenceFilterContext: null,
  analysisReady: false
};
