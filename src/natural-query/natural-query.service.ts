import { Injectable, Logger } from '@nestjs/common';
import { IntentClassifierService } from './intent-classifier.service';
import { FixtureFilterService } from './fixture-filter.service';
import { PromptUsageService } from '../prompt-usage/prompt-usage.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  KickerGPTFixturesResponse,
  KickerGPTMatchSummary,
} from '../fixtures/types/fixtures-response.type';
import {
  ClassifiedIntent,
  NaturalQueryResponse,
  AnalyzedMatch,
  QueryMatchPrediction,
  NaturalQueryPredictionType,
  ConfidenceThreshold,
  SortOption,
} from './types/natural-query.types';
import {
  ConfidenceLevel,
  PredictionFactor,
  VERY_HIGH_CONFIDENCE_THRESHOLD,
  HIGH_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
} from '../predictions/types/prediction.types';

/**
 * Weights for BTTS calculation factors
 */
const BTTS_WEIGHTS = {
  teamBTTS: 0.35,
  h2h: 0.25,
  scoringAbility: 0.4,
} as const;

/**
 * Configuration for the natural query service
 */
const CONFIG = {
  maxResults: 50,
  defaultResults: 10,
  minMatchesForAnalysis: 3,
  fallbackProbability: 50,
} as const;

@Injectable()
export class NaturalQueryService {
  private readonly logger = new Logger(NaturalQueryService.name);

