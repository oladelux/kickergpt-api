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
};
