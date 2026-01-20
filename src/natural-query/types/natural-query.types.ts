import { ApiFootballTeam } from '../../fixtures/types/fixtures-response.type';
import {
  ConfidenceLevel,
  PredictionFactor,
} from '../../predictions/types/prediction.types';

/**
 * Supported prediction types for natural language queries
 */
export type NaturalQueryPredictionType =
  | 'over_1_5_goals'
  | 'over_2_5_goals'
  | 'btts'
  | 'result'
  | 'home_win'
  | 'away_win'
  | 'draw'
  | 'high_scoring'
  | 'any';

/**
 * Date range type for queries
 */
export type DateRangeType = 'today' | 'tomorrow' | 'next_3_days';

/**
 * Confidence threshold for filtering results
 */
export type ConfidenceThreshold = 'any' | 'medium' | 'high' | 'very_high';

/**
 * Sort options for query results
 */
export type SortOption = 'confidence' | 'date' | 'goals_expected';

/**
 * Date range filter extracted from query
 */
export interface DateRangeFilter {
  type: DateRangeType;
  startDate?: string;
  endDate?: string;
}

/**
 * Filters extracted from the user's natural language query
 */
export interface ClassifiedFilters {
  countries: string[];
  leagues: string[];
  dateRange: DateRangeFilter;
  confidenceThreshold: ConfidenceThreshold;
}

/**
 * Entities extracted from the query for debugging/analytics
 */
export interface ExtractedEntities {
  teams: string[];
  keywords: string[];
}

/**
 * The classified intent from a natural language query
 */
export interface ClassifiedIntent {
  predictionType: NaturalQueryPredictionType;
  filters: ClassifiedFilters;
  sortBy: SortOption;
  limit: number;
  isAmbiguous: boolean;
  clarificationNeeded: string | null;
  extractedEntities?: ExtractedEntities;
}

/**
 * Fixture details in query response
 */
export interface QueryMatchFixture {
  id: number;
  date: string;
  homeTeam: Pick<ApiFootballTeam, 'id' | 'name' | 'logo'>;
  awayTeam: Pick<ApiFootballTeam, 'id' | 'name' | 'logo'>;
  league: {
    id: number;
    name: string;
    country: string;
    logo?: string | null;
    flag?: string | null;
  };
  venue?: {
    name: string | null;
    city: string | null;
  } | null;
}

/**
 * Prediction result for a queried match
 */
export interface QueryMatchPrediction {
  type: NaturalQueryPredictionType;
  probability: number;
  predictedOutcome: string;
  confidence: ConfidenceLevel;
  probabilities?: {
    over?: number;
    under?: number;
    homeWin?: number;
    draw?: number;
    awayWin?: number;
    yes?: number;
    no?: number;
  };
}

/**
 * An analyzed match returned from a query
 */
export interface AnalyzedMatch {
  fixture: QueryMatchFixture;
  prediction: QueryMatchPrediction;
  relevantFactors: PredictionFactor[];
}

/**
 * Metadata about the query execution
 */
export interface QueryMetadata {
  query: string;
  normalizedQuery: string;
  intent: ClassifiedIntent;
  fixturesSearched: number;
  matchesFound: number;
  executionTimeMs?: number;
  cacheHit?: boolean;
}

/**
 * Response from a natural language query
 */
export interface NaturalQueryResponse {
  success: boolean;
  matches: AnalyzedMatch[];
  summary?: string;
  clarificationNeeded?: string;
  suggestions?: string[];
  metadata: QueryMetadata;
}

/**
 * BTTS (Both Teams To Score) prediction result
 */
export interface BTTSPrediction {
  type: 'btts';
  probability: number;
  predictedOutcome: 'yes' | 'no';
  confidence: ConfidenceLevel;
  probabilities: {
    yes: number;
    no: number;
  };
  keyFactors: PredictionFactor[];
}

/**
 * BTTS calculation intermediate result
 */
export interface BTTSCalculation {
  homeBTTSRate: number;
  awayBTTSRate: number;
  h2hBTTSRate: number;
  homeScoringRate: number;
  awayScoringRate: number;
  combinedProbability: number;
}

/**
 * Query preprocessing result
 */
export interface PreprocessedQuery {
  original: string;
  normalized: string;
  tokens: string[];
  detectedLanguage?: string;
}

/**
 * Error types for natural query processing
 */
export enum NaturalQueryErrorType {
  CLASSIFICATION_FAILED = 'CLASSIFICATION_FAILED',
  NO_FIXTURES_AVAILABLE = 'NO_FIXTURES_AVAILABLE',
  INVALID_QUERY = 'INVALID_QUERY',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Structured error for natural query processing
 */
export interface NaturalQueryError {
  type: NaturalQueryErrorType;
  message: string;
  suggestions?: string[];
}
