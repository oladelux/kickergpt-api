import { Injectable, Logger } from '@nestjs/common';
import { IntentClassifierService } from './intent-classifier.service';
import { FixtureFilterService } from './fixture-filter.service';
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

@Injectable()
export class NaturalQueryService {
  private readonly logger = new Logger(NaturalQueryService.name);

  constructor(
    private readonly intentClassifier: IntentClassifierService,
    private readonly fixtureFilter: FixtureFilterService,
  ) {}

  /**
   * Process a natural language query and return matching fixtures with predictions.
   */
  async queryMatches(
    query: string,
    userId: string,
  ): Promise<NaturalQueryResponse> {
    const startTime = Date.now();
    this.logger.log(`Processing query for user ${userId}: "${query}"`);

    // Step 1: Classify intent
    const intent = await this.intentClassifier.classifyIntent(query);

    // Handle ambiguous queries
    if (intent.isAmbiguous) {
      return {
        success: false,
        matches: [],
        clarificationNeeded: intent.clarificationNeeded ?? undefined,
        suggestions: this.getQuerySuggestions(),
        metadata: {
          query,
          intent,
          fixturesSearched: 0,
          matchesFound: 0,
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    // Step 2: Get filtered fixtures
    const fixtures = await this.fixtureFilter.getFilteredFixtures(intent);

    if (fixtures.length === 0) {
      const availableCountries =
        await this.fixtureFilter.getAvailableCountries();
      return {
        success: true,
        matches: [],
        summary: 'No matches found matching your criteria.',
        suggestions: [
          `Try searching without country filter`,
          `Available countries: ${availableCountries.slice(0, 5).join(', ')}`,
        ],
        metadata: {
          query,
          intent,
          fixturesSearched: 0,
          matchesFound: 0,
          executionTimeMs: Date.now() - startTime,
        },
      };
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

    // Build summary
    const summary = this.buildSummary(limitedMatches, intent, fixtures.length);

    return {
      success: true,
      matches: limitedMatches,
      summary,
      metadata: {
        query,
        intent,
        fixturesSearched: fixtures.length,
        matchesFound: limitedMatches.length,
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
        // For "any" type, return over 2.5 as default high-value prediction
        return this.analyzeGoalPrediction(fixture, 2.5);
    }
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

    // Weight factors
    const probability =
      homeOverRate * 0.35 +
      awayOverRate * 0.35 +
      h2hOverRate * 0.2 +
      (expectedGoals > threshold ? 0.1 : 0);

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
   * Returns probability of that specific outcome.
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
      0.05; // Home advantage
    const awayProb =
      (oddsResult?.away ?? 0.33) * 0.4 + awayForm * 0.3 + h2hResult.away * 0.2;
    const drawProb = 1 - homeProb - awayProb;

    // Normalize
    const total = homeProb + awayProb + Math.max(0.1, drawProb);
    const normalizedHome = (homeProb / total) * 100;
    const normalizedAway = (awayProb / total) * 100;
    const normalizedDraw = (Math.max(0.1, drawProb) / total) * 100;

    // Get the probability for the target outcome
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
    if (!matches || matches.length === 0) return 0.5;

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

    return validMatches > 0 ? overCount / validMatches : 0.5;
  }

  private calculateH2HOverRate(
    h2h: KickerGPTMatchSummary[],
    threshold: number,
  ): number {
    if (!h2h || h2h.length === 0) return 0.5;

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

    return validMatches > 0 ? overCount / validMatches : 0.5;
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
    if (!matches || matches.length === 0) return 0.5;

    const recentMatches = matches.slice(0, 5);
    let bttsCount = 0;
    let validMatches = 0;

    for (const match of recentMatches) {
      // Only consider matches where this team participated
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

    return validMatches > 0 ? bttsCount / validMatches : 0.5;
  }

  private calculateH2HBTTSRate(h2h: KickerGPTMatchSummary[]): number {
    if (!h2h || h2h.length === 0) return 0.5;

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

    return validMatches > 0 ? bttsCount / validMatches : 0.5;
  }

  private calculateScoringRate(
    matches: KickerGPTMatchSummary[],
    teamId: number,
  ): number {
    if (!matches || matches.length === 0) return 0.5;

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

    return validMatches > 0 ? scoredCount / validMatches : 0.5;
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
    if (!matches || matches.length === 0) return 0.5;

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

    if (matchesAnalyzed === 0) return 0.5;

    const maxPoints = 3 * matchesAnalyzed;
    return points / maxPoints;
  }

  private calculateH2HResult(
    h2h: KickerGPTMatchSummary[],
    homeTeamId: number,
  ): { home: number; away: number } {
    if (!h2h || h2h.length === 0) {
      return { home: 0.5, away: 0.5 };
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
    if (totalMatches === 0) return { home: 0.5, away: 0.5 };

    const homeScore = homeWins + draws * 0.5;
    const awayScore = awayWins + draws * 0.5;
    const total = homeScore + awayScore;

    if (total === 0) return { home: 0.5, away: 0.5 };

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

    // Common factors
    const homeMatches = fixture.homeTeamRecentMatches ?? [];
    const awayMatches = fixture.awayTeamRecentMatches ?? [];
    const h2h = fixture.h2h ?? [];

    if (
      predictionType === 'btts' ||
      predictionType === 'over_1_5_goals' ||
      predictionType === 'over_2_5_goals' ||
      predictionType === 'any'
    ) {
      // Goal-related factors
      const homeStats = this.calculateTeamGoalStats(
        homeMatches,
        fixture.teams.home.id,
      );
      const awayStats = this.calculateTeamGoalStats(
        awayMatches,
        fixture.teams.away.id,
      );

      factors.push({
        name: 'Team Goal Averages',
        description: `${fixture.teams.home.name}: ${homeStats.avgScored.toFixed(1)} scored, ${homeStats.avgConceded.toFixed(1)} conceded. ${fixture.teams.away.name}: ${awayStats.avgScored.toFixed(1)} scored, ${awayStats.avgConceded.toFixed(1)} conceded.`,
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
          name: 'H2H History',
          description: `${h2h.length} previous meetings, averaging ${avgH2HGoals.toFixed(1)} goals per match.`,
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
        name: 'BTTS Rates',
        description: `${fixture.teams.home.name}: ${Math.round(homeBTTS * 100)}% BTTS in last 5. ${fixture.teams.away.name}: ${Math.round(awayBTTS * 100)}% BTTS in last 5.`,
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
      // Form factor
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
        description: `${fixture.teams.home.name}: ${Math.round(homeForm * 100)}% points won. ${fixture.teams.away.name}: ${Math.round(awayForm * 100)}% points won.`,
        impact: homeForm > awayForm ? 'home' : 'away',
        weight: 0.3,
      });

      // Odds factor
      if (fixture.homeOdd && fixture.awayOdd) {
        factors.push({
          name: 'Bookmaker Odds',
          description: `${fixture.teams.home.name}: ${fixture.homeOdd}, ${fixture.teams.away.name}: ${fixture.awayOdd}`,
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
          // Higher probability for goal predictions means more goals expected
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
      return 'No matches found matching your criteria.';
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
      any: 'all predictions',
    };

    const countries =
      intent.filters.countries.length > 0
        ? ` from ${intent.filters.countries.join(', ')}`
        : '';

    const confidenceLabel =
      intent.filters.confidenceThreshold !== 'any'
        ? ` with ${intent.filters.confidenceThreshold} confidence`
        : '';

    return `Found ${matches.length} matches${countries} for ${predictionTypeLabels[intent.predictionType]}${confidenceLabel}. Searched ${totalSearched} total fixtures.`;
  }

  private getQuerySuggestions(): string[] {
    return [
      'Over 1.5 goals from England',
      'BTTS predictions from La Liga',
      'High-confidence over 2.5 predictions',
      'Top 5 confident result predictions',
      'Matches from Germany tomorrow',
    ];
  }
}
