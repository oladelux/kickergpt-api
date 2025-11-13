import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { FixturesService } from './fixtures.service';
import { OpenAiService, OpenAiJsonSchema } from '../openai/openai.service';
import {
  FixtureAnalysis,
  FixtureAnalysisContext,
  GameDayTimeAnalysis,
  GameDayTimePerspective,
  GameDayTimeSplit,
  GameDayTimeReference,
} from './types/fixture-analysis.type';
import {
  ApiFootballFixture,
  ApiFootballOdds,
} from './types/fixtures-response.type';
import { FixtureChatsService } from './fixture-chats.service';
import { PromptUsageService } from '../prompt-usage/prompt-usage.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { buildBenchDepth, buildScheduleLoad } from './analysis/features';
import {
  buildMarketDrift,
  inferLatestFav,
  inferOpenFav,
} from './analysis/market';

const DATA_REQUIREMENTS = {
  HEAD_TO_HEAD: 'HEAD_TO_HEAD',
  LINEUPS: 'LINEUPS',
  PROBABLE_LINEUPS: 'PROBABLE_LINEUPS',
  ODDS: 'ODDS',
  STANDINGS: 'STANDINGS',
  RECENT_FORM: 'RECENT_FORM',
  STATISTICS: 'STATISTICS',
  PLAYER_STATS: 'PLAYER_STATS',
  INJURIES: 'INJURIES',
  ODDS_HISTORY: 'ODDS_HISTORY',
  RELATIVE_STANDINGS_SPLITS: 'RELATIVE_STANDINGS_SPLITS',
  SCHEDULE_LOAD: 'SCHEDULE_LOAD',
  BENCH_DEPTH: 'BENCH_DEPTH',
  REFEREE_PROFILE: 'REFEREE_PROFILE',
  VENUE_PROFILE: 'VENUE_PROFILE',
  WEATHER: 'WEATHER',
  TRAVEL: 'TRAVEL',
  NEWS_SENTIMENT: 'NEWS_SENTIMENT',
  MARKET_DRIFT: 'MARKET_DRIFT',
  //Defined by me
  GAME_DAY_TIME_ANALYSIS: 'GAME_DAY_TIME_ANALYSIS',
} as const;

type FixtureDataRequirement =
  (typeof DATA_REQUIREMENTS)[keyof typeof DATA_REQUIREMENTS];

type FixtureTemporalSnapshot = {
  weekday: number;
  hour: number;
  minute: number;
  month: number;
  day: number;
};

type FixtureTemporalRecord = {
  fixture: ApiFootballFixture;
  temporal: FixtureTemporalSnapshot;
};

