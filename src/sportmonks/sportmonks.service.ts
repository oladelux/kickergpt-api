import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { request as httpsRequest } from 'node:https';
import { ConfigService } from '@nestjs/config';
import { URL } from 'node:url';
import { AllConfigType } from '../config/config.type';
import { SportmonksConfig } from './config/sportmonks-config.type';
import { WeatherConfig } from '../weather/config/weather-config.type';
import {
  FootballLeague,
  PlayerInjury,
  SportmonksFixture,
  SportmonksFixturesRequestOptions,
  SportmonksFixturesResponse,
  SportmonksLeague,
  SportmonksParticipant,
  SportmonksOdd,
  SportmonksScore,
  SportmonksSeason,
  SportmonksSidelined,
  SportmonksVenue,
  SportmonksWeatherReport,
  SportmonksPagination,
  SportmonksLineup,
} from './types/fixture';
import { RedisService } from '../redis/redis.service';
import {
  ApiFootballFixtureVenue,
  ApiFootballGoals,
  ApiFootballTeams,
  KickerGPTFixturesResponse,
  KickerGPTInjuryPlayerFlag,
  KickerGPTMatchSummary,
  KickerGPTPlayerRating,
} from '../fixtures/types/fixtures-response.type';

type HeadToHeadQuery = {
  homeTeamId: number;
  awayTeamId: number;
};

type InjuriesQuery = {
  sidelined: SportmonksSidelined[];
};

type WeatherTimelineDay = {
  datetime?: string;
  tempmax?: number;
  tempmin?: number;
  precipprob?: number;
  conditions?: string;
  description?: string;
};

type WeatherTimelineResponse = {
  days?: WeatherTimelineDay[];
};

@Injectable()
export class SportmonksService {
  private readonly logger = new Logger(SportmonksService.name);
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly apiRequestIntervalMs: number;
  private readonly fixturesCacheTtlSeconds = 60 * 60 * 48;
  private readonly fixturesResponseCacheTtlSeconds = 60 * 60 * 48;
  private readonly weatherApiKey?: string;
  private readonly weatherBaseUrl?: string;
  private weatherUnitGroup: WeatherConfig['unitGroup'] = 'metric';
  private readonly externalWeatherSummaryCache = new Map<
    string,
    string | null
  >();
  private readonly defaultTimezone = 'Europe/Berlin'; // CET/CEST canonical IANA zone
  private apiRequestQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly redisService: RedisService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    const sportmonksConfig = this.configService.getOrThrow<SportmonksConfig>(
      'sportmonks',
      {
        infer: true,
      },
    );

    this.apiToken = sportmonksConfig.apiToken;
    this.baseUrl = sportmonksConfig.baseUrl.replace(/\/$/, '');
    this.apiRequestIntervalMs = sportmonksConfig.minRequestIntervalMs;

    const weatherConfig = this.configService.get<WeatherConfig>('weather', {
      infer: true,
    });

