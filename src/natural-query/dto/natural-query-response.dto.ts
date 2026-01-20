import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NaturalQueryPredictionType,
  DateRangeType,
  ConfidenceThreshold,
  SortOption,
} from '../types/natural-query.types';
import { ConfidenceLevel } from '../../predictions/types/prediction.types';

// ============ Nested DTOs ============

export class TeamDto {
  @ApiProperty({ example: 42, description: 'Team ID' })
  id: number;

  @ApiProperty({ example: 'Arsenal', description: 'Team name' })
  name: string;

  @ApiPropertyOptional({
    example: 'https://example.com/logo.png',
    description: 'Team logo URL',
  })
  logo: string | null;
}

export class LeagueDto {
  @ApiProperty({ example: 39, description: 'League ID' })
  id: number;

  @ApiProperty({ example: 'Premier League', description: 'League name' })
  name: string;

  @ApiProperty({ example: 'England', description: 'Country' })
  country: string;

  @ApiPropertyOptional({ description: 'League logo URL' })
  logo?: string | null;

  @ApiPropertyOptional({ description: 'Country flag URL' })
  flag?: string | null;
}

export class VenueDto {
  @ApiPropertyOptional({
    example: 'Emirates Stadium',
    description: 'Venue name',
  })
  name: string | null;

  @ApiPropertyOptional({ example: 'London', description: 'Venue city' })
  city: string | null;
}

export class MatchFixtureDto {
  @ApiProperty({ example: 12345, description: 'Fixture ID' })
  id: number;

  @ApiProperty({
    example: '2026-01-20T15:00:00Z',
    description: 'Match date and time',
  })
  date: string;

  @ApiProperty({ type: TeamDto, description: 'Home team' })
  homeTeam: TeamDto;

  @ApiProperty({ type: TeamDto, description: 'Away team' })
  awayTeam: TeamDto;

  @ApiProperty({ type: LeagueDto, description: 'League information' })
  league: LeagueDto;

  @ApiPropertyOptional({ type: VenueDto, description: 'Venue information' })
  venue?: VenueDto | null;
}

export class PredictionProbabilitiesDto {
  @ApiPropertyOptional({
    example: 75.5,
    description: 'Over probability (for goal predictions)',
  })
  over?: number;

  @ApiPropertyOptional({
    example: 24.5,
    description: 'Under probability (for goal predictions)',
  })
  under?: number;

  @ApiPropertyOptional({ example: 45.2, description: 'Home win probability' })
  homeWin?: number;

  @ApiPropertyOptional({ example: 28.3, description: 'Draw probability' })
  draw?: number;

  @ApiPropertyOptional({ example: 26.5, description: 'Away win probability' })
  awayWin?: number;

  @ApiPropertyOptional({ example: 65.0, description: 'BTTS yes probability' })
  yes?: number;

  @ApiPropertyOptional({ example: 35.0, description: 'BTTS no probability' })
  no?: number;
}

export class MatchPredictionDto {
  @ApiProperty({
    example: 'over_2_5_goals',
    enum: [
      'over_1_5_goals',
      'over_2_5_goals',
      'btts',
      'result',
      'home_win',
      'away_win',
      'draw',
      'high_scoring',
      'any',
    ],
    description: 'Type of prediction',
  })
  type: NaturalQueryPredictionType;

  @ApiProperty({
    example: 78.5,
    description: 'Prediction probability percentage',
  })
  probability: number;

  @ApiProperty({
    example: 'over',
    description:
      'Predicted outcome (over/under for goals, yes/no for BTTS, home/away/draw for result)',
  })
  predictedOutcome: string;

  @ApiProperty({
    example: 'high',
    enum: ['very high', 'high', 'medium', 'low'],
    description: 'Confidence level',
  })
  confidence: ConfidenceLevel;

  @ApiPropertyOptional({
    type: PredictionProbabilitiesDto,
    description: 'Detailed probabilities',
  })
  probabilities?: PredictionProbabilitiesDto;
}

export class PredictionFactorDto {
  @ApiProperty({ example: 'Team Goal Averages', description: 'Factor name' })
  name: string;

  @ApiProperty({
    example: 'Both teams average 2.1 goals per match',
    description: 'Factor description',
  })
  description: string;

  @ApiProperty({
    example: 'home',
    enum: ['home', 'away', 'neutral'],
    description: 'Which team the factor favors',
  })
  impact: 'home' | 'away' | 'neutral';

