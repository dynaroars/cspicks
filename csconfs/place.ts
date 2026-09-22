// The `place` field is free text researched from official conference sites
// (see MAINTENANCE.md's "CS Conference schedule" section), so its shape
// varies a lot ("City, Country", "Venue Name, City, ST, USA", a bare country,
// "Virtual Conference", ...). This module reduces it to a display string of
// just city + region (per MAINTENANCE.md's place-formatting rule) and, when
// the country can be identified, an ISO-2 code for a flag.

const VENUE_KEYWORDS = /\b(hotel|resort|spa|marina|convention cent(?:er|re)|cent(?:er|re)|campus|university|college|hall|inn|lodge|palace)\b/i;

const US_STATE_ABBREVIATIONS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
]);

const US_STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC'
};

const US_ALIASES = new Set(['usa', 'us', 'united states', 'united states of america']);

// Only the countries that have actually appeared in conferences.json need
// covering here; extend this table as new locations are researched.
const COUNTRY_CODES: Record<string, string> = {
  canada: 'ca', italy: 'it', germany: 'de', uk: 'gb', 'united kingdom': 'gb', england: 'gb',
  scotland: 'gb', wales: 'gb', 'northern ireland': 'gb', france: 'fr', china: 'cn',
  'hong kong': 'hk', australia: 'au', spain: 'es', portugal: 'pt', netherlands: 'nl',
  'the netherlands': 'nl', japan: 'jp', greece: 'gr', austria: 'at', singapore: 'sg',
  'south korea': 'kr', korea: 'kr', 'republic of korea': 'kr', india: 'in', sweden: 'se',
  brazil: 'br', denmark: 'dk', taiwan: 'tw', ireland: 'ie', 'czech republic': 'cz',
  czechia: 'cz', israel: 'il', switzerland: 'ch', finland: 'fi', 'new zealand': 'nz',
  mexico: 'mx', turkey: 'tr', poland: 'pl', luxembourg: 'lu', chile: 'cl', belgium: 'be',
  thailand: 'th', norway: 'no', malaysia: 'my', cyprus: 'cy', croatia: 'hr', argentina: 'ar',
  vietnam: 'vn', uae: 'ae', 'united arab emirates': 'ae', morocco: 'ma', slovenia: 'si',
  iceland: 'is', hungary: 'hu', estonia: 'ee', 'south africa': 'za', malta: 'mt',
  curaçao: 'cw', curacao: 'cw', barbados: 'bb', ukraine: 'ua', tunisia: 'tn', rwanda: 'rw',
  'saint kitts and nevis': 'kn', peru: 'pe', latvia: 'lv', 'dominican republic': 'do',
  'costa rica': 'cr', grenada: 'gd', 'puerto rico': 'pr', pr: 'pr', serbia: 'rs'
};

export interface ParsedPlace {
  display: string;
  countryCode: string | null;
}

export function parsePlace(rawPlace: string | null | undefined): ParsedPlace | null {
  if (!rawPlace) return null;
  const withoutAsides = rawPlace.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!withoutAsides) return null;

  let segments = withoutAsides.split(',').map(segment => segment.trim()).filter(Boolean);
  if (!segments.length) return null;
  if (segments.length > 1 && VENUE_KEYWORDS.test(segments[0]!)) segments = segments.slice(1);
  if (!segments.length) return null;

  if (segments.length === 1) {
    const solo = segments[0]!;
    const soloLower = solo.toLowerCase();
    if (US_STATE_ABBREVIATIONS.has(solo.toUpperCase()) || US_STATE_NAMES[soloLower]) {
      const state = US_STATE_NAMES[soloLower] || solo.toUpperCase();
      return { display: `${state}, US`, countryCode: 'us' };
    }
    if (US_ALIASES.has(soloLower)) return { display: 'US', countryCode: 'us' };
    const code = COUNTRY_CODES[soloLower];
    return { display: solo, countryCode: code || null };
  }

  const city = segments[0]!;
  const rest = segments.slice(1);
  const last = rest[rest.length - 1]!;
  const lastLower = last.toLowerCase();

  const stateToken = rest.find(segment => US_STATE_ABBREVIATIONS.has(segment.toUpperCase()) || US_STATE_NAMES[segment.toLowerCase()]);
  const isUS = US_ALIASES.has(lastLower) || Boolean(stateToken);
  if (isUS) {
    const stateAbbrev = stateToken
      ? (US_STATE_NAMES[stateToken.toLowerCase()] || stateToken.toUpperCase())
      : null;
    return { display: stateAbbrev ? `${city}, ${stateAbbrev}, US` : `${city}, US`, countryCode: 'us' };
  }

  const code = COUNTRY_CODES[lastLower];
  if (code) return { display: `${city}, ${last}`, countryCode: code };

  // Unknown country name: fall back to city + whatever the last segment was
  // rather than guessing a flag.
  return { display: `${city}, ${last}`, countryCode: null };
}
