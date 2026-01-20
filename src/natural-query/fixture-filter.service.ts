import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { KickerGPTFixturesResponse } from '../fixtures/types/fixtures-response.type';
import { ClassifiedIntent, DateRangeFilter } from './types/natural-query.types';
import {
  getLeagueIdsForCountry,
  getLeagueIdByName,
  COUNTRY_ALIASES,
} from './types/country-league-mapping';

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
      const fixtures = await this.getFixturesForDate(date);
      allFixtures.push(...fixtures);
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
    const idsKey = `fixtures:ids:${date}`;
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

    this.logger.debug(`Found ${fixtureIds.length} fixture IDs for ${date}`);

    // Fetch all fixtures using pipeline for efficiency
    const fixtures: KickerGPTFixturesResponse[] = [];
    const pipeline = this.redisService.pipeline();

    if (!pipeline) {
      this.logger.warn('Redis pipeline not available');
      return [];
    }

    for (const id of fixtureIds) {
      pipeline.get(`fixture:${id}`);
    }

    const results = await pipeline.exec();

    if (results) {
      for (const result of results) {
        if (result) {
          try {
            const fixture =
              typeof result === 'object'
                ? (result as unknown as KickerGPTFixturesResponse)
                : (JSON.parse(result as string) as KickerGPTFixturesResponse);
            fixtures.push(fixture);
          } catch {
            // Skip invalid entries
          }
        }
      }
    }

    return fixtures;
  }

  /**
   * Apply country and league filters to fixtures.
   */
  private applyFilters(
    fixtures: KickerGPTFixturesResponse[],
    intent: ClassifiedIntent,
  ): KickerGPTFixturesResponse[] {
    const { countries, leagues } = intent.filters;

    // Build set of allowed league IDs from countries
    const allowedLeagueIds = new Set<number>();

    // Add league IDs from country filters
    for (const country of countries) {
      const leagueIds = getLeagueIdsForCountry(country);
      leagueIds.forEach((id) => allowedLeagueIds.add(id));
    }

    // Add directly specified league IDs
    for (const league of leagues) {
      const leagueId = getLeagueIdByName(league);
      if (leagueId) {
        allowedLeagueIds.add(leagueId);
      }
    }

    // If no country/league filters, return all fixtures
    if (
      allowedLeagueIds.size === 0 &&
      countries.length === 0 &&
      leagues.length === 0
    ) {
      this.logger.debug(
        'No country/league filters applied, returning all fixtures',
      );
      return fixtures;
    }

    // Filter fixtures
    return fixtures.filter((fixture) => {
      // If we have specific league IDs, filter by them
      if (allowedLeagueIds.size > 0) {
        return allowedLeagueIds.has(fixture.league.id);
      }

      // Otherwise try to match by country name
      if (countries.length > 0) {
        const fixtureCountry = fixture.league.country.toLowerCase();
        return countries.some((c) => {
          const normalizedCountry = c.toLowerCase();
          const aliasedCountry =
            COUNTRY_ALIASES[normalizedCountry] || normalizedCountry;
          return (
            fixtureCountry === aliasedCountry ||
            fixtureCountry.includes(aliasedCountry) ||
            aliasedCountry.includes(fixtureCountry)
          );
        });
      }

      // Match by league name
      if (leagues.length > 0) {
        const fixtureLeague = fixture.league.name.toLowerCase();
        return leagues.some((l) => {
          const normalizedLeague = l.toLowerCase();
          return (
            fixtureLeague.includes(normalizedLeague) ||
            normalizedLeague.includes(fixtureLeague)
          );
        });
      }

      return true;
    });
  }

  /**
   * Resolve date range filter to array of date strings.
   * Cache only has 3 days of data, so we limit accordingly.
   */
  private resolveDateRange(dateRange: DateRangeFilter): string[] {
    const today = new Date();
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
        for (let i = 0; i < 3; i++) {
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
      const fixtures = await this.getFixturesForDate(date);
      fixtures.forEach((f) => countriesSet.add(f.league.country));
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
    }

    return Array.from(leaguesMap.values()).sort((a, b) =>
      a.country.localeCompare(b.country),
    );
  }
}
