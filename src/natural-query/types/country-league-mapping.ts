/**
 * Mapping of country names (lowercase) to their associated league IDs.
 * These IDs correspond to the API-Football league IDs.
 */
export const COUNTRY_LEAGUE_MAPPING: Record<string, number[]> = {
  // Major European leagues
  england: [39, 40, 41, 42, 48], // Premier League, Championship, League One, League Two, League Cup
  spain: [140, 141], // La Liga, La Liga 2
  germany: [78, 79], // Bundesliga, 2. Bundesliga
  italy: [135, 136], // Serie A, Serie B
  france: [61, 62], // Ligue 1, Ligue 2
  netherlands: [88, 89], // Eredivisie, Eerste Divisie
  portugal: [94, 95], // Primeira Liga, Segunda Liga
  belgium: [144], // Pro League
  scotland: [179, 180], // Premiership, Championship
  turkey: [203], // Super Lig

  // Additional European leagues
  austria: [218], // Bundesliga
  switzerland: [207], // Super League
  greece: [197], // Super League
  russia: [235], // Premier League
  ukraine: [333], // Premier League
  poland: [106], // Ekstraklasa
  czech: [345], // First League
  denmark: [119], // Superliga
  sweden: [113], // Allsvenskan
  norway: [103], // Eliteserien

  // South America
  brazil: [71, 72], // Serie A, Serie B
  argentina: [128], // Liga Profesional

  // Other
  usa: [253, 254], // MLS, USL Championship
  mexico: [262], // Liga MX
  japan: [98], // J1 League
  australia: [188], // A-League
};

/**
 * Mapping of league names (lowercase) to their IDs.
 * Allows users to specify leagues directly.
 */
export const LEAGUE_NAME_MAPPING: Record<string, number> = {
  // England
  'premier league': 39,
  epl: 39,
  'english premier league': 39,
  championship: 40,
  'english championship': 40,
  'league one': 41,
  'league two': 42,
  'efl cup': 48,
  'league cup': 48,
  'carabao cup': 48,

  // Spain
  'la liga': 140,
  laliga: 140,
  'spanish league': 140,
  'spanish la liga': 140,
  'la liga 2': 141,
  'segunda division': 141,

  // Germany
  bundesliga: 78,
  'german league': 78,
  'german bundesliga': 78,
  '2. bundesliga': 79,
  '2 bundesliga': 79,
  'bundesliga 2': 79,

  // Italy
  'serie a': 135,
  seriea: 135,
  'italian league': 135,
  'italian serie a': 135,
  'serie b': 136,

  // France
  'ligue 1': 61,
  ligue1: 61,
  'french league': 61,
  'french ligue 1': 61,
  'ligue 2': 62,

  // Netherlands
  eredivisie: 88,
  'dutch league': 88,
  'dutch eredivisie': 88,
  'eerste divisie': 89,

  // Portugal
  'primeira liga': 94,
  'liga portugal': 94,
  'portuguese league': 94,
  'liga nos': 94,

  // Belgium
  'pro league': 144,
  'belgian league': 144,
  'jupiler pro league': 144,

  // Scotland
  'scottish premiership': 179,
  spfl: 179,
  'scottish premier league': 179,

  // Turkey
  'super lig': 203,
  'turkish league': 203,
  'turkish super lig': 203,

  // Other major leagues
  mls: 253,
  'major league soccer': 253,
  'liga mx': 262,
  'brazilian serie a': 71,
  brasileirao: 71,
  'argentine league': 128,
  'liga profesional': 128,
};

/**
 * Country name aliases for normalization.
 * Maps common variations to standard country names.
 */
export const COUNTRY_ALIASES: Record<string, string> = {
  // England variations
  uk: 'england',
  'united kingdom': 'england',
  britain: 'england',
  'great britain': 'england',
  english: 'england',
  british: 'england',

  // Spain variations
  spanish: 'spain',
  espana: 'spain',
  españa: 'spain',

  // Germany variations
  german: 'germany',
  deutschland: 'germany',

  // Italy variations
  italian: 'italy',
  italia: 'italy',

  // France variations
  french: 'france',

  // Netherlands variations
  dutch: 'netherlands',
  holland: 'netherlands',
  'the netherlands': 'netherlands',
  nederland: 'netherlands',

  // Portugal variations
  portuguese: 'portugal',

  // Belgium variations
  belgian: 'belgium',
  belgique: 'belgium',

  // Scotland variations
  scottish: 'scotland',

  // Turkey variations
  turkish: 'turkey',
  turkiye: 'turkey',

  // USA variations
  'united states': 'usa',
  america: 'usa',
  american: 'usa',

  // Brazil variations
  brazilian: 'brazil',
  brasil: 'brazil',

  // Argentina variations
  argentine: 'argentina',
  argentinian: 'argentina',

  // Mexico variations
  mexican: 'mexico',

  // Japan variations
  japanese: 'japan',

  // Australia variations
  australian: 'australia',
  aussie: 'australia',
};

