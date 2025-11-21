import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { AllConfigType } from '../config/config.type';
import { ApiFootballConfig } from './config/api-football-config.type';
import { WeatherConfig } from '../weather/config/weather-config.type';
import { RedisService } from '../redis/redis.service';
import {
  ApiFootballFixture,
  ApiFootballFixtureDetails,
  ApiFootballFixturesResponse,
  ApiFootballFixtureStatisticsEntry,
  ApiFootballFixtureStatisticsResponse,
  ApiFootballLineup,
  ApiFootballLineupsResponse,
  ApiFootballOdds,
  ApiFootballOddsResponse,
  ApiFootballPlayerStatistics,
  ApiFootballFixturePlayersResponse,
  ApiFootballStandingsLeague,
  ApiFootballStandingsResponse,
  ApiFootballInjury,
  ApiFootballInjuriesResponse,
  ApiFootballTeamDetails,
  ApiFootballTeamsResponse,
  ApiFootballSidelinedRecord,
  ApiFootballSidelinedResponse,
  KickerGPTFixturesResponse,
  KickerGPTMatchSummary,
  KickerGPTInjuryPlayerFlag,
} from './types/fixtures-response.type';

type HeadToHeadQuery = {
  homeTeamId: number;
  awayTeamId: number;
  leagueId?: number;
  season?: number;
  status?: string;
  date?: string;
  from?: string;
  to?: string;
  last?: number;
  next?: number;
  timezone?: string;
};

type FixtureStatisticsQuery = {
  fixtureId: number;
  teamId?: number;
  type?: string;
  half?: boolean;
};

type FixtureLineupsQuery = {
  fixtureId: number;
  teamId?: number;
  playerId?: number;
  type?: 'startXI' | 'substitutes';
};

type FixturePlayersQuery = {
  fixtureId: number;
  teamId?: number;
};

type TeamFixturesQuery = {
  teamId: number;
  leagueId?: number;
  season?: number;
  last?: number;
  next?: number;
  from?: string;
  to?: string;
  status?: string;
  timezone?: string;
};

type InjuriesQuery = {
  leagueId?: number;
  season?: number;
  fixtureId?: number;
  ids?: number[];
  teamId?: number;
  playerId?: number;
  date?: string;
  timezone?: string;
};

type OddsQuery = {
  fixtureId?: number;
  leagueId?: number;
  season?: number;
  date?: string;
  bookmakerId?: number;
  betId?: number;
  page?: number;
};

