import bundledRules from '../csrankings-rules.generated.js';

export const state = {
  rawData: [],
  filters: null,
  chartInstance: null,
  currentTab: 'schools',
  selectedTarget: null,
  activeVenueRules: bundledRules,
  venueRulesCheckedAt: null,
  conferenceFilterContext: null,
  analysisReady: false
};