@Injectable()
export class FixturesAnalysisService {
  private readonly logger = new Logger(FixturesAnalysisService.name);
  private static readonly HEAD_TO_HEAD_LIMIT = 10;
  private static readonly RECENT_FORM_LIMIT = 10;
  private static readonly ODDS_HISTORY_SEASON_DEPTH = 10;
  private static readonly MAX_ODDS_HISTORY_FIXTURES_PER_SEASON = 20;
  private static readonly MAX_ODDS_HISTORY_FIXTURES = 50;
  private static readonly COMPLETED_STATUSES = new Set([
    'FT',
    'AET',
    'PEN',
    'WO',
    'AWD',
  ]);
  private static readonly ANALYSIS_CACHE_TTL_SECONDS = 600;
  private static readonly DEFAULT_REQUIREMENTS: FixtureDataRequirement[] = [
    DATA_REQUIREMENTS.HEAD_TO_HEAD,
    DATA_REQUIREMENTS.RECENT_FORM,
    DATA_REQUIREMENTS.STANDINGS,
    DATA_REQUIREMENTS.ODDS,
    DATA_REQUIREMENTS.ODDS_HISTORY,
    DATA_REQUIREMENTS.STATISTICS,
    DATA_REQUIREMENTS.SCHEDULE_LOAD,
    DATA_REQUIREMENTS.BENCH_DEPTH,
    DATA_REQUIREMENTS.MARKET_DRIFT,
    DATA_REQUIREMENTS.GAME_DAY_TIME_ANALYSIS,
  ];
  private static readonly WEEKDAY_LABELS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ] as const;

  private static readonly DATA_REQUIREMENT_SCHEMA: OpenAiJsonSchema = {
    name: 'fixture_analysis_requirements',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        data_requirements: {
          type: 'array',
          description:
            'List of data blocks needed from API-Football before answering the user.',
          minItems: 1,
          uniqueItems: true,
          items: {
            type: 'string',
            enum: Object.values(DATA_REQUIREMENTS),
          },
        },
        reasoning: {
          type: 'string',
          description:
            'Short explanation (<=40 words) of why these datasets are needed.',
        },
      },
      required: ['data_requirements'],
    },
  };

  constructor(
    private readonly fixturesService: FixturesService,
    private readonly openAiService: OpenAiService,
    private readonly fixtureChatsService: FixtureChatsService,
    private readonly promptUsageService: PromptUsageService,
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async analyzeFixture(
    fixtureId: number,
    message: string,
    tone?: string,
    userId?: string,
  ): Promise<FixtureAnalysis> {
    const cacheKey = this.buildCacheKey(fixtureId, message, tone);
    const cached = await this.cacheManager.get<FixtureAnalysis>(cacheKey);

    if (cached) {
      await this.persistChatHistory({
        fixtureId,
        userId,
        message,
        tone,
        analysis: cached,
      });
      return cached;
    }

    const fixture = await this.fixturesService.getFixtureById(fixtureId);

    if (!fixture) {
      throw new NotFoundException(
        `Fixture with id ${fixtureId} was not found in API-Football.`,
      );
    }

    const h2h = await this.fixturesService.getHeadToHead(
      fixture.teams.home.id,
      fixture.teams.away.id,
      fixture.league?.id,
    );
    const currentHomeTeamMatchesInSeason =
      await this.fixturesService.getTeamSeasonFixtures({
        teamId: fixture.teams.home.id,
        leagueId: fixture.league.id,
        season: fixture.league.season,
      });
    const currentAwayTeamMatchesInSeason =
      await this.fixturesService.getTeamSeasonFixtures({
        teamId: fixture.teams.away.id,
        leagueId: fixture.league.id,
        season: fixture.league.season,
      });

    if (userId) {
      const subscription =
        await this.subscriptionsService.getSubscriptionForUser(userId);
      await this.promptUsageService.consumePromptCredit({
        userId,
        plan: subscription.plan,
        status: subscription.status,
      });
    }

    const homeTeamId = fixture.teams.home.id;
    const awayTeamId = fixture.teams.away.id;

    if (homeTeamId == null || awayTeamId == null) {
      throw new BadRequestException(
        'Fixture is missing team identifiers required for analysis.',
      );
    }

    const dataRequirements = await this.determineDataRequirements(message);
    const contextPayload: FixtureAnalysisContext = {
      fixture: {
        ...fixture,
      },
    };
    const contextNotes: string[] = [];

    if (dataRequirements.has(DATA_REQUIREMENTS.HEAD_TO_HEAD)) {
      const headToHead = await this.safeFetch(
        () =>
          this.fixturesService.getHeadToHead(
            homeTeamId,
            awayTeamId,
            FixturesAnalysisService.HEAD_TO_HEAD_LIMIT,
          ),
        contextNotes,
        'Head-to-head history unavailable.',
      );

      const completedHeadToHead = this.filterCompletedFixtures(headToHead);

      if (completedHeadToHead?.length) {
        contextPayload.headToHead = completedHeadToHead;
      }
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.RECENT_FORM)) {
      const [homeForm, awayForm] = await Promise.all([
        this.safeFetch(
          () =>
            this.fixturesService.getRecentFixturesByTeam(
              homeTeamId,
              FixturesAnalysisService.RECENT_FORM_LIMIT,
            ),
          contextNotes,
          'Home team form unavailable.',
        ),
        this.safeFetch(
          () =>
            this.fixturesService.getRecentFixturesByTeam(
              awayTeamId,
              FixturesAnalysisService.RECENT_FORM_LIMIT,
            ),
          contextNotes,
          'Away team form unavailable.',
        ),
      ]);

      const completedHomeForm = this.filterCompletedFixtures(homeForm) ?? [];
      const completedAwayForm = this.filterCompletedFixtures(awayForm) ?? [];

      if (completedHomeForm.length || completedAwayForm.length) {
        contextPayload.recentForm = {
          home: completedHomeForm,
          away: completedAwayForm,
        };
      }
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.LINEUPS)) {
      const lineups = await this.safeFetch(
        () => this.fixturesService.getLineups(fixtureId),
        contextNotes,
        'Lineups not released yet.',
      );

      if (lineups?.length) {
        contextPayload.lineups = lineups;
      }
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.ODDS)) {
      const odds = await this.safeFetch(
        () => this.fixturesService.getOdds(fixtureId),
        contextNotes,
        'Odds data unavailable.',
      );

      if (odds?.length) {
        contextPayload.odds = odds;
      }
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.MARKET_DRIFT)) {
      try {
        const openFav = inferOpenFav(contextPayload.odds);
        const latestFav = inferLatestFav(contextPayload.odds);
        contextPayload.marketDrift = buildMarketDrift(openFav, latestFav);
      } catch (e) {
        contextNotes.push(`Market drift unavailable: ${(e as Error).message}`);
      }
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.STATISTICS)) {
      const statistics = await this.safeFetch(
        () =>
          this.fixturesService.getFixtureStatistics({
            fixtureId,
            half: true,
          }),
        contextNotes,
        'Fixture statistics unavailable.',
      );

      if (statistics?.length) {
        contextPayload.statistics = statistics;
      }
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.PLAYER_STATS)) {
      const playerStats = await this.safeFetch(
        () =>
          this.fixturesService.getFixturePlayers({
            fixtureId,
          }),
        contextNotes,
        'Player statistics unavailable.',
      );

      if (playerStats?.length) {
        contextPayload.playerStats = playerStats;
      }
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.INJURIES)) {
      if (fixture.league?.id && fixture.league?.season) {
        const [homeInjuries, awayInjuries] = await Promise.all([
          this.safeFetch(
            () =>
              this.fixturesService.getInjuries({
                leagueId: fixture.league.id,
                season: fixture.league.season,
                teamId: homeTeamId,
              }),
            contextNotes,
            'Home team injuries unavailable.',
          ),
          this.safeFetch(
            () =>
              this.fixturesService.getInjuries({
                leagueId: fixture.league.id,
                season: fixture.league.season,
                teamId: awayTeamId,
              }),
            contextNotes,
            'Away team injuries unavailable.',
          ),
        ]);

        if (
          (homeInjuries?.length ?? 0) > 0 ||
          (awayInjuries?.length ?? 0) > 0
        ) {
          contextPayload.injuries = {
            home: homeInjuries ?? [],
            away: awayInjuries ?? [],
          };
        }
      } else {
        contextNotes.push(
          'Unable to fetch injuries because league id or season is missing.',
        );
      }
    }

    if (
      dataRequirements.has(DATA_REQUIREMENTS.STANDINGS) &&
      fixture.league?.id &&
      fixture.league?.season
    ) {
      const standings = await this.safeFetch(
        () =>
          this.fixturesService.getStandings(
            fixture.league.id,
            fixture.league.season,
          ),
        contextNotes,
        'Standings data unavailable.',
      );

      if (standings) {
        contextPayload.standings = standings;
      }
    } else if (dataRequirements.has(DATA_REQUIREMENTS.STANDINGS)) {
      contextNotes.push('League standings missing league id or season.');
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.ODDS_HISTORY)) {
      if (contextPayload.headToHead?.length) {
        const fixtureIds = contextPayload.headToHead
          .map((fx) => fx.fixture.id)
          .filter((id): id is number => typeof id === 'number');

        if (fixtureIds.length > 0) {
          const oddsHistory = await this.safeFetch(
            () => this.fixturesService.getOddsHistoryForFixtures(fixtureIds),
            contextNotes,
            'Odds history unavailable.',
          );

          if (oddsHistory && Object.keys(oddsHistory).length > 0) {
            contextPayload.oddsHistory = oddsHistory;
          }
        }
      }

      if (fixture.league?.id && fixture.league?.season) {
        const seasonsWindow = this.getSeasonWindow(
          fixture.league.season,
          FixturesAnalysisService.ODDS_HISTORY_SEASON_DEPTH,
        );

        if (seasonsWindow.length > 0) {
          const [homeLeagueOdds, awayLeagueOdds] = await Promise.all([
            this.collectTeamLeagueOddsHistory(
              homeTeamId,
              fixture.league.id,
              seasonsWindow,
              contextNotes,
            ),
            this.collectTeamLeagueOddsHistory(
              awayTeamId,
              fixture.league.id,
              seasonsWindow,
              contextNotes,
            ),
          ]);

          if (homeLeagueOdds || awayLeagueOdds) {
            contextPayload.leagueOddsHistory = {
              home: homeLeagueOdds ?? {},
              away: awayLeagueOdds ?? {},
            };
          }
        }
      }
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.GAME_DAY_TIME_ANALYSIS)) {
      const reference = this.buildFixtureTemporalReference(
        fixture.fixture?.date,
        fixture.fixture?.timezone,
      );

      if (!reference) {
        contextNotes.push(
          'Unable to derive kickoff time for game-day analysis.',
        );
      } else {
        const gameDayTimeAnalysis = this.buildGameDayTimeAnalysis({
          reference,
          headToHead: h2h,
          homeSeasonFixtures: currentHomeTeamMatchesInSeason,
          awaySeasonFixtures: currentAwayTeamMatchesInSeason,
          homeTeamId,
          awayTeamId,
          currentFixtureId: fixtureId,
        });

        if (gameDayTimeAnalysis) {
          contextPayload.gameDayTimeAnalysis = gameDayTimeAnalysis;
        } else {
          contextNotes.push(
            'No completed fixtures match the current kickoff window for game-day analysis.',
          );
        }
      }
    }

    // RELATIVE STANDINGS SPLITS (vs above / vs below)
    if (dataRequirements.has(DATA_REQUIREMENTS.RELATIVE_STANDINGS_SPLITS)) {
      try {
        const standings = (contextPayload as any).standings;
        const recentForm = (contextPayload as any).recentForm;
        if (standings && recentForm) {
          const splits = this.computeRelativeStandingsSplits(
            standings,
            { home: recentForm.home ?? [], away: recentForm.away ?? [] },
            { homeTeamId, awayTeamId },
            fixture.league?.id,
            fixture.league?.season,
          );
          if (splits) {
            (contextPayload as any).relativeSplits = splits;
          }
        } else {
          contextNotes.push(
            'Relative standings splits skipped: standings or recent form missing.',
          );
        }
      } catch (e) {
        this.logger.warn(
          `Failed to compute relative standings splits: ${
            (e as Error).message
          }`,
        );
      }
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.SCHEDULE_LOAD)) {
      const homeForm = contextPayload.recentForm?.home ?? [];
      const awayForm = contextPayload.recentForm?.away ?? [];
      contextPayload.scheduleLoad = {
        home: buildScheduleLoad(homeForm),
        away: buildScheduleLoad(awayForm),
      };
    }

    if (dataRequirements.has(DATA_REQUIREMENTS.BENCH_DEPTH)) {
      const homeInj = contextPayload.injuries?.home?.length ?? 0;
      const awayInj = contextPayload.injuries?.away?.length ?? 0;
      contextPayload.benchDepth = {
        home: buildBenchDepth(20, 0, 0, homeInj),
        away: buildBenchDepth(20, 0, 0, awayInj),
      };
    }

    if (contextNotes.length > 0) {
      contextPayload.notes = contextNotes;
    }

    const systemPrompt =
      'You are MatchGPT, a football analyst. Use only the JSON context. Mention missing datasets. ' +
      'Never show numeric odds or price ranges; describe market only in direction and consensus terms. ' +
      'Respond in natural prose or Markdown—never JSON. ' +
      'Output the sections below in order (omit a section only when instructed to do so). ' +
      '1) Direction & confidence: state home/away/draw and low/medium/high confidence, and justify both with context data (never bookmakers). ' +
      '2) Top drivers: give 4–6 bullet points citing concrete datasets such as standings, injuries, schedule load, referee, weather, travel, H2H, splits, market drift, etc., each with a short reason. ' +
      "3) Upset watch: cite past fixtures from headToHead/leagueOddsHistory/oddsHistory where an underdog beat expectation; if nothing applies say 'Upset watch: none'. " +
      '4) Game time analysis: include only if gameDayTimeAnalysis exists; relate kickoff timing trends for both teams and mention it inside the Direction & confidence narrative as well. ' +
      'No invented data.';

    const userPromptLines = [
      `User request: ${message}`,
      tone ? `Preferred tone: ${tone}` : undefined,
      `Activated data requirements: ${Array.from(dataRequirements).join(', ')}`,
      'Context JSON:',
      JSON.stringify(contextPayload, null, 2),
    ].filter(Boolean);

    const aiResponse = await this.openAiService.generateText([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPromptLines.join('\n\n') },
    ]);

    if (!aiResponse.text) {
      throw new BadRequestException('OpenAI did not return any content.');
    }

    const analysis: FixtureAnalysis = {
      fixtureId,
      summary: aiResponse.text,
      metadata: {
        model: aiResponse.model,
        promptTokens: aiResponse.promptTokens,
        completionTokens: aiResponse.completionTokens,
        totalTokens: aiResponse.totalTokens,
      },
    };

    await this.cacheManager.set(
      cacheKey,
      analysis,
      FixturesAnalysisService.ANALYSIS_CACHE_TTL_SECONDS,
    );

    await this.persistChatHistory({
      fixtureId,
      userId,
      message,
      tone,
      analysis,
    });

    return analysis;
  }

  private async determineDataRequirements(
    message: string,
  ): Promise<Set<FixtureDataRequirement>> {
    const fallback = new Set(FixturesAnalysisService.DEFAULT_REQUIREMENTS);
    const systemPrompt =
      'You select which API-Football datasets are required to answer a user request about a specific fixture. ' +
      'Pick only the blocks that are relevant. Available blocks:' +
      '\n- HEAD_TO_HEAD: Use for history, rivalry, previous meetings, momentum.' +
      '\n- RECENT_FORM: Use when form, streaks, fatigue, consistency, or “last matches” are mentioned.' +
      '\n- STANDINGS: Use for table position, favorites vs underdogs, teams above/below in the league.' +
      '\n- ODDS: Use for betting lines, favorites, upsets, probabilities.' +
      '\n- ODDS_HISTORY: Use for historical odds, upset hunts, and “have they beaten the odds” questions.' +
      '\n- LINEUPS: Use for lineups, player availability, tactical matchups, injuries, or formations.' +
      '\n- STATISTICS: Use for shot counts, possession, halves, or team metrics.' +
      '\n- PLAYER_STATS: Use for player-level performances within the fixture.' +
      '\n- INJURIES: Use for availability, injury lists, or fitness doubts.' +
      '\n- RELATIVE_STANDINGS_SPLITS: Use when the user asks about performance vs higher/lower ranked teams.' +
      '\n- GAME_DAY_TIME_ANALYSIS: Use for game day time analysis, or game day time sentiment. also add this when giving a summary analysis of the match.' +
      '\nReturn only the identifiers.';

    try {
      const response = await this.openAiService.generateJson<{
        data_requirements: FixtureDataRequirement[];
      }>(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        FixturesAnalysisService.DATA_REQUIREMENT_SCHEMA,
        0,
      );

      const requested = (response.data_requirements ?? []).filter(
        (item): item is FixtureDataRequirement =>
          Object.values(DATA_REQUIREMENTS).includes(item),
      );

      const resolvedSet = new Set<FixtureDataRequirement>(
        requested.length > 0
          ? requested
          : FixturesAnalysisService.DEFAULT_REQUIREMENTS,
      );

      const normalizedMessage = message.toLowerCase();

      if (
        normalizedMessage.includes('odd') ||
        normalizedMessage.includes('bet') ||
        normalizedMessage.includes('underdog') ||
        normalizedMessage.includes('favorite')
      ) {
        resolvedSet.add(DATA_REQUIREMENTS.ODDS_HISTORY);
        resolvedSet.add(DATA_REQUIREMENTS.ODDS);
        resolvedSet.add(DATA_REQUIREMENTS.MARKET_DRIFT);
      }
      // Rank-split triggers
      if (
        normalizedMessage.includes('rank') ||
        normalizedMessage.includes('table') ||
        normalizedMessage.includes('above') ||
        normalizedMessage.includes('below')
      ) {
        resolvedSet.add(DATA_REQUIREMENTS.RELATIVE_STANDINGS_SPLITS);
        resolvedSet.add(DATA_REQUIREMENTS.STANDINGS);
        resolvedSet.add(DATA_REQUIREMENTS.RECENT_FORM);
      }

      resolvedSet.add(DATA_REQUIREMENTS.HEAD_TO_HEAD);
      return resolvedSet;
    } catch (error) {
      this.logger.warn(
        `Falling back to default data requirements: ${(error as Error).message}`,
      );
      return fallback;
    }
  }

  private buildFeatureSnapshot(ctx: FixtureAnalysisContext) {
    try {
      const home = this.scoreSide(ctx, 'home');
      const away = this.scoreSide(ctx, 'away');
      return { home, away };
    } catch {
      return undefined;
    }
  }

  private scoreSide(ctx: FixtureAnalysisContext, side: 'home' | 'away') {
    const inv = (x?: number) => (typeof x === 'number' ? x : 0.5);
    const injLen =
      side === 'home'
        ? (ctx.injuries?.home?.length ?? 0)
        : (ctx.injuries?.away?.length ?? 0);
    const sched =
      side === 'home'
        ? (ctx as any).scheduleLoad?.home?.fixtureDensityIndex
        : (ctx as any).scheduleLoad?.away?.fixtureDensityIndex;
    const depth =
      side === 'home'
        ? (ctx as any).benchDepth?.home?.rotationHealth
        : (ctx as any).benchDepth?.away?.rotationHealth;
    const marketFav = (ctx as any).marketDrift?.latestFav;
    return {
      availability: 1 - Math.min(1, injLen / 6),
      scheduleLoad: inv(sched),
      benchDepth: inv(depth),
      tacticsFit: 0.5,
      venueConditions: 0.5,
      psychology: 0.5,
      marketSignal: marketFav ? (marketFav === side ? 0.7 : 0.3) : 0.5,
      refereeFit: 0.5,
      formQuality: 0.5,
      h2hEdge: 0.5,
      relativeSplits: 0.5,
    };
  }

  private async safeFetch<T>(
    action: () => Promise<T>,
    notes: string[],
    message: string,
  ): Promise<T | undefined> {
    try {
      return await action();
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.warn(`${message} ${reason}`);
      notes.push(`${message} ${reason}`);
      return undefined;
    }
  }

  private getSeasonWindow(baseSeason: number, depth: number): number[] {
    if (!Number.isFinite(baseSeason) || baseSeason <= 0) {
      return [];
    }

    return Array.from(
      { length: depth },
      (_, index) => baseSeason - index,
    ).filter((season) => season > 0);
  }

  private async collectTeamLeagueOddsHistory(
    teamId: number,
    leagueId: number,
    seasons: number[],
    notes: string[],
  ): Promise<Record<number, ApiFootballOdds[]> | undefined> {
    if (seasons.length === 0) {
      return undefined;
    }

    const aggregatedFixtures: ApiFootballFixture[] = [];

    for (const season of seasons) {
      const fixtures = await this.safeFetch(
        () =>
          this.fixturesService.getTeamSeasonFixtures({
            teamId,
            leagueId,
            season,
            last: FixturesAnalysisService.MAX_ODDS_HISTORY_FIXTURES_PER_SEASON,
          }),
        notes,
        `Unable to load ${season} fixtures for team ${teamId}.`,
      );

      if (fixtures?.length) {
        const completed = this.filterCompletedFixtures(fixtures);
        if (completed?.length) {
          aggregatedFixtures.push(...completed);
        }
      }
    }

    const fixtureIds = aggregatedFixtures
      .map((fixture) => fixture.fixture.id)
      .filter((id): id is number => typeof id === 'number')
      .slice(0, FixturesAnalysisService.MAX_ODDS_HISTORY_FIXTURES);

    if (fixtureIds.length === 0) {
      return undefined;
    }

    return this.safeFetch(
      () => this.fixturesService.getOddsHistoryForFixtures(fixtureIds),
      notes,
      `Unable to collect odds history for team ${teamId}.`,
    );
  }

  // ------------------------
  // Derived computations
  // ------------------------

  /**
   * Build relative splits:
   * - For higher-ranked team: performance vs BELOW-ranked opponents
   * - For lower-ranked team: performance vs ABOVE-ranked opponents
   * Uses recent league fixtures (completed) joined with current standings ranks.
   */
  private computeRelativeStandingsSplits(
    standings: any,
    recentForm: { home: ApiFootballFixture[]; away: ApiFootballFixture[] },
    teamIds: { homeTeamId: number; awayTeamId: number },
    leagueId?: number,
    season?: number,
  ):
    | {
        home_vs_below?: {
          w: number;
          d: number;
          l: number;
          gf: number;
          ga: number;
          sample: number;
        };
        away_vs_above?: {
          w: number;
          d: number;
          l: number;
          gf: number;
          ga: number;
          sample: number;
        };
        homeRank?: number;
        awayRank?: number;
      }
    | undefined {
    try {
      if (!leagueId || !season || !standings) return undefined;

      // API-Football standings often come as arrays of arrays (groups). Flatten to map teamId -> rank.
      const rankMap = new Map<number, number>();
      const flat = Array.isArray(standings?.response?.[0]?.league?.standings)
        ? standings.response[0].league.standings.flat()
        : Array.isArray(standings?.standings)
          ? standings.standings.flat()
          : [];

      for (const row of flat) {
        const teamId = row?.team?.id;
        const rank = row?.rank;
        if (typeof teamId === 'number' && typeof rank === 'number') {
          rankMap.set(teamId, rank);
        }
      }

      const homeRank = rankMap.get(teamIds.homeTeamId);
      const awayRank = rankMap.get(teamIds.awayTeamId);
      if (!homeRank || !awayRank) return undefined;

      const higherTeamId =
        homeRank < awayRank ? teamIds.homeTeamId : teamIds.awayTeamId;
      const lowerTeamId =
        homeRank < awayRank ? teamIds.awayTeamId : teamIds.homeTeamId;

      // Helper to aggregate WDL/GF/GA for fixtures of a team vs opponents filtered by rank relation
      const aggregate = (
        fixtures: ApiFootballFixture[],
        teamId: number,
        filter: 'vs_above' | 'vs_below',
      ) => {
        let w = 0,
          d = 0,
          l = 0,
          gf = 0,
          ga = 0,
          sample = 0;
        for (const fx of fixtures) {
          const isHome = fx.teams?.home?.id === teamId;
          const oppId = isHome ? fx.teams?.away?.id : fx.teams?.home?.id;
          if (!oppId) continue;

          const oppRank = rankMap.get(oppId);
          if (!oppRank) continue;

          const teamRank = rankMap.get(teamId);
          if (!teamRank) continue;

          const keep =
            filter === 'vs_above' ? oppRank < teamRank : oppRank > teamRank;
          if (!keep) continue;

          const goalsFor = isHome
            ? (fx.goals?.home ?? 0)
            : (fx.goals?.away ?? 0);
          const goalsAgainst = isHome
            ? (fx.goals?.away ?? 0)
            : (fx.goals?.home ?? 0);

          gf += goalsFor;
          ga += goalsAgainst;
          sample += 1;

          if (goalsFor > goalsAgainst) w += 1;
          else if (goalsFor < goalsAgainst) l += 1;
          else d += 1;
        }
        return { w, d, l, gf, ga, sample };
      };

      const homeFixtures = recentForm.home ?? [];
      const awayFixtures = recentForm.away ?? [];

      const higherRecent =
        higherTeamId === teamIds.homeTeamId ? homeFixtures : awayFixtures;
      const lowerRecent =
        lowerTeamId === teamIds.homeTeamId ? homeFixtures : awayFixtures;

      const higher_vs_below = aggregate(higherRecent, higherTeamId, 'vs_below');
      const lower_vs_above = aggregate(lowerRecent, lowerTeamId, 'vs_above');

      return {
        home_vs_below:
          higherTeamId === teamIds.homeTeamId ? higher_vs_below : undefined,
        away_vs_above:
          lowerTeamId === teamIds.awayTeamId ? lower_vs_above : undefined,
        homeRank,
        awayRank,
      };
    } catch (e) {
      this.logger.warn(
        `computeRelativeStandingsSplits failed: ${(e as Error).message}`,
      );
      return undefined;
    }
  }

  private buildGameDayTimeAnalysis(params: {
    reference: GameDayTimeReference;
    headToHead?: ApiFootballFixture[];
    homeSeasonFixtures?: ApiFootballFixture[];
    awaySeasonFixtures?: ApiFootballFixture[];
    homeTeamId: number;
    awayTeamId: number;
    currentFixtureId: number;
  }): GameDayTimeAnalysis | undefined {
    const analysis: GameDayTimeAnalysis = {
      reference: params.reference,
    };

    const headToHeadHome = this.buildGameDayTimePerspective(
      params.headToHead,
      params.homeTeamId,
      params.reference,
      params.currentFixtureId,
    );
    const headToHeadAway = this.buildGameDayTimePerspective(
      params.headToHead,
      params.awayTeamId,
      params.reference,
      params.currentFixtureId,
    );

    if (headToHeadHome || headToHeadAway) {
      analysis.headToHead = {};
      if (headToHeadHome) {
        analysis.headToHead.home = headToHeadHome;
      }
      if (headToHeadAway) {
        analysis.headToHead.away = headToHeadAway;
      }
    }

    const homeTeamPerspective = this.buildGameDayTimePerspective(
      params.homeSeasonFixtures,
      params.homeTeamId,
      params.reference,
      params.currentFixtureId,
    );
    if (homeTeamPerspective) {
      analysis.homeTeam = homeTeamPerspective;
    }

    const awayTeamPerspective = this.buildGameDayTimePerspective(
      params.awaySeasonFixtures,
      params.awayTeamId,
      params.reference,
      params.currentFixtureId,
    );
    if (awayTeamPerspective) {
      analysis.awayTeam = awayTeamPerspective;
    }

    if (!analysis.headToHead && !analysis.homeTeam && !analysis.awayTeam) {
      return undefined;
    }

    return analysis;
  }

  private buildGameDayTimePerspective(
    fixtures: ApiFootballFixture[] | undefined,
    teamId: number,
    reference: GameDayTimeReference,
    currentFixtureId: number,
  ): GameDayTimePerspective | undefined {
    if (!fixtures?.length) {
      return undefined;
    }

    const completed = this.filterCompletedFixtures(fixtures);
    if (!completed?.length) {
      return undefined;
    }

    const records: FixtureTemporalRecord[] = [];
    for (const fx of completed) {
      if (fx.fixture?.id === currentFixtureId) {
        continue;
      }

      const temporal = this.extractTemporalParts(
        fx.fixture?.date,
        reference.timezone,
      );
      if (!temporal) {
        continue;
      }

      records.push({ fixture: fx, temporal });
    }

    if (!records.length) {
      return undefined;
    }

    const perspective: GameDayTimePerspective = {};

    const sameWeekday = this.aggregateTemporalSplit(
      records.filter((record) => record.temporal.weekday === reference.weekday),
      teamId,
    );
    if (sameWeekday) {
      perspective.sameWeekday = sameWeekday;
    }

    const sameHour = this.aggregateTemporalSplit(
      records.filter((record) => record.temporal.hour === reference.hour),
      teamId,
    );
    if (sameHour) {
      perspective.sameKickoffHour = sameHour;
    }

    const sameWeekdayAndHour = this.aggregateTemporalSplit(
      records.filter(
        (record) =>
          record.temporal.weekday === reference.weekday &&
          record.temporal.hour === reference.hour,
      ),
      teamId,
    );
    if (sameWeekdayAndHour) {
      perspective.sameWeekdayAndHour = sameWeekdayAndHour;
    }

    const sameMonthDay = this.aggregateTemporalSplit(
      records.filter(
        (record) =>
          record.temporal.month === reference.month &&
          record.temporal.day === reference.day,
      ),
      teamId,
    );
    if (sameMonthDay) {
      perspective.sameMonthDay = sameMonthDay;
    }

    return Object.keys(perspective).length ? perspective : undefined;
  }

  private aggregateTemporalSplit(
    records: FixtureTemporalRecord[],
    teamId: number,
  ): GameDayTimeSplit | undefined {
    if (!records.length) {
      return undefined;
    }

    let wins = 0;
    let draws = 0;
    let losses = 0;

    for (const record of records) {
      const outcome = this.getTeamOutcome(record.fixture, teamId);
      if (!outcome) {
        continue;
      }

      if (outcome === 'win') {
        wins += 1;
      } else if (outcome === 'draw') {
        draws += 1;
      } else {
        losses += 1;
      }
    }

    const sample = wins + draws + losses;
    if (!sample) {
      return undefined;
    }

    return { wins, draws, losses, sample };
  }

  private getTeamOutcome(
    fixture: ApiFootballFixture,
    teamId: number,
  ): 'win' | 'draw' | 'loss' | undefined {
    const homeId = fixture.teams?.home?.id;
    const awayId = fixture.teams?.away?.id;
    if (homeId !== teamId && awayId !== teamId) {
      return undefined;
    }

    const homeGoals = fixture.goals?.home;
    const awayGoals = fixture.goals?.away;
    if (homeGoals == null || awayGoals == null) {
      return undefined;
    }

    if (homeGoals === awayGoals) {
      return 'draw';
    }

    const isHomeTeam = homeId === teamId;
    const teamWon = isHomeTeam ? homeGoals > awayGoals : awayGoals > homeGoals;

    return teamWon ? 'win' : 'loss';
  }

  private buildFixtureTemporalReference(
    dateIso?: string,
    timezone?: string,
  ): GameDayTimeReference | undefined {
    if (!dateIso) {
      return undefined;
    }

    const temporal = this.extractTemporalParts(dateIso, timezone);
    if (!temporal) {
      return undefined;
    }

    const hourLabel = `${String(temporal.hour).padStart(2, '0')}:${String(
      temporal.minute,
    ).padStart(2, '0')}`;
    const dateLabel = `${String(temporal.month).padStart(2, '0')}-${String(
      temporal.day,
    ).padStart(2, '0')}`;
    const weekdayLabel =
      FixturesAnalysisService.WEEKDAY_LABELS[temporal.weekday] ??
      `Day ${temporal.weekday}`;

    return {
      isoDate: dateIso,
      timezone: timezone ?? 'UTC',
      weekday: temporal.weekday,
      weekdayLabel,
      hour: temporal.hour,
      minute: temporal.minute,
      hourLabel,
      month: temporal.month,
      day: temporal.day,
      dateLabel,
    };
  }

  private extractTemporalParts(
    isoDate?: string,
    timezone?: string,
  ): FixtureTemporalSnapshot | undefined {
    if (!isoDate) {
      return undefined;
    }

    const parsedDate = new Date(isoDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return undefined;
    }

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone ?? 'UTC',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(parsedDate);
      const lookup = (type: string) =>
        parts.find((part) => part.type === type)?.value;

      const weekday = this.getWeekdayIndex(lookup('weekday'));
      const hour = Number(lookup('hour'));
      const minute = Number(lookup('minute'));
      const month = Number(lookup('month'));
      const day = Number(lookup('day'));

      if (
        weekday == null ||
        Number.isNaN(hour) ||
        Number.isNaN(minute) ||
        Number.isNaN(month) ||
        Number.isNaN(day)
      ) {
        return undefined;
      }

      return {
        weekday,
        hour,
        minute,
        month,
        day,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to derive temporal snapshot: ${(error as Error).message}`,
      );
      return undefined;
    }
  }

  private getWeekdayIndex(label?: string): number | undefined {
    if (!label) {
      return undefined;
    }

    const normalized = label.trim().slice(0, 3).toLowerCase();
    const lookup = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const index = lookup.indexOf(normalized);
    return index === -1 ? undefined : index;
  }

  private buildCacheKey(
    fixtureId: number,
    message: string,
    tone?: string,
  ): string {
    const normalizedMessage = message.trim().toLowerCase();
    const toneKey = tone?.trim().toLowerCase() ?? 'default';
    return `fixture-analysis:${fixtureId}:${toneKey}:${normalizedMessage}`;
  }

  private filterCompletedFixtures(
    fixtures?: ApiFootballFixture[],
  ): ApiFootballFixture[] | undefined {
    if (!fixtures) {
      return undefined;
    }

    return fixtures.filter((fixture) => this.isCompletedFixture(fixture));
  }

  private isCompletedFixture(fixture?: ApiFootballFixture): boolean {
    if (!fixture) {
      return false;
    }

    const status = fixture.fixture?.status?.short;

    if (!status) {
      return false;
    }

    return FixturesAnalysisService.COMPLETED_STATUSES.has(status.toUpperCase());
  }

  private async persistChatHistory(params: {
    fixtureId: number;
    userId?: string;
    message: string;
    tone?: string;
    analysis: FixtureAnalysis;
  }): Promise<void> {
    if (!params.userId) {
      return;
    }

    try {
      await this.fixtureChatsService.logChat({
        fixtureId: params.fixtureId,
        userId: params.userId,
        message: params.message,
        tone: params.tone,
        summary: params.analysis.summary,
        metadata: params.analysis.metadata,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist chat history for user ${params.userId}: ${
          (error as Error).message
        }`,
      );
    }
  }
}