    if (weatherConfig) {
      this.weatherApiKey = weatherConfig.apiKey;
      this.weatherBaseUrl = weatherConfig.baseUrl.replace(/\/$/, '');
      this.weatherUnitGroup = weatherConfig.unitGroup;
    }
  }

  private scheduleApiFootballRequest<T>(
    callback: () => Promise<T>,
  ): Promise<T> {
    const execution = this.apiRequestQueue.then(callback);
    this.apiRequestQueue = execution
      .catch(() => undefined)
      .then(() => this.delay(this.apiRequestIntervalMs));
    return execution;
  }

  private delay(ms: number): Promise<void> {
    if (!ms || ms <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async requestJson<T>(
    url: URL,
    headers: Record<string, string>,
    errorMessage: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          method: 'GET',
          headers,
        },
        (response) => {
          const chunks: Uint8Array[] = [];

          response.on('data', (chunk) => {
            chunks.push(chunk);
          });

          response.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            let parsedBody: unknown = rawBody;

            if (rawBody.length > 0) {
              try {
                parsedBody = JSON.parse(rawBody);
              } catch {
                reject(
                  new InternalServerErrorException(
                    'Failed to parse upstream response.',
                  ),
                );
                return;
              }
            } else {
              parsedBody = undefined;
            }

            const statusCode = response.statusCode ?? HttpStatus.BAD_GATEWAY;

            if (statusCode >= 200 && statusCode < 300) {
              resolve(parsedBody as T);
              return;
            }

            reject(
              new HttpException(
                {
                  message: errorMessage,
                  statusCode,
                  error: parsedBody,
                },
                HttpStatus.BAD_GATEWAY,
              ),
            );
          });
        },
      );

      request.on('error', (error) => {
        reject(
          new InternalServerErrorException(
            `Unable to reach upstream provider. ${error.message}`,
          ),
        );
      });

      request.end();
    });
  }

  private async get<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const sanitizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${sanitizedPath}`);

    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === 'undefined') {
        return;
      }
      url.searchParams.set(key, String(value));
    });

    return this.scheduleApiFootballRequest(() =>
      this.requestJson<T>(
        url,
        {
          Accept: 'application/json',
          Authorization: this.apiToken,
        },
        'API-Football request failed.',
      ),
    );
  }

  /**
   * Fetches all pages of fixtures for a given endpoint
   */
  private async getAllFixtures(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<SportmonksFixturesResponse> {
    const allFixtures: SportmonksFixture[] = [];
    let currentPage = 1;
    let hasMore = true;
    let timezone = '';
    let finalPagination: SportmonksPagination | null = null;

    while (hasMore) {
      const response = await this.get<SportmonksFixturesResponse>(path, {
        ...query,
        page: currentPage,
      });

      // Handle cases where response or response.data is null/undefined
      if (!response) {
        this.logger.warn(
          `No response from Sportmonks API at page ${currentPage} for ${path}`,
        );
        break;
      }

      // If data is null, undefined, or empty array, treat as no results
      const fixtures = response.data;
      if (!fixtures || !Array.isArray(fixtures)) {
        this.logger.warn(
          `No fixtures data in response at page ${currentPage} for ${path}`,
        );
        break;
      }

      // Collect fixtures from this page
      if (fixtures.length > 0) {
        allFixtures.push(...fixtures);
      }

      timezone = response.timezone || timezone;
      finalPagination = response.pagination;

      // Check if there are more pages
      if (response.pagination?.has_more && fixtures.length > 0) {
        currentPage++;
        this.logger.log(`Fetching page ${currentPage} for ${path}...`);
      } else {
        hasMore = false;
      }
    }

    this.logger.log(
      `Fetched ${allFixtures.length} total fixtures from ${path}`,
    );

    // Return combined response
    return {
      timezone,
      data: allFixtures,
      pagination: {
        count: allFixtures.length,
        per_page: finalPagination?.per_page ?? 25,
        current_page: 1,
        next_page: null,
        has_more: false,
      },
    };
  }

  /**
   * Helper function to execute promises in controlled batches
   * Prevents overwhelming the API with too many concurrent requests
   */
  private async fetchInBatches<T>(
    promises: (() => Promise<T>)[],
    batchSize: number = 5,
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((fn) => fn()));
      results.push(...batchResults);
      this.logger.log(
        `Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(promises.length / batchSize)}`,
      );
    }

    return results;
  }

  /**
   * Optimized version of getAllFixtures that fetches pages in parallel
   * Uses a semi-parallel approach: fetches batches of pages until has_more is false
   */
  private async getAllFixturesParallel(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<SportmonksFixturesResponse> {
    // Fetch first page with increased page size to get pagination info
    const firstPageQuery = {
      ...query,
      page: 1,
      per_page: 50, // Use maximum page size to reduce total pages
    };

    const firstResponse = await this.get<SportmonksFixturesResponse>(
      path,
      firstPageQuery,
    );

    // Handle cases where response or response.data is null/undefined
    if (!firstResponse) {
      this.logger.warn(`No response from Sportmonks API for ${path}`);
      return {
        timezone: '',
        data: [],
        pagination: {
          count: 0,
          per_page: 50,
          current_page: 1,
          next_page: null,
          has_more: false,
        },
      };
    }

    const allFixtures: SportmonksFixture[] = [];
    const firstPageFixtures = firstResponse.data;

    if (!firstPageFixtures || !Array.isArray(firstPageFixtures)) {
      this.logger.warn(`No fixtures data in response for ${path}`);
      return {
        timezone: firstResponse.timezone || '',
        data: [],
        pagination: {
          count: 0,
          per_page: 50,
          current_page: 1,
          next_page: null,
          has_more: false,
        },
      };
    }

    // Add first page fixtures
    allFixtures.push(...firstPageFixtures);

    const timezone = firstResponse.timezone || '';
    let hasMore = firstResponse.pagination?.has_more ?? false;
    let currentPage = 1;

    // Keep fetching pages in batches until has_more is false
    while (hasMore) {
      // Prepare batch of next 5 pages
      const batchSize = 5;
      const pagePromises: (() => Promise<SportmonksFixturesResponse>)[] = [];

      for (let i = 0; i < batchSize; i++) {
        const nextPage = currentPage + i + 1;
        pagePromises.push(() =>
          this.get<SportmonksFixturesResponse>(path, {
            ...query,
            page: nextPage,
            per_page: 50,
          }),
        );
      }

      this.logger.log(
        `Fetching pages ${currentPage + 1} to ${currentPage + batchSize} in parallel for ${path}...`,
      );

      // Fetch batch in parallel
      const batchResponses = await Promise.all(pagePromises.map((fn) => fn()));

      // Process responses and check if we should continue
      hasMore = false;
      for (const response of batchResponses) {
        if (response?.data && Array.isArray(response.data)) {
          // Only add if there's actual data
          if (response.data.length > 0) {
            allFixtures.push(...response.data);
            // Check if this page indicates more pages exist
            if (response.pagination?.has_more) {
              hasMore = true;
            }
          }
        }
      }

      currentPage += batchSize;

      // Safety check: if we've fetched too many pages, stop
      if (currentPage > 100) {
        this.logger.warn(
          `Reached safety limit of 100 pages for ${path}, stopping`,
        );
        break;
      }
    }

    this.logger.log(
      `Fetched ${allFixtures.length} total fixtures from ${path} (parallel)`,
    );

    // Return combined response
    return {
      timezone,
      data: allFixtures,
      pagination: {
        count: allFixtures.length,
        per_page: 50,
        current_page: 1,
        next_page: null,
        has_more: false,
      },
    };
  }

  private async getFixturesByDate(
    date: string,
    timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    const resolvedTimezone = this.resolveTimezone(timezone);
    const result = await this.getAllFixtures(`/fixtures/date/${date}`, {
      include:
        'participants;participants.venue;odds;venue;sidelined.sideline;sidelined.player.position;sidelined.type;league.country;season;scores;referees;referees.referee;state',
      filters: 'markets:1;bookmakers:1',
      timezone: resolvedTimezone,
    });
    return result;
  }

  private async getFixturesBetweenDates(
    startDate: string,
    endDate: string,
    timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    const resolvedTimezone = this.resolveTimezone(timezone);
    const result = await this.getAllFixtures(
      `/fixtures/between/${startDate}/${endDate}`,
      {
        include:
          'participants;participants.venue;odds;venue;sidelined.sideline;sidelined.player.position;sidelined.type;league.country;season;scores;referees;referees.referee;state',
        filters: 'markets:1;bookmakers:1',
        timezone: resolvedTimezone,
      },
    );
    return result;
  }

  /**
   * Optimized version of getFixturesBetweenDates that uses parallel page fetching
   */
  private async getFixturesBetweenDatesOptimized(
    startDate: string,
    endDate: string,
    timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    const resolvedTimezone = this.resolveTimezone(timezone);
    const result = await this.getAllFixturesParallel(
      `/fixtures/between/${startDate}/${endDate}`,
      {
        include:
          'participants;participants.venue;odds;venue;sidelined.sideline;sidelined.player.position;sidelined.type;league.country;season;scores;referees;referees.referee;state',
        filters: 'markets:1;bookmakers:1',
        timezone: resolvedTimezone,
      },
    );
    return result;
  }

  private resolveFinalScore(
    scores: SportmonksScore[],
  ): KickerGPTFixturesResponse['finalScore'] {
    if (!scores || scores.length === 0) {
      return null;
    }

    let home = 0;
    let away = 0;

    for (const score of scores) {
      if (score.score.participant === 'home') {
        home = Math.max(home, score.score.goals ?? 0);
      }
      if (score.score.participant === 'away') {
        away = Math.max(away, score.score.goals ?? 0);
      }
    }

    const winner =
      home > away ? 'home' : away > home ? 'away' : ('draw' as const);

    return { home, away, winner };
  }

  private async buildFixturesResponse(
    timezone?: string,
  ): Promise<KickerGPTFixturesResponse[]> {
    //const result = await this.getFixturesByDate(date, timezone);
    const result = await this.getThreeDaysFixtures(timezone);

    return Promise.all(
      result.data.map(
        async (
          apiFixture: SportmonksFixture,
        ): Promise<KickerGPTFixturesResponse> => {
          const {
            participants,
            sidelined,
            weatherreport,
            league,
            season,
            venue,
            referees,
            odds,
          } = apiFixture;

          const homeTeam = participants.find(
            (p) => p.meta?.location === 'home',
          );
          const awayTeam = participants.find(
            (p) => p.meta?.location === 'away',
          );

          const homeTeamId = homeTeam?.id ?? participants[0].id;
          const awayTeamId = awayTeam?.id ?? participants[1].id;

          const h2hResults = await this.getHeadToHeadFixtures({
            homeTeamId,
            awayTeamId,
          });

          const homeInjuryResults = this.getInjuries({
            sidelined: sidelined.filter(
              (sidelined) => sidelined.participant_id === homeTeamId,
            ),
          });

          const awayInjuryResults = this.getInjuries({
            sidelined: sidelined.filter(
              (sidelined) => sidelined.participant_id === awayTeamId,
            ),
          });

          const weatherSummary = await this.resolveWeatherSummary(
            weatherreport,
            apiFixture,
          );
          const leagueResponse = this.buildLeagueResponse(league, season);
          const teams = this.buildTeamsResponse(participants);
          const venueResponse = venue ? this.buildVenueResponse(venue) : null;
          const isDerby = this.isDerbyMatch(homeTeam, awayTeam);
          const matchOdds = this.buildMatchOdds(odds, apiFixture.id);
          const h2h: KickerGPTMatchSummary[] = await Promise.all(
            (h2hResults ?? []).map(async (result) => ({
              id: result.id,
              date: result.starting_at,
              timestamp: result.starting_at_timestamp,
              league: this.buildLeagueResponse(result.league, result.season),
              teams: this.buildTeamsResponse(result.participants),
              venue: result.venue
                ? this.buildVenueResponse(result.venue)
                : null,
              status: null,
              goals: this.buildScoresResponse(result.scores),
              derby: this.isDerbyMatch(homeTeam, awayTeam),
              weatherSummary: await this.resolveWeatherSummary(
                result.weatherreport,
                result,
              ),
              referee:
                result.referees.length > 0
                  ? (result.referees[0].referee.display_name ?? 'unknown')
                  : 'unknown',
            })),
          );

          const homeInjuries: KickerGPTInjuryPlayerFlag[] =
            homeInjuryResults.map((result) => {
              return {
                playerId: result.id,
                name: result.name,
                reason: result.reason,
                date: result.date,
              };
            });

          const awayInjuries: KickerGPTInjuryPlayerFlag[] =
            awayInjuryResults.map((result) => {
              return {
                playerId: result.id,
                name: result.name,
                reason: result.reason,
                date: result.date,
              };
            });

          const homeTeamRecentMatchesResults =
            await this.getRecentFixturesByTeam(
              homeTeamId,
              this.formatDateToYMD(season.starting_at),
              this.getToday(),
            );

          const awayTeamRecentMatchesResults =
            await this.getRecentFixturesByTeam(
              awayTeamId,
              this.formatDateToYMD(season.starting_at),
              this.getToday(),
            );

          const homeTeamRecentMatches = await this.buildMatchSummaries(
            homeTeamRecentMatchesResults,
            `Fixture ${apiFixture.id} home form`,
          );

          const awayTeamRecentMatches = await this.buildMatchSummaries(
            awayTeamRecentMatchesResults,
            `Fixture ${apiFixture.id} away form`,
          );

          return {
            id: apiFixture.id,
            timezone: result.timezone,
            date: apiFixture.starting_at,
            timestamp: apiFixture.starting_at_timestamp,
            finalScore: this.resolveFinalScore(apiFixture.scores ?? []),
            periods: null,
            status: null,
            league: leagueResponse,
            teams,
            venue: venueResponse,
            derby: isDerby,
            matchType: 'league',
            homeOdd: matchOdds.home,
            awayOdd: matchOdds.away,
            weatherSummary,
            referee:
              referees.length > 0
                ? (referees[0].referee.display_name ?? 'unknown')
                : 'unknown',
            h2h,
            homeInjuries,
            awayInjuries,
            homeTeamRecentMatches,
            awayTeamRecentMatches,
            homeNews: [],
            awayNews: [],
          };
        },
      ),
    );
  }

  async getFixturesResponseForDate(
    timezone?: string,
  ): Promise<KickerGPTFixturesResponse[]> {
    return this.buildFixturesResponse(timezone);
  }

  async getHeadToHeadFixtures(
    query: HeadToHeadQuery,
  ): Promise<SportmonksFixture[]> {
    const { homeTeamId, awayTeamId } = query;

    const result = await this.getAllFixtures(
      `/fixtures/head-to-head/${homeTeamId}/${awayTeamId}`,
      {
        include:
          'participants;participants.venue;odds;venue;scores;referees;referees.referee;formations;weatherReport;sidelined.sideline;sidelined.player.position;sidelined.type;league;league.country;season;state;lineups.details.type',
        filters: 'markets:1;bookmakers:1;lineupDetailTypes:118',
      },
    );

    return result.data;
  }

  async getRecentFixturesByTeam(
    teamId: number,
    startDate: string,
    endDate: string = this.getToday(),
  ): Promise<SportmonksFixture[]> {
    const result = await this.getAllFixtures(
      `/fixtures/between/${startDate}/${endDate}/${teamId}`,
      {
        include:
          'participants;participants.venue;odds;venue;scores;referees;referees.referee;formations;weatherReport;sidelined.sideline;sidelined.player.position;sidelined.type;league;league.country;season;state;lineups.details.type',
        filters: 'markets:1;bookmakers:1;lineupDetailTypes:118',
      },
    );

    return result.data;
  }

  getInjuries(query: InjuriesQuery): PlayerInjury[] {
    const { sidelined } = query;

    const injuries =
      sidelined.length > 0
        ? sidelined.map((sidelined) => {
            return {
              id: sidelined.player.id,
              name: `${sidelined.player.firstname} ${sidelined.player.lastname}`,
              reason: sidelined.sideline?.category ?? 'unknown',
              date: sidelined.sideline?.start_date ?? 'unknown',
              expectedReturnDate: sidelined.sideline?.end_date ?? 'unknown',
              position: sidelined.player.position.name ?? 'unknown',
              completed: sidelined.sideline?.completed,
            };
          })
        : [];
    return injuries;
  }

  async getTodayFixtures(
    timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    return this.getFixturesByDate(this.getToday(), timezone);
  }

  async getThreeDaysFixtures(
    timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    const threeDaysFromToday = new Date(this.getToday());
    threeDaysFromToday.setDate(threeDaysFromToday.getDate() + 3);
    return this.getFixturesBetweenDates(
      this.getToday(),
      threeDaysFromToday.toISOString().split('T')[0],
      timezone,
    );
  }

  /**
   * Optimized version of getThreeDaysFixtures that uses parallel page fetching
   * This significantly improves performance by fetching multiple pages concurrently
   */
  async getThreeDaysFixturesOptimized(
    timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    const startTime = Date.now();
    this.logger.log('Fetching three-day fixtures (optimized)...');

    const threeDaysFromToday = new Date(this.getToday());
    threeDaysFromToday.setDate(threeDaysFromToday.getDate() + 2);

    const result = await this.getFixturesBetweenDatesOptimized(
      this.getToday(),
      threeDaysFromToday.toISOString().split('T')[0],
      timezone,
    );

    const duration = Date.now() - startTime;
    this.logger.log(
      `Three-day fixtures fetch completed: ${result.data.length} fixtures in ${duration}ms`,
    );

    return result;
  }

  async getControlRoomFixturesOfDay(
    date: string,
    timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    return this.getFixturesByDate(date, timezone);
  }

  private buildSingleFixtureCacheKey(fixtureId: number): string {
    return `fixture:${fixtureId}`;
  }

  private buildFixturesIdsCacheKey(date?: string): string {
    return `fixtures:ids:${date ?? this.getToday()}`;
  }

  async getTodayFixturesForRedis(): Promise<KickerGPTFixturesResponse[]> {
    const fixturesResponses = await this.buildFixturesResponse();

    if (fixturesResponses.length === 0) {
      return [];
    }

    const fixtureIds: number[] = [];

    // Store each fixture separately using pipeline for efficiency
    const pipeline = this.redisService.pipeline();

    for (const fixture of fixturesResponses) {
      const key = this.buildSingleFixtureCacheKey(fixture.id);
      pipeline?.set(key, JSON.stringify(fixture), {
        ex: this.fixturesCacheTtlSeconds,
      });
      fixtureIds.push(fixture.id);
    }

    // Store the list of fixture IDs (very small, just numbers)
    pipeline?.set(this.buildFixturesIdsCacheKey(), JSON.stringify(fixtureIds), {
      ex: this.fixturesCacheTtlSeconds,
    });

    await pipeline?.exec();

    this.logger.log(`Cached ${fixturesResponses.length} fixtures individually`);

    return fixturesResponses;
  }

  async getSelectedFixture(
    date: string,
    options: SportmonksFixturesRequestOptions = {},
  ): Promise<SportmonksFixturesResponse | undefined> {
    const cacheKey = this.buildFixturesIdsCacheKey(date);
    const cached = await this.redisService.get<string>(cacheKey);

    if (!cached) {
      throw new ServiceUnavailableException(
        'Fixtures cache is not available yet. Please try again shortly.',
      );
    }

    return this.get<SportmonksFixturesResponse>(`/fixtures/date/${date}`, {
      include: 'participants;odds;venue',
      ...options,
    });
  }

  async getCachedFixturesForDate(
    date: string,
  ): Promise<KickerGPTFixturesResponse[]> {
    const idsKey = this.buildFixturesIdsCacheKey(date);
    const idsJson = await this.redisService.get<string>(idsKey);

    if (!idsJson) {
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

    if (fixtureIds.length === 0) {
      return [];
    }

    const fixtures: KickerGPTFixturesResponse[] = [];

    // Fetch all fixtures using pipeline
    const pipeline = this.redisService.pipeline();
    for (const id of fixtureIds) {
      pipeline?.get(this.buildSingleFixtureCacheKey(id));
    }

    const results = await pipeline?.exec();

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

  async getSelectedControlRoomMatches(
    fixtureId: number,
    date: string,
  ): Promise<KickerGPTFixturesResponse | undefined> {
    const key = this.buildSingleFixtureCacheKey(fixtureId);

    // Try to get from cache first
    const cached = await this.redisService.get<string>(key);

    if (cached) {
      try {
        // Handle case where Redis returns already parsed object
        if (typeof cached === 'object') {
          return cached as unknown as KickerGPTFixturesResponse;
        }
        return JSON.parse(cached) as KickerGPTFixturesResponse;
      } catch {
        this.logger.warn(
          `Failed to parse fixture ${fixtureId} for date ${date} from cache`,
        );
      }
    }

    // Not in cache - fetch all fixtures for that date and cache them
    this.logger.log(
      `Fixture ${fixtureId} not in cache, fetching fixtures for ${date}`,
    );

    const fixturesResponses = await this.buildFixturesResponse();

    if (fixturesResponses.length === 0) {
      return undefined;
    }

    // Store all fixtures individually using pipeline
    const pipeline = this.redisService.pipeline();
    const fixtureIds: number[] = [];

    for (const fixture of fixturesResponses) {
      const fixtureKey = this.buildSingleFixtureCacheKey(fixture.id);
      pipeline?.set(fixtureKey, JSON.stringify(fixture), {
        ex: this.fixturesResponseCacheTtlSeconds,
      });
      fixtureIds.push(fixture.id);
    }

    // Store the list of fixture IDs for that date
    pipeline?.set(
      this.buildFixturesIdsCacheKey(date),
      JSON.stringify(fixtureIds),
      { ex: this.fixturesResponseCacheTtlSeconds },
    );

    await pipeline?.exec();

    this.logger.log(
      `Cached ${fixturesResponses.length} fixtures individually for ${date}`,
    );

    // Find and return the requested fixture
    return fixturesResponses.find((f) => f.id === fixtureId);
  }

  async getSelectedMatches(
    fixtureId: number,
  ): Promise<KickerGPTFixturesResponse | undefined> {
    const key = this.buildSingleFixtureCacheKey(fixtureId);
    const fixtureJson = await this.redisService.get<string>(key);

    if (fixtureJson) {
      try {
        // Handle case where Redis returns already parsed object
        if (typeof fixtureJson === 'object') {
          return fixtureJson as unknown as KickerGPTFixturesResponse;
        }
        return JSON.parse(fixtureJson) as KickerGPTFixturesResponse;
      } catch {
        this.logger.warn(`Failed to parse fixture ${fixtureId} from cache`);
      }
    }

    return undefined;
  }

  // REMOVE or rename the old buildFixturesCacheKey - it was conflicting
  // private buildFixturesCacheKey(date?: string): string {
  //   return `fixtures:${date ?? this.getToday()}`;
  // }

  private getToday(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');

    return `${now.getFullYear()}-${month}-${day}`;
  }

  /**
   * Formats a date string or Date object to YYYY-MM-DD format
   * Handles various input formats including ISO strings with timestamps
   */
  private formatDateToYMD(dateInput: string | Date | null | undefined): string {
    // Handle null/undefined inputs
    if (!dateInput) {
      return this.getToday();
    }

    const date =
      typeof dateInput === 'string' ? new Date(dateInput) : dateInput;

    // Check if date is valid
    if (isNaN(date.getTime())) {
      this.logger.warn(`Invalid date input: ${dateInput}, using today`);
      return this.getToday();
    }

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private resolveTimezone(timezone?: string): string {
    const trimmed = timezone?.trim();

    if (trimmed) {
      try {
        // Validate timezone using Intl; it throws on invalid identifiers.
        new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format();
        return trimmed;
      } catch {
        // Fall back to environment timezone if validation fails.
      }
    }

    return this.defaultTimezone;
  }

  private buildLeagueResponse(
    league: SportmonksLeague,
    season: SportmonksSeason,
  ): FootballLeague {
    return {
      id: league.id,
      name: league.name,
      country: league.country.name,
      logo: league.image_path,
      flag: league.image_path,
      season: season.name,
      round: null,
    };
  }

  private buildTeamsResponse(
    participants: SportmonksParticipant[],
  ): ApiFootballTeams {
    const homeTeam = participants.find((p) => p.meta?.location === 'home');
    const awayTeam = participants.find((p) => p.meta?.location === 'away');

    const home = homeTeam ?? participants[0];
    const away = awayTeam ?? participants[1];
    return {
      home: {
        id: home.id,
        name: home.name,
        logo: home.image_path,
        winner: home.meta.winner,
      },
      away: {
        id: away.id,
        name: away.name,
        logo: away.image_path,
        winner: away.meta.winner,
      },
    };
  }

  private buildVenueResponse(venue: SportmonksVenue): ApiFootballFixtureVenue {
    return {
      id: venue.id,
      name: venue.name,
      address: venue.address,
      city: venue.city_name,
    };
  }

  private async resolveWeatherSummary(
    reports: SportmonksWeatherReport[] | undefined,
    fixture: SportmonksFixture,
  ): Promise<string> {
    const primarySummary = this.buildWeatherSummary(reports);

    if (primarySummary && primarySummary !== 'Conditions unavailable') {
      return primarySummary;
    }

    const fallback = await this.getExternalWeatherSummary(fixture);
    return fallback ?? primarySummary;
  }

  private async getExternalWeatherSummary(
    fixture: SportmonksFixture,
  ): Promise<string | null> {
    if (!this.weatherApiKey || !this.weatherBaseUrl) {
      return null;
    }

    const location = this.getWeatherQueryLocationFromSportmonks(fixture);
    const date = this.getSportmonksFixtureDate(fixture);

    if (!location || !date) {
      return null;
    }

    const cacheKey = `${location.toLowerCase()}|${date}`;

    if (this.externalWeatherSummaryCache.has(cacheKey)) {
      return this.externalWeatherSummaryCache.get(cacheKey) ?? null;
    }

    try {
      const response = await this.fetchExternalWeatherTimeline(
        location,
        date,
        8000,
      );
      const summary = this.formatExternalWeatherSummary(response?.days?.[0]);
      this.externalWeatherSummaryCache.set(cacheKey, summary ?? null);
      return summary ?? null;
    } catch (error) {
      this.logger.warn(
        `[Weather ${fixture.id}] external lookup failed: ${
          (error as Error)?.message ?? 'unknown'
        }`,
      );
      this.externalWeatherSummaryCache.set(cacheKey, null);
      return null;
    }
  }

  private getWeatherQueryLocationFromSportmonks(
    fixture: SportmonksFixture,
  ): string | null {
    const venue = fixture.venue;

    if (!venue) {
      return null;
    }

    const potentialLocations = [
      venue.city_name,
      venue.name,
      venue.address,
    ].filter((value): value is string => typeof value === 'string');

    for (const location of potentialLocations) {
      const trimmed = location.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return null;
  }

  private getSportmonksFixtureDate(fixture: SportmonksFixture): string | null {
    if (fixture.starting_at) {
      const fromStartingAt = new Date(fixture.starting_at)
        .toISOString()
        .split('T')[0];
      if (fromStartingAt) {
        return fromStartingAt;
      }
    }

    if (fixture.starting_at_timestamp) {
      const fromTimestamp = new Date(fixture.starting_at_timestamp * 1000)
        .toISOString()
        .split('T')[0];
      if (fromTimestamp) {
        return fromTimestamp;
      }
    }

    return null;
  }

  private async fetchExternalWeatherTimeline(
    location: string,
    date: string,
    timeoutMs = 8000,
  ): Promise<WeatherTimelineResponse | null> {
    if (!this.weatherBaseUrl || !this.weatherApiKey) {
      return null;
    }

    const encodedLocation = encodeURIComponent(location);
    const url = new URL(`${this.weatherBaseUrl}/${encodedLocation}/${date}`);
    url.searchParams.set('key', this.weatherApiKey);
    url.searchParams.set('unitGroup', this.weatherUnitGroup);
    url.searchParams.set('include', 'days');

    return this.performJsonRequest<WeatherTimelineResponse>(
      url,
      {
        Accept: 'application/json',
      },
      'Weather provider request failed.',
      timeoutMs,
    );
  }

  private formatExternalWeatherSummary(
    day?: WeatherTimelineDay,
  ): string | null {
    if (!day) {
      return null;
    }

    const parts: string[] = [];
    const description = day.description?.trim() || day.conditions?.trim();

    if (description) {
      parts.push(description);
    }

    const temperatureParts: string[] = [];
    const unit = this.getTemperatureUnitSuffix();
    if (typeof day.tempmax === 'number') {
      temperatureParts.push(`high ${Math.round(day.tempmax)}${unit}`);
    }
    if (typeof day.tempmin === 'number') {
      temperatureParts.push(`low ${Math.round(day.tempmin)}${unit}`);
    }
    if (temperatureParts.length > 0) {
      parts.push(temperatureParts.join(', '));
    }

    if (typeof day.precipprob === 'number') {
      parts.push(`precip ${Math.round(day.precipprob)}%`);
    }

    return parts.length > 0 ? parts.join('. ') : null;
  }

  private getTemperatureUnitSuffix(): string {
    switch (this.weatherUnitGroup) {
      case 'us':
        return '°F';
      case 'base':
        return 'K';
      default:
        return '°C';
    }
  }

  private async performJsonRequest<T>(
    url: URL,
    headers: Record<string, string>,
    errorMessage: string,
    timeoutMs = 8000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          method: 'GET',
          headers,
        },
        (response) => {
          const chunks: Uint8Array[] = [];

          response.on('data', (chunk) => {
            chunks.push(chunk);
          });

          response.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            let parsedBody: unknown = rawBody;

            if (rawBody.length > 0) {
              try {
                parsedBody = JSON.parse(rawBody);
              } catch {
                reject(new InternalServerErrorException(errorMessage));
                return;
              }
            } else {
              parsedBody = undefined;
            }

            const statusCode = response.statusCode ?? HttpStatus.BAD_GATEWAY;

            if (statusCode >= 200 && statusCode < 300) {
              resolve(parsedBody as T);
              return;
            }

            reject(
              new HttpException(
                {
                  message: errorMessage,
                  statusCode,
                  error: parsedBody,
                },
                HttpStatus.BAD_GATEWAY,
              ),
            );
          });
        },
      );

      request.on('error', (error) => {
        reject(
          new InternalServerErrorException(`${errorMessage} ${error.message}`),
        );
      });

      request.setTimeout(timeoutMs, () => {
        request.destroy();
        reject(
          new InternalServerErrorException(
            `${errorMessage} Request timed out after ${timeoutMs}ms`,
          ),
        );
      });

      request.end();
    });
  }

  private buildWeatherSummary(reports?: SportmonksWeatherReport[]): string {
    const primary = reports?.[0];

    if (!primary) {
      return 'Conditions unavailable';
    }

    const parts: string[] = [];

    if (primary.description) {
      parts.push(primary.description);
    }

    const dayTemp = primary.temperature?.day;
    if (typeof dayTemp === 'number') {
      const metric = primary.metric?.toLowerCase().includes('f') ? '°F' : '°C';
      parts.push(`${dayTemp.toFixed(1)}${metric}`);
    }

    const windSpeed = primary.wind?.speed;
    if (typeof windSpeed === 'number') {
      parts.push(
        `wind ${windSpeed.toFixed(1)} ${this.resolveWindUnit(primary.metric)}`,
      );
    }

    if (primary.humidity) {
      parts.push(`humidity ${primary.humidity}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'Conditions unavailable';
  }

  private resolveWindUnit(metric?: string | null): string {
    if (!metric) {
      return 'm/s';
    }

    const normalized = metric.toLowerCase();
    if (normalized.includes('mph')) {
      return 'mph';
    }

    if (normalized.includes('km')) {
      return 'km/h';
    }

    return 'm/s';
  }

  private isDerbyMatch(
    homeTeam: SportmonksParticipant | undefined,
    awayTeam: SportmonksParticipant | undefined,
  ): boolean {
    if (!homeTeam || !awayTeam || !homeTeam.venue || !awayTeam.venue) {
      return false;
    }

    const homeCity = this.normalizeCity(homeTeam.venue.city_name);
    const awayCity = this.normalizeCity(awayTeam.venue.city_name);

    if (!homeCity || !awayCity) {
      return false;
    }

    return homeCity === awayCity;
  }

  private normalizeCity(city?: string | null): string | null {
    if (!city) {
      return null;
    }

    const normalized = city.trim().toLowerCase();

    return normalized.length > 0 ? normalized : null;
  }

  private buildScoresResponse(scores: SportmonksScore[]): ApiFootballGoals {
    if (!scores.length) {
      return { home: null, away: null };
    }

    return scores.reduce(
      (acc, entry) => {
        const side = entry.score?.participant;
        const goals = entry.score?.goals;

        if (side === 'home' && typeof goals === 'number') {
          acc.home = acc.home === null ? goals : Math.max(acc.home, goals);
        }

        if (side === 'away' && typeof goals === 'number') {
          acc.away = acc.away === null ? goals : Math.max(acc.away, goals);
        }

        return acc;
      },
      { home: null as number | null, away: null as number | null },
    );
  }

  private buildMatchOdds(odds: SportmonksOdd[], fixtureId: number) {
    const response: { home?: string; away?: string } = {};
    const relevantOdds = odds.filter((odd) => odd.fixture_id === fixtureId);

    for (const odd of relevantOdds) {
      const label = odd.name?.toLowerCase() ?? '';

      if (!response.home && label.includes('home')) {
        response.home = odd.value ?? undefined;
      }

      if (!response.away && label.includes('away')) {
        response.away = odd.value ?? undefined;
      }

      if (response.home && response.away) {
        break;
      }
    }

    return {
      home: response.home ?? undefined,
      away: response.away ?? undefined,
    };
  }

  private async buildMatchSummaries(
    fixtures: SportmonksFixture[],
    context?: string,
  ): Promise<KickerGPTMatchSummary[]> {
    const ctx = context ?? 'summaries';
    this.logger.log(`[${ctx}] start for ${fixtures.length} matches`);
    return Promise.all(
      fixtures.map(async (result) => {
        const {
          participants,
          weatherreport,
          league,
          season,
          venue,
          referees,
          scores,
          lineups,
        } = result;

        const homeTeam = participants.find((p) => p.meta?.location === 'home');
        const awayTeam = participants.find((p) => p.meta?.location === 'away');

        const homeTeamId = homeTeam?.id ?? participants[0].id;
        const awayTeamId = awayTeam?.id ?? participants[1].id;

        // Extract ratings if lineups exist
        const ratings =
          lineups && lineups.length > 0
            ? {
                home: this.extractPlayerRatings(lineups, homeTeamId),
                away: this.extractPlayerRatings(lineups, awayTeamId),
              }
            : undefined;

        const weatherSummary = await this.resolveWeatherSummary(
          weatherreport,
          result,
        );
        this.logger.log(`[${ctx}] summarized match ${result.id}`);

        return {
          id: result.id,
          date: result.starting_at,
          timestamp: result.starting_at_timestamp,
          league: this.buildLeagueResponse(league, season),
          teams: this.buildTeamsResponse(participants),
          venue: venue ? this.buildVenueResponse(venue) : null,
          status: null,
          goals: this.buildScoresResponse(scores),
          derby: this.isDerbyMatch(homeTeam, awayTeam),
          weatherSummary,
          referee:
            referees.length > 0
              ? (referees[0].referee.display_name ?? 'unknown')
              : 'unknown',
          ratings,
        };
      }),
    );
  }

  private extractPlayerRatings(
    lineups: SportmonksLineup[],
    teamId: number,
  ): { players: KickerGPTPlayerRating[]; teamAverage: number | null } {
    const teamLineups = lineups.filter((l) => l.team_id === teamId);

    const players: KickerGPTPlayerRating[] = [];

    for (const lineup of teamLineups) {
      // Find the rating detail - typically has type.code === 'rating' or type.developer_name includes 'rating'
      const ratingDetail = lineup.details?.find(
        (d) =>
          d.type?.code?.toLowerCase() === 'rating' ||
          d.type?.developer_name?.toLowerCase().includes('rating'),
      );

      if (ratingDetail && ratingDetail.data?.value != null) {
        const ratingValue =
          typeof ratingDetail.data.value === 'string'
            ? parseFloat(ratingDetail.data.value)
            : ratingDetail.data.value;

        if (!isNaN(ratingValue)) {
          players.push({
            playerId: lineup.player_id,
            playerName: lineup.player_name,
            rating: ratingValue,
            position: lineup.formation_field ?? undefined,
          });
        }
      }
    }

    // Calculate team average
    const validRatings = players
      .filter((p) => p.rating !== null)
      .map((p) => p.rating!);
    const teamAverage =
      validRatings.length > 0
        ? parseFloat(
            (
              validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length
            ).toFixed(2),
          )
        : null;

    return { players, teamAverage };
  }
}