/**
 * Reverse mapping from league ID to country for quick lookups
 */
export const LEAGUE_ID_TO_COUNTRY: Record<number, string> = Object.entries(
  COUNTRY_LEAGUE_MAPPING,
).reduce(
  (acc, [country, leagueIds]) => {
    for (const leagueId of leagueIds) {
      acc[leagueId] = country;
    }
    return acc;
  },
  {} as Record<number, string>,
);

/**
 * Get league IDs for a given country name.
 * Handles aliases and case-insensitive matching.
 */
export function getLeagueIdsForCountry(country: string): number[] {
  const normalized = country.toLowerCase().trim();

  // Check direct match
  if (COUNTRY_LEAGUE_MAPPING[normalized]) {
    return COUNTRY_LEAGUE_MAPPING[normalized];
  }

  // Check aliases
  const aliasedCountry = COUNTRY_ALIASES[normalized];
  if (aliasedCountry && COUNTRY_LEAGUE_MAPPING[aliasedCountry]) {
    return COUNTRY_LEAGUE_MAPPING[aliasedCountry];
  }

  // Try partial matching as last resort
  for (const [countryKey, leagueIds] of Object.entries(
    COUNTRY_LEAGUE_MAPPING,
  )) {
    if (countryKey.includes(normalized) || normalized.includes(countryKey)) {
      return leagueIds;
    }
  }

  return [];
}

/**
 * Get league ID for a given league name.
 * Handles case-insensitive matching.
 */
export function getLeagueIdByName(leagueName: string): number | null {
  const normalized = leagueName.toLowerCase().trim();

  // Direct match
  if (LEAGUE_NAME_MAPPING[normalized]) {
    return LEAGUE_NAME_MAPPING[normalized];
  }

  // Try partial match
  for (const [name, id] of Object.entries(LEAGUE_NAME_MAPPING)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return id;
    }
  }

  return null;
}

/**
 * Get country name for a given league ID.
 */
export function getCountryForLeagueId(leagueId: number): string | null {
  const country = LEAGUE_ID_TO_COUNTRY[leagueId];
  if (country) {
    // Return with proper capitalization
    return country.charAt(0).toUpperCase() + country.slice(1);
  }
  return null;
}

/**
 * Normalize a country name to its standard form.
 */
export function normalizeCountryName(country: string): string {
  const normalized = country.toLowerCase().trim();

  // Check if it's already a standard name
  if (COUNTRY_LEAGUE_MAPPING[normalized]) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  // Check aliases
  const aliased = COUNTRY_ALIASES[normalized];
  if (aliased) {
    return aliased.charAt(0).toUpperCase() + aliased.slice(1);
  }

  // Return original with proper case as fallback
  return country.charAt(0).toUpperCase() + country.slice(1).toLowerCase();
}

/**
 * Get all supported country names.
 */
export function getSupportedCountries(): string[] {
  return Object.keys(COUNTRY_LEAGUE_MAPPING).map(
    (c) => c.charAt(0).toUpperCase() + c.slice(1),
  );
}

/**
 * Get all supported league names.
 */
export function getSupportedLeagues(): string[] {
  const uniqueLeagues = new Set<string>();

  // Get primary league names (not aliases)
  const primaryLeagues = [
    'Premier League',
    'Championship',
    'La Liga',
    'Bundesliga',
    'Serie A',
    'Ligue 1',
    'Eredivisie',
    'Primeira Liga',
    'Pro League',
    'Scottish Premiership',
    'Super Lig',
    'MLS',
    'Liga MX',
    'Brasileirao',
  ];

  primaryLeagues.forEach((l) => uniqueLeagues.add(l));

  return Array.from(uniqueLeagues);
}

/**
 * Check if a country is supported.
 */
export function isCountrySupported(country: string): boolean {
  const normalized = country.toLowerCase().trim();
  return !!COUNTRY_LEAGUE_MAPPING[normalized] || !!COUNTRY_ALIASES[normalized];
}

/**
 * Check if a league is supported.
 */
export function isLeagueSupported(league: string): boolean {
  return getLeagueIdByName(league) !== null;
}

/**
 * Get suggestions for similar country names (for typo handling).
 */
export function getSimilarCountries(input: string): string[] {
  const normalized = input.toLowerCase().trim();
  const allCountries = [
    ...Object.keys(COUNTRY_LEAGUE_MAPPING),
    ...Object.keys(COUNTRY_ALIASES),
  ];

  return allCountries
    .filter((c) => {
      // Simple similarity check: starts with same letters or contains input
      return c.startsWith(normalized.slice(0, 2)) || c.includes(normalized);
    })
    .map((c) => {
      // Convert to standard country name
      const standard = COUNTRY_ALIASES[c] || c;
      return standard.charAt(0).toUpperCase() + standard.slice(1);
    })
    .filter((c, i, arr) => arr.indexOf(c) === i) // Unique
    .slice(0, 5);
}