  constructor(
    private readonly intentClassifier: IntentClassifierService,
    private readonly fixtureFilter: FixtureFilterService,
    private readonly promptUsageService: PromptUsageService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Consume a prompt credit for the user based on their subscription plan.
   */
  private async consumePromptCredit(userId: string): Promise<void> {
    const subscription =
      await this.subscriptionsService.getSubscriptionForUser(userId);
    await this.promptUsageService.consumePromptCredit({
      userId,
      plan: subscription.plan,
      status: subscription.status,
    });
  }

  /**
   * Process a natural language query and return matching fixtures with predictions.
   */
  async queryMatches(
    query: string,
    userId: string,
  ): Promise<NaturalQueryResponse> {
    const startTime = Date.now();
    this.logger.log(`Processing query for user ${userId}: "${query}"`);

    try {
      // Consume credit before processing
      await this.consumePromptCredit(userId);

      // Step 1: Classify intent
      const intent = await this.intentClassifier.classifyIntent(query);
      const normalizedQuery = this.intentClassifier
        .getPreprocessor()
        .preprocess(query).normalized;

      // Handle ambiguous queries
      if (intent.isAmbiguous) {
        return this.createAmbiguousResponse(
          query,
          normalizedQuery,
          intent,
          startTime,
        );
      }

      // Step 2: Get filtered fixtures
      const fixtures = await this.fixtureFilter.getFilteredFixtures(intent);

      if (fixtures.length === 0) {
        return await this.createNoFixturesResponse(
          query,
          normalizedQuery,
          intent,
          startTime,
        );
      }

      // Step 3: Analyze fixtures based on prediction type
      const analyzedMatches = this.analyzeFixtures(fixtures, intent);

      // Step 4: Sort results
      const sortedMatches = this.sortMatches(analyzedMatches, intent.sortBy);

      // Step 5: Filter by confidence threshold
      const filteredByConfidence = this.filterByConfidence(
        sortedMatches,
        intent.filters.confidenceThreshold,
      );

      // Step 6: Apply limit
      const limitedMatches = filteredByConfidence.slice(0, intent.limit);

      // Step 7: Build response
      const summary = this.buildSummary(
        limitedMatches,
        intent,
        fixtures.length,
      );
      const suggestions = this.generateContextualSuggestions(
        intent,
        limitedMatches.length,
      );

      return {
        success: true,
        matches: limitedMatches,
        summary,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        metadata: {
          query,
          normalizedQuery,
          intent,
          fixturesSearched: fixtures.length,
          matchesFound: limitedMatches.length,
          executionTimeMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error processing query: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return this.createErrorResponse(query, error as Error, startTime);
    }
  }

  /**
   * Create response for ambiguous queries
   */
  private createAmbiguousResponse(
    query: string,
    normalizedQuery: string,
    intent: ClassifiedIntent,
    startTime: number,
  ): NaturalQueryResponse {
    return {
      success: false,
      matches: [],
      clarificationNeeded: intent.clarificationNeeded ?? undefined,
      suggestions: this.getQuerySuggestions(),
      metadata: {
        query,
        normalizedQuery,
        intent,
        fixturesSearched: 0,
        matchesFound: 0,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Create response when no fixtures are found
   */
  private async createNoFixturesResponse(
    query: string,
    normalizedQuery: string,
    intent: ClassifiedIntent,
    startTime: number,
  ): Promise<NaturalQueryResponse> {
    const availableCountries = await this.fixtureFilter.getAvailableCountries();
    const suggestions = this.generateNoResultsSuggestions(
      intent,
      availableCountries,
    );

    return {
      success: true,
      matches: [],
      summary: this.buildNoResultsSummary(intent),
      suggestions,
      metadata: {
        query,
        normalizedQuery,
        intent,
        fixturesSearched: 0,
        matchesFound: 0,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    query: string,
    error: Error,
    startTime: number,
  ): NaturalQueryResponse {
    return {
      success: false,
      matches: [],
      summary:
        'An error occurred while processing your query. Please try again.',
      suggestions: this.getQuerySuggestions(),
      metadata: {
        query,
        normalizedQuery: query,
        intent: {
          predictionType: 'any',
          filters: {
            countries: [],
            leagues: [],
            dateRange: { type: 'next_3_days' },
            confidenceThreshold: 'any',
          },
          sortBy: 'confidence',
          limit: 10,
          isAmbiguous: true,
          clarificationNeeded: error.message,
        },
        fixturesSearched: 0,
        matchesFound: 0,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Analyze fixtures based on the prediction type.
   */
  private analyzeFixtures(
    fixtures: KickerGPTFixturesResponse[],
    intent: ClassifiedIntent,
  ): AnalyzedMatch[] {
    return fixtures.map((fixture) => {
      const prediction = this.analyzeSingleFixture(
        fixture,
        intent.predictionType,
      );
      const relevantFactors = this.extractRelevantFactors(
        fixture,
        intent.predictionType,
      );

      return {
        fixture: {
          id: fixture.id,
          date: fixture.date,
          homeTeam: {
            id: fixture.teams.home.id,
            name: fixture.teams.home.name,
            logo: fixture.teams.home.logo,
          },
          awayTeam: {
            id: fixture.teams.away.id,
            name: fixture.teams.away.name,
            logo: fixture.teams.away.logo,
          },
          league: {
            id: fixture.league.id,
            name: fixture.league.name,
            country: fixture.league.country,
            logo: 'logo' in fixture.league ? fixture.league.logo : null,
            flag: 'flag' in fixture.league ? fixture.league.flag : null,
          },
          venue: fixture.venue
            ? { name: fixture.venue.name, city: fixture.venue.city }
            : null,
        },
        prediction,
        relevantFactors,
      };
    });
  }

  /**
   * Analyze a single fixture for the specified prediction type.
   */
  private analyzeSingleFixture(
    fixture: KickerGPTFixturesResponse,
    predictionType: NaturalQueryPredictionType,
  ): QueryMatchPrediction {
    switch (predictionType) {
      case 'over_1_5_goals':
        return this.analyzeGoalPrediction(fixture, 1.5);
      case 'over_2_5_goals':
      case 'high_scoring':
        return this.analyzeGoalPrediction(fixture, 2.5);
      case 'btts':
        return this.analyzeBTTSPrediction(fixture);
      case 'result':
        return this.analyzeResultPrediction(fixture);
      case 'home_win':
        return this.analyzeSpecificResultPrediction(fixture, 'home');
      case 'away_win':
        return this.analyzeSpecificResultPrediction(fixture, 'away');
      case 'draw':
        return this.analyzeSpecificResultPrediction(fixture, 'draw');
      case 'any':
      default:
        // For "any" type, analyze multiple prediction types and return the best one
        return this.analyzeBestPrediction(fixture);
    }
  }

  /**
   * Analyze multiple prediction types and return the one with highest confidence
   */
  private analyzeBestPrediction(
    fixture: KickerGPTFixturesResponse,
  ): QueryMatchPrediction {
    const predictions = [
      this.analyzeGoalPrediction(fixture, 2.5),
      this.analyzeGoalPrediction(fixture, 1.5),
      this.analyzeBTTSPrediction(fixture),
      this.analyzeResultPrediction(fixture),
    ];

    // Return the prediction with highest probability
    return predictions.reduce((best, current) =>
      current.probability > best.probability ? current : best,
    );
  }

  /**
   * Analyze goal prediction (over 1.5 or 2.5).
   */
  private analyzeGoalPrediction(
    fixture: KickerGPTFixturesResponse,
    threshold: number,
  ): QueryMatchPrediction {
    const homeMatches = fixture.homeTeamRecentMatches ?? [];
    const awayMatches = fixture.awayTeamRecentMatches ?? [];
    const h2h = fixture.h2h ?? [];

    // Calculate over rate from recent matches
    const homeOverRate = this.calculateOverRate(
      homeMatches,
      fixture.teams.home.id,
      threshold,
    );
    const awayOverRate = this.calculateOverRate(
      awayMatches,
      fixture.teams.away.id,
      threshold,
    );
    const h2hOverRate = this.calculateH2HOverRate(h2h, threshold);

    // Calculate expected goals
    const homeGoalStats = this.calculateTeamGoalStats(
      homeMatches,
      fixture.teams.home.id,
    );
    const awayGoalStats = this.calculateTeamGoalStats(
      awayMatches,
      fixture.teams.away.id,
    );

    const expectedGoals =
      (homeGoalStats.avgScored + awayGoalStats.avgConceded) / 2 +
      (awayGoalStats.avgScored + homeGoalStats.avgConceded) / 2;

    // Weight factors based on data availability
    const hasH2H = h2h.length > 0;
    const homeWeight = hasH2H ? 0.35 : 0.45;
    const awayWeight = hasH2H ? 0.35 : 0.45;
    const h2hWeight = hasH2H ? 0.2 : 0;
    const expectedGoalsWeight = 0.1;

    const probability =
      homeOverRate * homeWeight +
      awayOverRate * awayWeight +
      h2hOverRate * h2hWeight +
      (expectedGoals > threshold ? expectedGoalsWeight : 0);

    const normalizedProbability = Math.min(1, Math.max(0, probability)) * 100;

    return {
      type: threshold === 1.5 ? 'over_1_5_goals' : 'over_2_5_goals',
      probability: Math.round(normalizedProbability * 10) / 10,
      predictedOutcome: normalizedProbability >= 50 ? 'over' : 'under',
      confidence: this.getConfidenceLevel(normalizedProbability),
      probabilities: {
        over: Math.round(normalizedProbability * 10) / 10,
        under: Math.round((100 - normalizedProbability) * 10) / 10,
      },
    };
  }

  /**
   * Analyze BTTS prediction.
   */
  private analyzeBTTSPrediction(
    fixture: KickerGPTFixturesResponse,
  ): QueryMatchPrediction {
    const homeMatches = fixture.homeTeamRecentMatches ?? [];
    const awayMatches = fixture.awayTeamRecentMatches ?? [];
    const h2h = fixture.h2h ?? [];

    // Calculate BTTS rates from recent matches
    const homeBTTSRate = this.calculateBTTSRate(
      homeMatches,
      fixture.teams.home.id,
    );
    const awayBTTSRate = this.calculateBTTSRate(
      awayMatches,
      fixture.teams.away.id,
    );
    const h2hBTTSRate = this.calculateH2HBTTSRate(h2h);

    // Calculate scoring ability
    const homeScoringRate = this.calculateScoringRate(
      homeMatches,
      fixture.teams.home.id,
    );
    const awayScoringRate = this.calculateScoringRate(
      awayMatches,
      fixture.teams.away.id,
    );

    // Combined probability using weights
    const teamBTTSComponent =
      ((homeBTTSRate + awayBTTSRate) / 2) * BTTS_WEIGHTS.teamBTTS;
    const h2hComponent = h2hBTTSRate * BTTS_WEIGHTS.h2h;
    const scoringComponent =
      ((homeScoringRate + awayScoringRate) / 2) * BTTS_WEIGHTS.scoringAbility;

    const probability =
      (teamBTTSComponent + h2hComponent + scoringComponent) * 100;

    const normalizedProbability = Math.min(100, Math.max(0, probability));

    return {
      type: 'btts',
      probability: Math.round(normalizedProbability * 10) / 10,
      predictedOutcome: normalizedProbability >= 50 ? 'yes' : 'no',
      confidence: this.getConfidenceLevel(normalizedProbability),
      probabilities: {
        yes: Math.round(normalizedProbability * 10) / 10,
        no: Math.round((100 - normalizedProbability) * 10) / 10,
      },
    };
  }

  /**
   * Analyze result prediction (home/away/draw).
   */
  private analyzeResultPrediction(
    fixture: KickerGPTFixturesResponse,
  ): QueryMatchPrediction {
    // Calculate from odds
    const oddsResult = this.calculateFromOdds(fixture.homeOdd, fixture.awayOdd);

    // Calculate from recent form
    const homeForm = this.calculateTeamForm(
      fixture.homeTeamRecentMatches ?? [],
      fixture.teams.home.id,
    );
    const awayForm = this.calculateTeamForm(
      fixture.awayTeamRecentMatches ?? [],
      fixture.teams.away.id,
    );

    // Calculate from H2H
    const h2hResult = this.calculateH2HResult(
      fixture.h2h ?? [],
      fixture.teams.home.id,
    );

    // Weight factors
    const homeProb =
      (oddsResult?.home ?? 0.33) * 0.4 +
      homeForm * 0.3 +
      h2hResult.home * 0.2 +
      0.05; // Home advantage
    const awayProb =
      (oddsResult?.away ?? 0.33) * 0.4 + awayForm * 0.3 + h2hResult.away * 0.2;
    const drawProb = 1 - homeProb - awayProb;

    // Normalize
    const total = homeProb + awayProb + Math.max(0.1, drawProb);
    const normalizedHome = (homeProb / total) * 100;
    const normalizedAway = (awayProb / total) * 100;
    const normalizedDraw = (Math.max(0.1, drawProb) / total) * 100;

    let predictedOutcome: string;
    let probability: number;

    if (normalizedHome >= normalizedAway && normalizedHome >= normalizedDraw) {
      predictedOutcome = 'home';
      probability = normalizedHome;
    } else if (
      normalizedAway >= normalizedHome &&
      normalizedAway >= normalizedDraw
    ) {
      predictedOutcome = 'away';
      probability = normalizedAway;
    } else {
      predictedOutcome = 'draw';
      probability = normalizedDraw;
    }

    return {
      type: 'result',
      probability: Math.round(probability * 10) / 10,
      predictedOutcome,
      confidence: this.getConfidenceLevel(probability),
      probabilities: {
        homeWin: Math.round(normalizedHome * 10) / 10,
        draw: Math.round(normalizedDraw * 10) / 10,
        awayWin: Math.round(normalizedAway * 10) / 10,
      },
    };
  }

  /**
   * Analyze for a specific result type (home win, away win, or draw).
   */
  private analyzeSpecificResultPrediction(
    fixture: KickerGPTFixturesResponse,
    targetOutcome: 'home' | 'away' | 'draw',
  ): QueryMatchPrediction {
    // Calculate from odds
    const oddsResult = this.calculateFromOdds(fixture.homeOdd, fixture.awayOdd);

    // Calculate from recent form
    const homeForm = this.calculateTeamForm(
      fixture.homeTeamRecentMatches ?? [],
      fixture.teams.home.id,
    );
    const awayForm = this.calculateTeamForm(
      fixture.awayTeamRecentMatches ?? [],
      fixture.teams.away.id,
    );

    // Calculate from H2H
    const h2hResult = this.calculateH2HResult(
      fixture.h2h ?? [],
      fixture.teams.home.id,
    );

    // Weight factors
    const homeProb =
      (oddsResult?.home ?? 0.33) * 0.4 +
      homeForm * 0.3 +
      h2hResult.home * 0.2 +
      0.05;
    const awayProb =
      (oddsResult?.away ?? 0.33) * 0.4 + awayForm * 0.3 + h2hResult.away * 0.2;
    const drawProb = 1 - homeProb - awayProb;

    // Normalize
    const total = homeProb + awayProb + Math.max(0.1, drawProb);
    const normalizedHome = (homeProb / total) * 100;
    const normalizedAway = (awayProb / total) * 100;
    const normalizedDraw = (Math.max(0.1, drawProb) / total) * 100;

    let probability: number;
    let predictionType: NaturalQueryPredictionType;

    switch (targetOutcome) {
      case 'home':
        probability = normalizedHome;
        predictionType = 'home_win';
        break;
      case 'away':
        probability = normalizedAway;
        predictionType = 'away_win';
        break;
      case 'draw':
        probability = normalizedDraw;
        predictionType = 'draw';
        break;
    }

    return {
      type: predictionType,
      probability: Math.round(probability * 10) / 10,
      predictedOutcome: targetOutcome,
      confidence: this.getConfidenceLevel(probability),
      probabilities: {
        homeWin: Math.round(normalizedHome * 10) / 10,
        draw: Math.round(normalizedDraw * 10) / 10,
        awayWin: Math.round(normalizedAway * 10) / 10,
      },
    };
  }

  // ============ Helper Methods ============

  private calculateOverRate(
    matches: KickerGPTMatchSummary[],
    teamId: number,
    threshold: number,
  ): number {
    if (!matches || matches.length === 0)
      return CONFIG.fallbackProbability / 100;

    const recentMatches = matches.slice(0, 5);
    let overCount = 0;
    let validMatches = 0;

    for (const match of recentMatches) {
      const homeGoals = match.goals.home;
      const awayGoals = match.goals.away;

      if (homeGoals !== null && awayGoals !== null) {
        const totalGoals = homeGoals + awayGoals;
        if (totalGoals > threshold) {
          overCount++;
        }
        validMatches++;
      }
    }

    return validMatches > 0
      ? overCount / validMatches
      : CONFIG.fallbackProbability / 100;
  }

  private calculateH2HOverRate(
    h2h: KickerGPTMatchSummary[],
    threshold: number,
  ): number {
    if (!h2h || h2h.length === 0) return CONFIG.fallbackProbability / 100;

    let overCount = 0;
    let validMatches = 0;

    for (const match of h2h) {
      const homeGoals = match.goals.home;
      const awayGoals = match.goals.away;

      if (homeGoals !== null && awayGoals !== null) {
        const totalGoals = homeGoals + awayGoals;
        if (totalGoals > threshold) {
          overCount++;
        }
        validMatches++;
      }
    }

    return validMatches > 0
      ? overCount / validMatches
      : CONFIG.fallbackProbability / 100;
  }

  private calculateTeamGoalStats(
    matches: KickerGPTMatchSummary[],
    teamId: number,
  ): { avgScored: number; avgConceded: number } {
    if (!matches || matches.length === 0) {
      return { avgScored: 1.2, avgConceded: 1.2 };
    }

    const recentMatches = matches.slice(0, 5);
    let totalScored = 0;
    let totalConceded = 0;
    let validMatches = 0;

    for (const match of recentMatches) {
      const isHome = match.teams.home.id === teamId;
      const teamGoals = isHome ? match.goals.home : match.goals.away;
      const oppGoals = isHome ? match.goals.away : match.goals.home;

      if (teamGoals !== null && oppGoals !== null) {
        totalScored += teamGoals;
        totalConceded += oppGoals;
        validMatches++;
      }
    }

    if (validMatches === 0) {
      return { avgScored: 1.2, avgConceded: 1.2 };
    }

    return {
      avgScored: totalScored / validMatches,
      avgConceded: totalConceded / validMatches,
    };
  }

  private calculateBTTSRate(
    matches: KickerGPTMatchSummary[],
    teamId: number,
  ): number {
    if (!matches || matches.length === 0)
      return CONFIG.fallbackProbability / 100;

    const recentMatches = matches.slice(0, 5);
    let bttsCount = 0;
    let validMatches = 0;

    for (const match of recentMatches) {
      const isHome = match.teams.home.id === teamId;
      const isAway = match.teams.away.id === teamId;
      if (!isHome && !isAway) continue;

      const homeGoals = match.goals.home ?? 0;
      const awayGoals = match.goals.away ?? 0;

      if (match.goals.home !== null && match.goals.away !== null) {
        if (homeGoals > 0 && awayGoals > 0) {
          bttsCount++;
        }
        validMatches++;
      }
    }

    return validMatches > 0
      ? bttsCount / validMatches
      : CONFIG.fallbackProbability / 100;
  }

  private calculateH2HBTTSRate(h2h: KickerGPTMatchSummary[]): number {
    if (!h2h || h2h.length === 0) return CONFIG.fallbackProbability / 100;

    let bttsCount = 0;
    let validMatches = 0;

    for (const match of h2h) {
      const homeGoals = match.goals.home ?? 0;
      const awayGoals = match.goals.away ?? 0;

      if (match.goals.home !== null && match.goals.away !== null) {
        if (homeGoals > 0 && awayGoals > 0) {
          bttsCount++;
        }
        validMatches++;
      }
    }

    return validMatches > 0
      ? bttsCount / validMatches
      : CONFIG.fallbackProbability / 100;
  }

  private calculateScoringRate(
    matches: KickerGPTMatchSummary[],
    teamId: number,
  ): number {
    if (!matches || matches.length === 0)
      return CONFIG.fallbackProbability / 100;

    const recentMatches = matches.slice(0, 5);
    let scoredCount = 0;
    let validMatches = 0;

    for (const match of recentMatches) {
      const isHome = match.teams.home.id === teamId;
      const teamGoals = isHome ? match.goals.home : match.goals.away;

      if (teamGoals !== null) {
        if (teamGoals > 0) {
          scoredCount++;
        }
        validMatches++;
      }
    }

    return validMatches > 0
      ? scoredCount / validMatches
      : CONFIG.fallbackProbability / 100;
  }

  private calculateFromOdds(
    homeOdd: string | undefined,
    awayOdd: string | undefined,
  ): { home: number; away: number } | null {
    if (!homeOdd && !awayOdd) return null;

    const homeOddsValue = homeOdd ? parseFloat(homeOdd) : 0;
    const awayOddsValue = awayOdd ? parseFloat(awayOdd) : 0;

    if (
      (homeOdd && (isNaN(homeOddsValue) || homeOddsValue <= 0)) ||
      (awayOdd && (isNaN(awayOddsValue) || awayOddsValue <= 0))
    ) {
      return null;
    }

    const homeImplied = homeOddsValue > 0 ? 1 / homeOddsValue : 0.33;
    const awayImplied = awayOddsValue > 0 ? 1 / awayOddsValue : 0.33;

    const total = homeImplied + awayImplied;
    if (total === 0) return null;

    return {
      home: homeImplied / total,
      away: awayImplied / total,
    };
  }

  private calculateTeamForm(
    matches: KickerGPTMatchSummary[],
    teamId: number,
  ): number {
    if (!matches || matches.length === 0)
      return CONFIG.fallbackProbability / 100;

    const recentMatches = matches.slice(0, 5);
    let points = 0;
    let matchesAnalyzed = 0;

    for (const match of recentMatches) {
      const isHome = match.teams.home.id === teamId;
      const homeGoals = match.goals.home;
      const awayGoals = match.goals.away;

      if (homeGoals === null || awayGoals === null) continue;

      matchesAnalyzed++;

      if (isHome) {
        if (homeGoals > awayGoals) points += 3;
        else if (homeGoals === awayGoals) points += 1;
      } else {
        if (awayGoals > homeGoals) points += 3;
        else if (awayGoals === homeGoals) points += 1;
      }
    }

    if (matchesAnalyzed === 0) return CONFIG.fallbackProbability / 100;

    const maxPoints = 3 * matchesAnalyzed;
    return points / maxPoints;
  }

  private calculateH2HResult(
    h2h: KickerGPTMatchSummary[],
    homeTeamId: number,
  ): { home: number; away: number } {
    if (!h2h || h2h.length === 0) {
      return {
        home: CONFIG.fallbackProbability / 100,
        away: CONFIG.fallbackProbability / 100,
      };
    }

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;

    for (const match of h2h) {
      const homeGoals = match.goals.home;
      const awayGoals = match.goals.away;

      if (homeGoals === null || awayGoals === null) continue;

      const currentHomeWasHome = match.teams.home.id === homeTeamId;

      if (homeGoals > awayGoals) {
        if (currentHomeWasHome) homeWins++;
        else awayWins++;
      } else if (awayGoals > homeGoals) {
        if (currentHomeWasHome) awayWins++;
        else homeWins++;
      } else {
        draws++;
      }
    }

    const totalMatches = homeWins + awayWins + draws;
    if (totalMatches === 0) {
      return {
        home: CONFIG.fallbackProbability / 100,
        away: CONFIG.fallbackProbability / 100,
      };
    }

    const homeScore = homeWins + draws * 0.5;
    const awayScore = awayWins + draws * 0.5;
    const total = homeScore + awayScore;

    if (total === 0) {
      return {
        home: CONFIG.fallbackProbability / 100,
        away: CONFIG.fallbackProbability / 100,
      };
    }

    return {
      home: homeScore / total,
      away: awayScore / total,
    };
  }

  private getConfidenceLevel(probability: number): ConfidenceLevel {
    if (probability >= VERY_HIGH_CONFIDENCE_THRESHOLD) return 'very high';
    if (probability >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
    if (probability >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
    return 'low';
  }

  private extractRelevantFactors(
    fixture: KickerGPTFixturesResponse,
    predictionType: NaturalQueryPredictionType,
  ): PredictionFactor[] {
    const factors: PredictionFactor[] = [];

    const homeMatches = fixture.homeTeamRecentMatches ?? [];
    const awayMatches = fixture.awayTeamRecentMatches ?? [];
    const h2h = fixture.h2h ?? [];

    if (
      predictionType === 'btts' ||
      predictionType === 'over_1_5_goals' ||
      predictionType === 'over_2_5_goals' ||
      predictionType === 'any'
    ) {
      const homeStats = this.calculateTeamGoalStats(
        homeMatches,
        fixture.teams.home.id,
      );
      const awayStats = this.calculateTeamGoalStats(
        awayMatches,
        fixture.teams.away.id,
      );

      factors.push({
        name: 'Goal Averages',
        description: `${fixture.teams.home.name}: ${homeStats.avgScored.toFixed(1)} scored, ${homeStats.avgConceded.toFixed(1)} conceded | ${fixture.teams.away.name}: ${awayStats.avgScored.toFixed(1)} scored, ${awayStats.avgConceded.toFixed(1)} conceded`,
        impact: 'neutral',
        weight: 0.4,
      });

      if (h2h.length > 0) {
        const h2hGoals = h2h.reduce((sum, m) => {
          const total = (m.goals.home ?? 0) + (m.goals.away ?? 0);
          return sum + total;
        }, 0);
        const avgH2HGoals = h2hGoals / h2h.length;

        factors.push({
          name: 'Head-to-Head',
          description: `${h2h.length} previous meetings, averaging ${avgH2HGoals.toFixed(1)} goals per match`,
          impact: 'neutral',
          weight: 0.2,
        });
      }
    }

    if (predictionType === 'btts') {
      const homeBTTS = this.calculateBTTSRate(
        homeMatches,
        fixture.teams.home.id,
      );
      const awayBTTS = this.calculateBTTSRate(
        awayMatches,
        fixture.teams.away.id,
      );

      factors.push({
        name: 'BTTS History',
        description: `${fixture.teams.home.name}: ${Math.round(homeBTTS * 100)}% BTTS in last 5 | ${fixture.teams.away.name}: ${Math.round(awayBTTS * 100)}% BTTS in last 5`,
        impact: 'neutral',
        weight: 0.35,
      });
    }

    if (
      predictionType === 'result' ||
      predictionType === 'home_win' ||
      predictionType === 'away_win' ||
      predictionType === 'draw'
    ) {
      const homeForm = this.calculateTeamForm(
        homeMatches,
        fixture.teams.home.id,
      );
      const awayForm = this.calculateTeamForm(
        awayMatches,
        fixture.teams.away.id,
      );

      factors.push({
        name: 'Recent Form',
        description: `${fixture.teams.home.name}: ${Math.round(homeForm * 100)}% points won | ${fixture.teams.away.name}: ${Math.round(awayForm * 100)}% points won`,
        impact: homeForm > awayForm ? 'home' : 'away',
        weight: 0.3,
      });

      if (fixture.homeOdd && fixture.awayOdd) {
        factors.push({
          name: 'Odds',
          description: `${fixture.teams.home.name}: ${fixture.homeOdd} | ${fixture.teams.away.name}: ${fixture.awayOdd}`,
          impact:
            parseFloat(fixture.homeOdd) < parseFloat(fixture.awayOdd)
              ? 'home'
              : 'away',
          weight: 0.4,
        });
      }
    }

    return factors.slice(0, 3);
  }

  private sortMatches(
    matches: AnalyzedMatch[],
    sortBy: SortOption,
  ): AnalyzedMatch[] {
    return [...matches].sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          return b.prediction.probability - a.prediction.probability;
        case 'date':
          return (
            new Date(a.fixture.date).getTime() -
            new Date(b.fixture.date).getTime()
          );
        case 'goals_expected':
          return b.prediction.probability - a.prediction.probability;
        default:
          return b.prediction.probability - a.prediction.probability;
      }
    });
  }

  private filterByConfidence(
    matches: AnalyzedMatch[],
    threshold: ConfidenceThreshold,
  ): AnalyzedMatch[] {
    const thresholdMap: Record<ConfidenceThreshold, number> = {
      any: 0,
      medium: MEDIUM_CONFIDENCE_THRESHOLD,
      high: HIGH_CONFIDENCE_THRESHOLD,
      very_high: VERY_HIGH_CONFIDENCE_THRESHOLD,
    };

    const minProbability = thresholdMap[threshold];

    return matches.filter((m) => m.prediction.probability >= minProbability);
  }

  private buildSummary(
    matches: AnalyzedMatch[],
    intent: ClassifiedIntent,
    totalSearched: number,
  ): string {
    if (matches.length === 0) {
      return this.buildNoResultsSummary(intent);
    }

    const predictionTypeLabels: Record<NaturalQueryPredictionType, string> = {
      over_1_5_goals: 'over 1.5 goals',
      over_2_5_goals: 'over 2.5 goals',
      btts: 'both teams to score',
      result: 'match result',
      home_win: 'home win',
      away_win: 'away win',
      draw: 'draw',
      high_scoring: 'high-scoring',
      any: 'best predictions',
    };

    const parts: string[] = [];

    // Main result count
    parts.push(
      `Found ${matches.length} match${matches.length !== 1 ? 'es' : ''}`,
    );

    // Country filter
    if (intent.filters.countries.length > 0) {
      parts.push(`from ${intent.filters.countries.join(', ')}`);
    }

    // Prediction type
    parts.push(`for ${predictionTypeLabels[intent.predictionType]}`);

    // Confidence
    if (intent.filters.confidenceThreshold !== 'any') {
      parts.push(`with ${intent.filters.confidenceThreshold} confidence`);
    }

    // Date range
    if (intent.filters.dateRange.type === 'today') {
      parts.push('today');
    } else if (intent.filters.dateRange.type === 'tomorrow') {
      parts.push('tomorrow');
    }

    // Add search context
    if (totalSearched > matches.length) {
      parts.push(`(searched ${totalSearched} fixtures)`);
    }

    return parts.join(' ') + '.';
  }

  private buildNoResultsSummary(intent: ClassifiedIntent): string {
    const parts: string[] = ['No matches found'];

    if (intent.filters.countries.length > 0) {
      parts.push(`from ${intent.filters.countries.join(', ')}`);
    }

    if (intent.filters.confidenceThreshold !== 'any') {
      parts.push(`with ${intent.filters.confidenceThreshold} confidence`);
    }

    if (intent.filters.dateRange.type === 'today') {
      parts.push('today');
    } else if (intent.filters.dateRange.type === 'tomorrow') {
      parts.push('tomorrow');
    }

    return parts.join(' ') + '. Try broadening your search criteria.';
  }

  private generateNoResultsSuggestions(
    intent: ClassifiedIntent,
    availableCountries: string[],
  ): string[] {
    const suggestions: string[] = [];

    // Suggest removing country filter
    if (intent.filters.countries.length > 0) {
      suggestions.push(
        `Try searching without country filter: "${this.getPredictionTypeQuery(intent.predictionType)}"`,
      );
    }

    // Suggest lowering confidence threshold
    if (intent.filters.confidenceThreshold !== 'any') {
      suggestions.push(
        `Try lowering confidence: "${this.getPredictionTypeQuery(intent.predictionType)} from ${intent.filters.countries[0] || 'any country'}"`,
      );
    }

    // Suggest expanding date range
    if (intent.filters.dateRange.type !== 'next_3_days') {
      suggestions.push(
        `Try expanding date range: "${this.getPredictionTypeQuery(intent.predictionType)} this week"`,
      );
    }

    // Show available countries
    if (availableCountries.length > 0) {
      suggestions.push(
        `Available countries: ${availableCountries.slice(0, 5).join(', ')}`,
      );
    }

    return suggestions.slice(0, 4);
  }

  private generateContextualSuggestions(
    intent: ClassifiedIntent,
    matchCount: number,
  ): string[] {
    const suggestions: string[] = [];

    // If they searched for one type, suggest related types
    if (intent.predictionType === 'over_2_5_goals' && matchCount > 0) {
      suggestions.push(
        `Also try: "BTTS from ${intent.filters.countries[0] || 'any country'}"`,
      );
    }

    if (intent.predictionType === 'btts' && matchCount > 0) {
      suggestions.push(
        `Also try: "Over 2.5 goals from ${intent.filters.countries[0] || 'any country'}"`,
      );
    }

    // If they got few results, suggest broadening
    if (matchCount < 3 && matchCount > 0) {
      if (intent.filters.confidenceThreshold !== 'any') {
        suggestions.push('Try removing the confidence filter for more results');
      }
    }

    return suggestions;
  }

  private getPredictionTypeQuery(type: NaturalQueryPredictionType): string {
    const queries: Record<NaturalQueryPredictionType, string> = {
      over_1_5_goals: 'Over 1.5 goals',
      over_2_5_goals: 'Over 2.5 goals',
      btts: 'BTTS',
      result: 'Match results',
      home_win: 'Home wins',
      away_win: 'Away wins',
      draw: 'Draws',
      high_scoring: 'High-scoring matches',
      any: 'All predictions',
    };
    return queries[type];
  }

  private getQuerySuggestions(): string[] {
    return [
      'BTTS from England',
      'Over 2.5 goals from Spain',
      'Confident predictions from Germany',
      'Top 5 high-scoring matches',
      'Home wins from Italy today',
    ];
  }
}