  @ApiProperty({ example: 0.4, description: 'Factor weight in calculation' })
  weight: number;
}

export class AnalyzedMatchDto {
  @ApiProperty({ type: MatchFixtureDto, description: 'Fixture details' })
  fixture: MatchFixtureDto;

  @ApiProperty({
    type: MatchPredictionDto,
    description: 'Prediction for this match',
  })
  prediction: MatchPredictionDto;

  @ApiProperty({
    type: [PredictionFactorDto],
    description: 'Key factors supporting this prediction',
  })
  relevantFactors: PredictionFactorDto[];
}

// ============ Intent DTOs ============

export class DateRangeFilterDto {
  @ApiProperty({
    example: 'next_3_days',
    enum: ['today', 'tomorrow', 'next_3_days'],
    description: 'Date range type',
  })
  type: DateRangeType;

  @ApiPropertyOptional({
    example: '2026-01-20',
    description: 'Start date if specified',
  })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-01-22',
    description: 'End date if specified',
  })
  endDate?: string;
}

export class ClassifiedFiltersDto {
  @ApiProperty({
    example: ['England'],
    description: 'Countries to filter by',
  })
  countries: string[];

  @ApiProperty({
    example: ['Premier League'],
    description: 'Leagues to filter by',
  })
  leagues: string[];

  @ApiProperty({ type: DateRangeFilterDto, description: 'Date range filter' })
  dateRange: DateRangeFilterDto;

  @ApiProperty({
    example: 'any',
    enum: ['any', 'medium', 'high', 'very_high'],
    description: 'Minimum confidence threshold',
  })
  confidenceThreshold: ConfidenceThreshold;
}

export class ClassifiedIntentDto {
  @ApiProperty({
    example: 'over_1_5_goals',
    enum: [
      'over_1_5_goals',
      'over_2_5_goals',
      'btts',
      'result',
      'home_win',
      'away_win',
      'draw',
      'high_scoring',
      'any',
    ],
    description: 'Extracted prediction type',
  })
  predictionType: NaturalQueryPredictionType;

  @ApiProperty({ type: ClassifiedFiltersDto, description: 'Extracted filters' })
  filters: ClassifiedFiltersDto;

  @ApiProperty({
    example: 'confidence',
    enum: ['confidence', 'date', 'goals_expected'],
    description: 'Sort preference',
  })
  sortBy: SortOption;

  @ApiProperty({ example: 10, description: 'Maximum results to return' })
  limit: number;

  @ApiProperty({
    example: false,
    description: 'Whether the query was ambiguous',
  })
  isAmbiguous: boolean;

  @ApiPropertyOptional({
    example: null,
    description: 'Clarification needed if ambiguous',
  })
  clarificationNeeded: string | null;
}

export class QueryMetadataDto {
  @ApiProperty({
    example: 'Give me matches that will get over 1.5 goals from England',
    description: 'Original query',
  })
  query: string;

  @ApiProperty({ type: ClassifiedIntentDto, description: 'Classified intent' })
  intent: ClassifiedIntentDto;

  @ApiProperty({ example: 45, description: 'Number of fixtures searched' })
  fixturesSearched: number;

  @ApiProperty({ example: 5, description: 'Number of matches found' })
  matchesFound: number;

  @ApiPropertyOptional({
    example: 250,
    description: 'Execution time in milliseconds',
  })
  executionTimeMs?: number;
}

// ============ Main Response DTO ============

export class NaturalQueryResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the query was successful',
  })
  success: boolean;

  @ApiProperty({
    type: [AnalyzedMatchDto],
    description: 'Matches found with predictions',
  })
  matches: AnalyzedMatchDto[];

  @ApiPropertyOptional({
    example: 'Found 5 matches from England with high over 1.5 goals potential',
    description: 'Summary of results',
  })
  summary?: string;

  @ApiPropertyOptional({
    example: 'Did you mean over 1.5 or over 2.5 goals?',
    description: 'Clarification needed if query is ambiguous',
  })
  clarificationNeeded?: string;

  @ApiPropertyOptional({
    example: ['Over 1.5 goals from England', 'BTTS predictions from La Liga'],
    description: 'Suggested queries',
  })
  suggestions?: string[];

  @ApiProperty({ type: QueryMetadataDto, description: 'Query metadata' })
  metadata: QueryMetadataDto;
}
