import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { KickerGPTFixturesResponse } from '../fixtures/types/fixtures-response.type';
import { ClassifiedIntent, DateRangeFilter } from './types/natural-query.types';

/**
 * Configuration for fixture filtering
 */
const CONFIG = {
  maxDaysToSearch: 3,
  maxFixturesPerDay: 500,
  cacheKeyPrefix: 'fixtures',
} as const;

/**
 * Country name aliases for normalization.
 * Maps common variations to the standard country names used in Sportmonks data.
 */
const COUNTRY_ALIASES: Record<string, string> = {
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
  türkiye: 'turkey',

  // USA variations
  'united states': 'usa',
  america: 'usa',
  american: 'usa',
  'united states of america': 'usa',

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

  // Other common variations
  greek: 'greece',
  swedish: 'sweden',
  norwegian: 'norway',
  danish: 'denmark',
  polish: 'poland',
  austrian: 'austria',
  swiss: 'switzerland',
  russian: 'russia',
  ukrainian: 'ukraine',
  czech: 'czechia',
  'czech republic': 'czechia',
};

/**
 * League name to country mapping for when users mention league names
 */
const LEAGUE_TO_COUNTRY: Record<string, string> = {
  // England
  'premier league': 'england',
  epl: 'england',
  'english premier league': 'england',
  championship: 'england',
  'fa cup': 'england',
  'efl cup': 'england',
  'carabao cup': 'england',
  'league cup': 'england',

  // Spain
  'la liga': 'spain',
  laliga: 'spain',
  'copa del rey': 'spain',

  // Germany
  bundesliga: 'germany',
  'dfb pokal': 'germany',
  'dfb-pokal': 'germany',

  // Italy
  'serie a': 'italy',
  seriea: 'italy',
  'coppa italia': 'italy',

  // France
  'ligue 1': 'france',
  ligue1: 'france',
  'coupe de france': 'france',

  // Netherlands
  eredivisie: 'netherlands',
  'knvb beker': 'netherlands',

  // Portugal
  'primeira liga': 'portugal',
  'liga portugal': 'portugal',
  'taca de portugal': 'portugal',

  // Belgium
  'pro league': 'belgium',
  'jupiler pro league': 'belgium',

  // Scotland
  'scottish premiership': 'scotland',
  spfl: 'scotland',

  // Turkey
  'super lig': 'turkey',
  'süper lig': 'turkey',

  // Other
  mls: 'usa',
  'liga mx': 'mexico',
  brasileirao: 'brazil',
  'j1 league': 'japan',
  'a-league': 'australia',
};

