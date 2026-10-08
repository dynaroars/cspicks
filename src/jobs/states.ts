export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

// Tile-grid map: one square per state, laid out roughly like the country (12 columns).
// Rows are listed west to east; "." is an empty cell.
export const STATE_TILE_ROWS = [
  'AK . . . . . . . . . . ME',
  '. . . . . . WI . . . VT NH',
  'WA ID MT ND MN IL MI . NY . MA .',
  'OR NV WY SD IA IN OH PA NJ CT RI .',
  'CA UT CO NE MO KY WV VA MD DE . .',
  '. AZ NM KS AR TN NC SC DC . . .',
  '. . OK LA MS AL GA . . . . .',
  'HI . TX . . . . FL . . . .'
].map(row => row.split(' '));

/** Resolve a typed code or full state name ("ca", "California") to its USPS code. */
export function resolveState(value: string) {
  const text = value.trim();
  const upper = text.toUpperCase();
  if (US_STATES[upper]) return upper;
  const lower = text.toLowerCase();
  return Object.keys(US_STATES).find(code => US_STATES[code]!.toLowerCase() === lower) || null;
}