type SidelinedQuery = {
  playerId?: number;
  playerIds?: number[];
  coachId?: number;
  coachIds?: number[];
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
export class FixturesService {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly apiRequestIntervalMs: number;
  private readonly weatherApiKey?: string;
  private readonly weatherBaseUrl?: string;
  private readonly weatherUnitGroup: WeatherConfig['unitGroup'] = 'metric';
  private readonly teamDetailsCache = new Map<number, ApiFootballTeamDetails>();
  private readonly weatherSummaryCache = new Map<string, string | null>();
  private readonly fixturesCacheTtlSeconds = 60 * 60 * 6;
  private apiRequestQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly redisService: RedisService,
  ) {
    const apiFootballConfig = this.configService.getOrThrow<ApiFootballConfig>(
      'apiFootball',
      {
        infer: true,
      },
    );

    this.apiToken = apiFootballConfig.apiToken;
    this.baseUrl = apiFootballConfig.baseUrl.replace(/\/$/, '');
    this.apiRequestIntervalMs = apiFootballConfig.minRequestIntervalMs;

    const weatherConfig =
      this.configService.get<WeatherConfig>('weather', {
        infer: true,
      }) ?? undefined;

    if (weatherConfig) {
      this.weatherApiKey = weatherConfig.apiKey;
      this.weatherBaseUrl = weatherConfig.baseUrl.replace(/\/$/, '');
      this.weatherUnitGroup = weatherConfig.unitGroup;
    }
  }

  async getTodayFixtures(): Promise<ApiFootballFixturesResponse> {
    return this.getFixturesByDate('2025-11-20');
  }

  async getTodayFixturesForRedis(): Promise<KickerGPTFixturesResponse[]> {
    const fixturesResponses = await this.buildTodayFixturesResponse();
    await this.redisService.set(
      this.buildFixturesCacheKey(),
      fixturesResponses,
      this.fixturesCacheTtlSeconds,
    );
    return fixturesResponses;
  }

  async getSelectedMatches(
    fixtureId: number,
  ): Promise<KickerGPTFixturesResponse | undefined> {
    const cacheKey = this.buildFixturesCacheKey();
    const cached =
      await this.redisService.get<KickerGPTFixturesResponse[]>(cacheKey);
    if (!cached) {
      throw new ServiceUnavailableException(
        'Fixtures cache is not available yet. Please try again shortly.',
      );
    }
    const cachedFixture = cached.find((fixture) => fixture.id === fixtureId);
    if (!cachedFixture) {
      throw new ServiceUnavailableException(
        'Fixtures cache is not available yet. Please try again shortly.',
      );
    }
    return cachedFixture;
  }

  async getFixtureById(
    fixtureId: number,
  ): Promise<ApiFootballFixture | undefined> {
    const result = await this.get<ApiFootballFixturesResponse>('/fixtures', {
      id: fixtureId,
    });

    return result.response[0];
  }

  async getHeadToHeadFixtures(
    query: HeadToHeadQuery,
  ): Promise<ApiFootballFixture[]> {
    const { homeTeamId, awayTeamId, leagueId, season, ...rest } = query;

    const result = await this.get<ApiFootballFixturesResponse>(
      '/fixtures/headtohead',
      {
        ...rest,
        h2h: `${homeTeamId}-${awayTeamId}`,
        league: leagueId,
        season,
      },
    );

    return result.response;
  }

  async getHeadToHead(
    homeTeamId?: number,
    awayTeamId?: number,
    leagueId?: number,
  ): Promise<ApiFootballFixture[]> {
    if (!homeTeamId || !awayTeamId) {
      return [];
    }
    return this.getHeadToHeadFixtures({
      homeTeamId,
      awayTeamId,
      leagueId,
    });
  }

  async getFixtureStatistics(
    query: FixtureStatisticsQuery,
  ): Promise<ApiFootballFixtureStatisticsEntry[]> {
    const { fixtureId, teamId, ...rest } = query;
    const result = await this.get<ApiFootballFixtureStatisticsResponse>(
      '/fixtures/statistics',
      {
        ...rest,
        fixture: fixtureId,
        team: teamId,
      },
    );

    return result.response;
  }

  async getFixtureLineups(
    query: FixtureLineupsQuery,
  ): Promise<ApiFootballLineup[]> {
    const { fixtureId, teamId, playerId, type } = query;
    const result = await this.get<ApiFootballLineupsResponse>(
      '/fixtures/lineups',
      {
        fixture: fixtureId,
        team: teamId,
        player: playerId,
        type,
      },
    );

    return result.response;
  }

  async getLineups(fixtureId: number): Promise<ApiFootballLineup[]> {
    return this.getFixtureLineups({ fixtureId });
  }

  async getFixturePlayers(
    query: FixturePlayersQuery,
  ): Promise<ApiFootballPlayerStatistics[]> {
    const { fixtureId, teamId } = query;
    const result = await this.get<ApiFootballFixturePlayersResponse>(
      '/fixtures/players',
      {
        fixture: fixtureId,
        team: teamId,
      },
    );

    return result.response;
  }

  async getOdds(query: OddsQuery | number): Promise<ApiFootballOdds[]> {
    if (typeof query === 'number') {
      return this.getFixtureOdds({ fixtureId: query });
    }

    return this.getFixtureOdds(query);
  }

  async getFixtureOdds(query: OddsQuery): Promise<ApiFootballOdds[]> {
    const { fixtureId, leagueId, bookmakerId, betId, ...rest } = query;

    const result = await this.get<ApiFootballOddsResponse>('/odds', {
      ...rest,
      fixture: fixtureId,
      league: leagueId,
      bookmaker: bookmakerId,
      bet: betId,
    });

    return result.response;
  }

  async getOddsHistoryForFixtures(
    fixtureIds: number[],
    options?: { bookmakerId?: number; betId?: number },
  ): Promise<Record<number, ApiFootballOdds[]>> {
    const cleanedIds = fixtureIds.filter(
      (id): id is number => typeof id === 'number',
    );

    if (cleanedIds.length === 0) {
      return {};
    }

    const entries = await Promise.all(
      cleanedIds.map(async (id) => {
        const odds = await this.getFixtureOdds({
          fixtureId: id,
          bookmakerId: options?.bookmakerId,
          betId: options?.betId,
        });
        return [id, odds] as const;
      }),
    );

    return entries.reduce<Record<number, ApiFootballOdds[]>>(
      (acc, [id, odds]) => {
        if (odds.length > 0) {
          acc[id] = odds;
        }
        return acc;
      },
      {},
    );
  }

  async getStandings(
    leagueId: number,
    season: number,
  ): Promise<ApiFootballStandingsLeague | undefined> {
    const result = await this.get<ApiFootballStandingsResponse>('/standings', {
      league: leagueId,
      season,
    });

    return result.response[0]?.league;
  }

  async getRecentFixturesByTeam(
    teamId: number,
    leagueId: number,
  ): Promise<ApiFootballFixture[]> {
    const result = await this.get<ApiFootballFixturesResponse>('/fixtures', {
      team: teamId,
      status: 'FT',
      season: '2025',
      league: leagueId,
    });

    return result.response;
  }

  async getTeamSeasonFixtures(
    query: TeamFixturesQuery,
  ): Promise<ApiFootballFixture[]> {
    const { teamId, leagueId, season, ...rest } = query;
    const result = await this.get<ApiFootballFixturesResponse>('/fixtures', {
      team: teamId,
      league: leagueId,
      season,
      ...rest,
    });

    return result.response;
  }

  async getInjuries(query: InjuriesQuery): Promise<ApiFootballInjury[]> {
    const { leagueId, fixtureId, teamId, playerId, ids, ...rest } = query;

    const result = await this.get<ApiFootballInjuriesResponse>('/injuries', {
      ...rest,
      league: leagueId,
      fixture: fixtureId,
      team: teamId,
      player: playerId,
      ids: this.joinIds(ids),
    });

    return result.response;
  }

  async getSidelined(
    query: SidelinedQuery,
  ): Promise<ApiFootballSidelinedRecord[]> {
    const { playerId, playerIds, coachId, coachIds } = query;

    const result = await this.get<ApiFootballSidelinedResponse>('/sidelined', {
      player: playerId,
      players: this.joinIds(playerIds),
      coach: coachId,
      coachs: this.joinIds(coachIds),
    });

    return result.response;
  }

  private async getFixturesByDate(
    date: string,
  ): Promise<ApiFootballFixturesResponse> {
    return this.get<ApiFootballFixturesResponse>('/fixtures', { date });
  }

  private async getFixturesByDateLeagueSeason(
    date: string,
    league: number,
    season: number,
  ): Promise<ApiFootballFixturesResponse> {
    return this.get<ApiFootballFixturesResponse>('/fixtures', {
      date,
      league,
      season,
    });
  }

  private getToday(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');

    return `${now.getFullYear()}-${month}-${day}`;
  }

  private async getTeamDetails(
    teamId: number,
  ): Promise<ApiFootballTeamDetails | undefined> {
    const cached = this.teamDetailsCache.get(teamId);

    if (cached) {
      return cached;
    }

    const result = await this.get<ApiFootballTeamsResponse>('/teams', {
      id: teamId,
    });

    const details = result.response[0];

    if (details) {
      this.teamDetailsCache.set(teamId, details);
    }

    return details;
  }

  private isDerbyMatch(
    homeTeam?: ApiFootballTeamDetails,
    awayTeam?: ApiFootballTeamDetails,
  ): boolean {
    const homeCity = this.normalizeCity(homeTeam?.venue?.city);
    const awayCity = this.normalizeCity(awayTeam?.venue?.city);

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

  private async buildTodayFixturesResponse(): Promise<
    KickerGPTFixturesResponse[]
  > {
    const result = await this.getFixturesByDate('2025-11-21');

    const allowedLeagues = new Set([
      39, 40, 41, 42, 61, 62, 78, 79, 88, 89, 135, 136, 140, 141, 203,
    ]);
    const filteredFixtures = result.response.filter((fixture) =>
      allowedLeagues.has(fixture.league.id),
    );

    return Promise.all(
      filteredFixtures.map(
        async (
          apiFixture: ApiFootballFixture,
        ): Promise<KickerGPTFixturesResponse> => {
          const { fixture, league, teams } = apiFixture;
          const season = league.season;

          const h2hResults = await this.getHeadToHeadFixtures({
            homeTeamId: teams.home.id,
            awayTeamId: teams.away.id,
          });

          const homeInjuryResults = await this.getInjuries({
            season,
            teamId: teams.home.id,
          });

          const awayInjuryResults = await this.getInjuries({
            season,
            teamId: teams.away.id,
          });

          const h2h: KickerGPTMatchSummary[] = await Promise.all(
            h2hResults.map(async (result) => {
              const { fixture, league, teams, goals } = result;
              const weatherSummary =
                (await this.getWeatherSummaryForFixture(fixture)) ??
                'Conditions unavailable';

              return {
                id: fixture.id,
                date: fixture.date,
                timestamp: fixture.timestamp,
                league,
                teams,
                venue: fixture.venue,
                status: fixture.status,
                goals,
                derby: true,
                weatherSummary,
                referee: fixture.referee ?? '',
              };
            }),
          );

          const homeInjuries: KickerGPTInjuryPlayerFlag[] =
            this.getLatestInjuriesByPlayer(homeInjuryResults).map((result) => {
              const { player } = result;
              return {
                playerId: player.id,
                name: player.name,
                reason: result.reason,
                date: result.fixture?.date,
              };
            });

          const awayInjuries: KickerGPTInjuryPlayerFlag[] =
            this.getLatestInjuriesByPlayer(awayInjuryResults).map((result) => {
              const { player } = result;

              return {
                playerId: player.id,
                name: player.name,
                reason: result.reason,
                date: result.fixture?.date,
              };
            });

          const lastHomeMatchesResults = await this.getRecentFixturesByTeam(
            teams.home.id,
            league.id,
          );

          const lastAwayMatchesResults = await this.getRecentFixturesByTeam(
            teams.away.id,
            league.id,
          );

          const [homeTeamDetails, awayTeamDetails] = await Promise.all([
            this.getTeamDetails(teams.home.id),
            this.getTeamDetails(teams.away.id),
          ]);

          const isDerby = this.isDerbyMatch(homeTeamDetails, awayTeamDetails);

          const fixtureWeatherSummary =
            (await this.getWeatherSummaryForFixture(fixture)) ??
            'Conditions unavailable';

          const lastHomeMatches = await this.buildMatchSummaries(
            lastHomeMatchesResults,
          );

          const lastAwayMatches = await this.buildMatchSummaries(
            lastAwayMatchesResults,
          );

          const oddsResult = await this.getFixtureOdds({
            fixtureId: fixture.id,
            betId: 1,
          });

          const homeOdd = oddsResult.find(
            (odd) => odd.fixture.id === fixture.id,
          )?.bookmakers[0].bets[0].values[0].odd;

          const awayOdd = oddsResult.find(
            (odd) => odd.fixture.id === fixture.id,
          )?.bookmakers[0].bets[0].values[2].odd;

          return {
            id: fixture.id,
            timezone: fixture.timezone,
            date: fixture.date,
            timestamp: fixture.timestamp,
            periods: fixture.periods,
            status: fixture.status,
            league,
            teams,
            venue: fixture.venue,
            derby: isDerby,
            matchType: 'league',
            homeOdd,
            awayOdd,
            weatherSummary: fixtureWeatherSummary,
            referee: fixture.referee ?? '',
            h2h,
            homeInjuries,
            awayInjuries,
            lastHomeMatches,
            lastAwayMatches,
            homeNews: [],
            awayNews: [],
          };
        },
      ),
    );
  }

  private async getWeatherSummaryForFixture(
    fixture: ApiFootballFixtureDetails,
  ): Promise<string | null> {
    if (!this.weatherApiKey || !this.weatherBaseUrl) {
      return null;
    }

    const location = this.getWeatherQueryLocation(fixture);
    const date = this.getFixtureDateString(fixture);

    if (!location || !date) {
      return null;
    }

    const cacheKey = `${location.toLowerCase()}|${date}`;
    if (this.weatherSummaryCache.has(cacheKey)) {
      return this.weatherSummaryCache.get(cacheKey) ?? null;
    }

    try {
      const response = await this.fetchWeatherTimeline(location, date);
      const summary = this.formatWeatherSummary(response?.days?.[0]);
      this.weatherSummaryCache.set(cacheKey, summary ?? null);
      return summary ?? null;
    } catch {
      this.weatherSummaryCache.set(cacheKey, null);
      return null;
    }
  }

  private getWeatherQueryLocation(
    fixture: ApiFootballFixtureDetails,
  ): string | null {
    const potentialLocations = [
      fixture.venue?.city,
      fixture.venue?.name,
      fixture.venue?.address,
    ].filter((value): value is string => typeof value === 'string');

    for (const location of potentialLocations) {
      const trimmed = location.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return null;
  }

  private getFixtureDateString(
    fixture: ApiFootballFixtureDetails,
  ): string | null {
    if (fixture.date) {
      const [date] = fixture.date.split('T');
      if (date) {
        return date;
      }
    }

    if (fixture.timestamp) {
      const fromTimestamp = new Date(fixture.timestamp * 1000)
        .toISOString()
        .split('T')[0];
      if (fromTimestamp) {
        return fromTimestamp;
      }
    }

    return null;
  }

  private async fetchWeatherTimeline(
    location: string,
    date: string,
  ): Promise<WeatherTimelineResponse | null> {
    if (!this.weatherBaseUrl || !this.weatherApiKey) {
      return null;
    }

    const encodedLocation = encodeURIComponent(location);
    const url = new URL(`${this.weatherBaseUrl}/${encodedLocation}/${date}`);
    url.searchParams.set('key', this.weatherApiKey);
    url.searchParams.set('unitGroup', this.weatherUnitGroup);
    url.searchParams.set('include', 'days');

    return this.requestJson<WeatherTimelineResponse>(
      url,
      {
        Accept: 'application/json',
      },
      'Weather provider request failed.',
    );
  }

  private formatWeatherSummary(day?: WeatherTimelineDay): string | null {
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

  private async buildMatchSummaries(
    fixtures: ApiFootballFixture[],
  ): Promise<KickerGPTMatchSummary[]> {
    return Promise.all(
      fixtures.map(async (result) => {
        const { fixture, league, teams, goals } = result;

        const [homeTeamDetails, awayTeamDetails] = await Promise.all([
          this.getTeamDetails(teams.home.id),
          this.getTeamDetails(teams.away.id),
        ]);

        const weatherSummary =
          (await this.getWeatherSummaryForFixture(fixture)) ??
          'Conditions unavailable';

        return {
          id: fixture.id,
          date: fixture.date,
          timestamp: fixture.timestamp,
          league,
          teams,
          venue: fixture.venue,
          status: fixture.status,
          goals,
          derby: this.isDerbyMatch(homeTeamDetails, awayTeamDetails),
          weatherSummary,
          referee: fixture.referee ?? '',
        };
      }),
    );
  }

  private getLatestInjuriesByPlayer(
    injuries: ApiFootballInjury[],
  ): ApiFootballInjury[] {
    const latest = new Map<number, ApiFootballInjury>();

    injuries.forEach((injury) => {
      const playerId = injury.player.id;

      if (playerId == null) {
        return;
      }

      const current = latest.get(playerId);
      const currentDate = current ? this.getFixtureTimestamp(current) : null;
      const incomingDate = this.getFixtureTimestamp(injury);

      if (
        !current ||
        (incomingDate ?? -Infinity) > (currentDate ?? -Infinity)
      ) {
        latest.set(playerId, injury);
      }
    });

    return Array.from(latest.values());
  }

  private getFixtureTimestamp(injury: ApiFootballInjury): number | null {
    const date = injury.fixture?.date ?? injury.date;

    if (!date) {
      return null;
    }

    const timestamp = Date.parse(date);

    return Number.isNaN(timestamp) ? null : timestamp;
  }

  private async get<T>(
    path: string,
    query: Record<string, string | number | boolean | undefined> = {},
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
          'x-apisports-key': this.apiToken,
        },
        'API-Football request failed.',
      ),
    );
  }

  private joinIds(ids?: Array<string | number>): string | undefined {
    if (!ids || ids.length === 0) {
      return undefined;
    }
    return ids.join('-');
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

  private buildFixturesCacheKey(): string {
    return `fixtures:${this.getToday()}`;
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
}