@Injectable()
export class FixtureFilterService {
  private readonly logger = new Logger(FixtureFilterService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get fixtures from Redis cache filtered by the classified intent.
   */
  async getFilteredFixtures(
    intent: ClassifiedIntent,
  ): Promise<KickerGPTFixturesResponse[]> {
    const dates = this.resolveDateRange(intent.filters.dateRange);
    this.logger.log(`Fetching fixtures for dates: ${dates.join(', ')}`);

    const allFixtures: KickerGPTFixturesResponse[] = [];

    // Fetch fixtures for each date
    for (const date of dates) {
      try {
        const fixtures = await this.getFixturesForDate(date);
        allFixtures.push(...fixtures);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch fixtures for ${date}: ${(error as Error).message}`,
        );
        // Continue with other dates
      }
    }

    this.logger.log(`Found ${allFixtures.length} total fixtures in cache`);

    if (allFixtures.length === 0) {
      return [];
    }

    // Apply filters
    const filteredFixtures = this.applyFilters(allFixtures, intent);

    this.logger.log(
      `After filtering: ${filteredFixtures.length} fixtures match criteria`,
    );

    return filteredFixtures;
  }

  /**
   * Get all cached fixtures for a specific date.
   */
  private async getFixturesForDate(
    date: string,
  ): Promise<KickerGPTFixturesResponse[]> {
    // Get fixture IDs for the date
    const idsKey = `${CONFIG.cacheKeyPrefix}:ids:${date}`;
    const idsJson = await this.redisService.get<string>(idsKey);

    if (!idsJson) {
      this.logger.debug(`No fixture IDs found for ${date}`);
      return [];
    }

    let fixtureIds: number[];
    try {
      fixtureIds =
        typeof idsJson === 'object'
          ? (idsJson as unknown as number[])
          : JSON.parse(idsJson);
    } catch {
      this.logger.warn(`Failed to parse fixture IDs for date ${date}`);
      return [];
    }

    if (!fixtureIds || fixtureIds.length === 0) {
      return [];
    }

    // Limit to prevent memory issues
    const limitedIds = fixtureIds.slice(0, CONFIG.maxFixturesPerDay);
    this.logger.debug(`Found ${limitedIds.length} fixture IDs for ${date}`);

    // Fetch all fixtures using pipeline for efficiency
    const fixtures: KickerGPTFixturesResponse[] = [];
    const pipeline = this.redisService.pipeline();

    if (!pipeline) {
      this.logger.warn(
        'Redis pipeline not available, falling back to individual fetches',
      );
      return this.fetchFixturesIndividually(limitedIds);
    }

    for (const id of limitedIds) {
      pipeline.get(`fixture:${id}`);
    }

    try {
      const results = await pipeline.exec();

      if (results) {
        for (const result of results) {
          if (result) {
            try {
              const fixture =
                typeof result === 'object'
                  ? (result as unknown as KickerGPTFixturesResponse)
                  : (JSON.parse(result as string) as KickerGPTFixturesResponse);

              // Validate fixture has required fields
              if (this.isValidFixture(fixture)) {
                fixtures.push(fixture);
              }
            } catch {
              // Skip invalid entries
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Pipeline execution failed: ${(error as Error).message}`,
      );
      return this.fetchFixturesIndividually(limitedIds);
    }

    return fixtures;
  }

  /**
   * Fallback method to fetch fixtures individually if pipeline fails
   */
  private async fetchFixturesIndividually(
    fixtureIds: number[],
  ): Promise<KickerGPTFixturesResponse[]> {
    const fixtures: KickerGPTFixturesResponse[] = [];

    for (const id of fixtureIds) {
      try {
        const fixtureJson = await this.redisService.get<string>(
          `fixture:${id}`,
        );
        if (fixtureJson) {
          const fixture =
            typeof fixtureJson === 'object'
              ? (fixtureJson as unknown as KickerGPTFixturesResponse)
              : (JSON.parse(fixtureJson) as KickerGPTFixturesResponse);

          if (this.isValidFixture(fixture)) {
            fixtures.push(fixture);
          }
        }
      } catch {
        // Skip invalid entries
      }
    }

    return fixtures;
  }

  /**
   * Validate that a fixture has the required fields
   */
  private isValidFixture(fixture: KickerGPTFixturesResponse): boolean {
    return !!(
      fixture &&
      typeof fixture.id === 'number' &&
      fixture.teams?.home?.id &&
      fixture.teams?.away?.id &&
      fixture.league?.id
    );
  }

  /**
   * Apply country and league filters to fixtures.
   * Filters by matching the fixture's league.country field directly.
   */
  private applyFilters(
    fixtures: KickerGPTFixturesResponse[],
    intent: ClassifiedIntent,
  ): KickerGPTFixturesResponse[] {
    const { countries, leagues } = intent.filters;

    // If no filters, return all fixtures
    if (countries.length === 0 && leagues.length === 0) {
      this.logger.debug(
        'No country/league filters applied, returning all fixtures',
      );
      return fixtures;
    }

    // Normalize country names from the intent
    const normalizedCountries = countries.map((c) =>
      this.normalizeCountryName(c),
    );

    // Get countries from league names (e.g., "Premier League" -> "england")
    const countriesFromLeagues = leagues
      .map((league) => this.getCountryFromLeagueName(league))
      .filter((c): c is string => c !== null);

    // Combine all target countries
    const allTargetCountries = [
      ...new Set([...normalizedCountries, ...countriesFromLeagues]),
    ];

    this.logger.debug(
      `Filtering for countries: ${allTargetCountries.join(', ')}`,
    );

    // Filter fixtures by country name
    return fixtures.filter((fixture) => {
      const fixtureCountry = this.normalizeCountryName(fixture.league.country);

      // Check if fixture's country matches any target country
      const countryMatches = allTargetCountries.some((targetCountry) => {
        return (
          fixtureCountry === targetCountry ||
          fixtureCountry.includes(targetCountry) ||
          targetCountry.includes(fixtureCountry)
        );
      });

      // Also check league name if leagues were specified
      if (!countryMatches && leagues.length > 0) {
        const fixtureLeagueName = fixture.league.name.toLowerCase();
        return leagues.some((targetLeague) => {
          const normalizedTarget = targetLeague.toLowerCase();
          return (
            fixtureLeagueName.includes(normalizedTarget) ||
            normalizedTarget.includes(fixtureLeagueName)
          );
        });
      }

      return countryMatches;
    });
  }

  /**
   * Normalize a country name to lowercase standard form.
   * Handles aliases like "UK" -> "england", "Dutch" -> "netherlands"
   */
  private normalizeCountryName(country: string): string {
    const lowered = country.toLowerCase().trim();

    // Check if it's an alias
    if (COUNTRY_ALIASES[lowered]) {
      return COUNTRY_ALIASES[lowered];
    }

    return lowered;
  }

  /**
   * Get country name from a league name.
   * E.g., "Premier League" -> "england", "Bundesliga" -> "germany"
   */
  private getCountryFromLeagueName(leagueName: string): string | null {
    const lowered = leagueName.toLowerCase().trim();

    // Direct match
    if (LEAGUE_TO_COUNTRY[lowered]) {
      return LEAGUE_TO_COUNTRY[lowered];
    }

    // Partial match
    for (const [league, country] of Object.entries(LEAGUE_TO_COUNTRY)) {
      if (lowered.includes(league) || league.includes(lowered)) {
        return country;
      }
    }

    return null;
  }

  /**
   * Resolve date range filter to array of date strings.
   * Cache only has 3 days of data, so we limit accordingly.
   */
  private resolveDateRange(dateRange: DateRangeFilter): string[] {
    const today = new Date();
    // Normalize to start of day in local timezone
    today.setHours(0, 0, 0, 0);

    const dates: string[] = [];

    switch (dateRange.type) {
      case 'today':
        dates.push(this.formatDate(today));
        break;

      case 'tomorrow':
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dates.push(this.formatDate(tomorrow));
        break;

      case 'next_3_days':
      default:
        // Include today and next 2 days (3 days total)
        for (let i = 0; i < CONFIG.maxDaysToSearch; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() + i);
          dates.push(this.formatDate(date));
        }
        break;
    }

    return dates;
  }

