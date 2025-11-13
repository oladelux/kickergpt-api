import { buildBenchDepth, buildScheduleLoad } from '../analysis/features';
import { buildMarketDrift } from '../analysis/market';
import {
  ApiFootballFixture,
  ApiFootballFixtureStatisticsEntry,
  ApiFootballInjury,
  ApiFootballLineup,
  ApiFootballOdds,
  ApiFootballPlayerStatistics,
  ApiFootballStandingsLeague,
} from './fixtures-response.type';

export type FixtureAnalysisMetadata = {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type FixtureAnalysis = {
  fixtureId: number;
  summary: string;
  metadata: FixtureAnalysisMetadata;
};

export type FixtureAnalysisContext = {
  fixture: ApiFootballFixture;
  headToHead?: ApiFootballFixture[];
  lineups?: ApiFootballLineup[];
  odds?: ApiFootballOdds[];
  oddsHistory?: Record<number, ApiFootballOdds[]>;
  leagueOddsHistory?: {
    home: Record<number, ApiFootballOdds[]>;
    away: Record<number, ApiFootballOdds[]>;
  };
  standings?: ApiFootballStandingsLeague;
  recentForm?: {
    home: ApiFootballFixture[];
    away: ApiFootballFixture[];
  };
  statistics?: ApiFootballFixtureStatisticsEntry[];
  playerStats?: ApiFootballPlayerStatistics[];
  injuries?: {
    home: ApiFootballInjury[];
    away: ApiFootballInjury[];
  };
  notes?: string[];
  scheduleLoad?: {
    home: ReturnType<typeof buildScheduleLoad>;
    away: ReturnType<typeof buildScheduleLoad>;
  };
  benchDepth?: {
    home: ReturnType<typeof buildBenchDepth>;
    away: ReturnType<typeof buildBenchDepth>;
  };
  marketDrift?: ReturnType<typeof buildMarketDrift>;
  gameDayTimeAnalysis?: GameDayTimeAnalysis;
};

export type GameDayTimeReference = {
  isoDate: string;
  timezone: string;
  weekday: number;
  weekdayLabel: string;
  hour: number;
  minute: number;
  hourLabel: string;
  month: number;
  day: number;
  dateLabel: string;
};

export type GameDayTimeSplit = {
  wins: number;
  draws: number;
  losses: number;
  sample: number;
};

export type GameDayTimePerspective = {
  sameWeekday?: GameDayTimeSplit;
  sameKickoffHour?: GameDayTimeSplit;
  sameWeekdayAndHour?: GameDayTimeSplit;
  sameMonthDay?: GameDayTimeSplit;
};

export type GameDayTimeAnalysis = {
  reference: GameDayTimeReference;
  headToHead?: {
    home?: GameDayTimePerspective;
    away?: GameDayTimePerspective;
  };
  homeTeam?: GameDayTimePerspective;
  awayTeam?: GameDayTimePerspective;
};
