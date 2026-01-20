/**
 * Mapping of country names (lowercase) to their associated league IDs.
 * These IDs correspond to the Sportmonks API league IDs.
 */
export const COUNTRY_LEAGUE_MAPPING: Record<string, number[]> = {
  england: [39, 40, 41, 42], // Premier League, Championship, League One, League Two
  spain: [140, 141], // La Liga, La Liga 2
  germany: [78, 79], // Bundesliga, 2. Bundesliga
  italy: [135, 136], // Serie A, Serie B
  france: [61, 62], // Ligue 1, Ligue 2
  netherlands: [88, 89], // Eredivisie, Eerste Divisie
  portugal: [94], // Primeira Liga
  belgium: [144], // Pro League
  scotland: [179], // Premiership
  turkey: [203], // Super Lig
};

/**
 * Mapping of league names (lowercase) to their IDs.
 * Allows users to specify leagues directly.
 */
export const LEAGUE_NAME_MAPPING: Record<string, number> = {
  'premier league': 39,
  epl: 39,
  'english premier league': 39,
  championship: 40,
  'la liga': 140,
  laliga: 140,
  'spanish league': 140,
  bundesliga: 78,
  'german league': 78,
  'serie a': 135,
  seriea: 135,
  'italian league': 135,
  'ligue 1': 61,
  ligue1: 61,
  'french league': 61,
  eredivisie: 88,
  'dutch league': 88,
  'primeira liga': 94,
  'portuguese league': 94,
  'pro league': 144,
  'belgian league': 144,
  'scottish premiership': 179,
  'super lig': 203,
  'turkish league': 203,
};

/**
 * Country name aliases for normalization.
 * Maps common variations to standard country names.
 */
export const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'england',
  'united kingdom': 'england',
  britain: 'england',
  english: 'england',
  spanish: 'spain',
  german: 'germany',
  italian: 'italy',
  french: 'france',
  dutch: 'netherlands',
  holland: 'netherlands',
  portuguese: 'portugal',
  belgian: 'belgium',
  scottish: 'scotland',
  turkish: 'turkey',
};

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

  return [];
}

/**
 * Get league ID for a given league name.
 * Handles case-insensitive matching.
 */
export function getLeagueIdByName(leagueName: string): number | null {
  const normalized = leagueName.toLowerCase().trim();

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
  ];

  primaryLeagues.forEach((l) => uniqueLeagues.add(l));

  return Array.from(uniqueLeagues);
}