  /**
   * Format date as YYYY-MM-DD string.
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get list of available countries from cached fixtures.
   */
  async getAvailableCountries(): Promise<string[]> {
    const dates = this.resolveDateRange({ type: 'next_3_days' });
    const countriesSet = new Set<string>();

    for (const date of dates) {
      try {
        const fixtures = await this.getFixturesForDate(date);
        fixtures.forEach((f) => {
          if (f.league?.country) {
            // Store with original capitalization from the data
            countriesSet.add(f.league.country);
          }
        });
      } catch {
        // Continue with other dates
      }
    }

    return Array.from(countriesSet).sort();
  }

  /**
   * Get list of available leagues from cached fixtures.
   */
  async getAvailableLeagues(): Promise<
    Array<{ id: number; name: string; country: string }>
  > {
    const dates = this.resolveDateRange({ type: 'next_3_days' });
    const leaguesMap = new Map<
      number,
      { id: number; name: string; country: string }
    >();

    for (const date of dates) {
      try {
        const fixtures = await this.getFixturesForDate(date);
        fixtures.forEach((f) => {
          if (!leaguesMap.has(f.league.id)) {
            leaguesMap.set(f.league.id, {
              id: f.league.id,
              name: f.league.name,
              country: f.league.country,
            });
          }
        });
      } catch {
        // Continue with other dates
      }
    }

    return Array.from(leaguesMap.values()).sort((a, b) =>
      a.country.localeCompare(b.country),
    );
  }

  /**
   * Get fixture count for a specific date (for monitoring/debugging)
   */
  async getFixtureCountForDate(date: string): Promise<number> {
    const idsKey = `${CONFIG.cacheKeyPrefix}:ids:${date}`;
    const idsJson = await this.redisService.get<string>(idsKey);

    if (!idsJson) {
      return 0;
    }

    try {
      const fixtureIds =
        typeof idsJson === 'object'
          ? (idsJson as unknown as number[])
          : JSON.parse(idsJson);
      return Array.isArray(fixtureIds) ? fixtureIds.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get cache health status
   */
  async getCacheHealth(): Promise<{
    dates: Array<{ date: string; fixtureCount: number }>;
    totalFixtures: number;
  }> {
    const dates = this.resolveDateRange({ type: 'next_3_days' });
    const dateStats: Array<{ date: string; fixtureCount: number }> = [];
    let totalFixtures = 0;

    for (const date of dates) {
      const count = await this.getFixtureCountForDate(date);
      dateStats.push({ date, fixtureCount: count });
      totalFixtures += count;
    }

    return {
      dates: dateStats,
      totalFixtures,
    };
  }
}
