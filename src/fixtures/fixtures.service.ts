import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { AllConfigType } from '../config/config.type';
import { ApiFootballConfig } from './config/api-football-config.type';
import {
  ApiFootballFixture,
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
  ApiFootballSidelinedRecord,
  ApiFootballSidelinedResponse,
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

@Injectable()
export class FixturesService {
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const apiFootballConfig = this.configService.getOrThrow<ApiFootballConfig>(
      'apiFootball',
      {
        infer: true,
      },
    );

    this.apiToken = apiFootballConfig.apiToken;
    this.baseUrl = apiFootballConfig.baseUrl.replace(/\/$/, '');
  }

  async getTodayFixtures(): Promise<ApiFootballFixturesResponse> {
    return this.getFixturesByDate(this.getToday());
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
    last = 5,
  ): Promise<ApiFootballFixture[]> {
    const result = await this.get<ApiFootballFixturesResponse>('/fixtures', {
      team: teamId,
      last,
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

  private getToday(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');

    return `${now.getFullYear()}-${month}-${day}`;
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

    return new Promise<T>((resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'x-apisports-key': this.apiToken,
          },
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
                    'Failed to parse API-Football response.',
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
                  message: 'API-Football request failed.',
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
            `Unable to reach API-Football. ${error.message}`,
          ),
        );
      });

      request.end();
    });
  }

  private joinIds(ids?: Array<string | number>): string | undefined {
    if (!ids || ids.length === 0) {
      return undefined;
    }
    return ids.join('-');
  }
}
