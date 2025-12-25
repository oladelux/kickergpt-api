import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  KickerGPTFixturesResponse,
  KickerGPTMatchSummary,
  KickerGPTInjuryPlayerFlag,
  KickerGPTNewsItemSummary,
} from '../fixtures/types/fixtures-response.type';
import {
  FixturePrediction,
  TodayPredictionsResponse,
  ProbabilityCalculation,
  buildPredictionsCacheKey,
  PREDICTIONS_CACHE_TTL_SECONDS,
  VERY_HIGH_CONFIDENCE_THRESHOLD,
  HIGH_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
  ConfidenceLevel,
  MatchResult,
} from './types/prediction.types';

/**
 * Weights for each factor in probability calculation.
 * Must sum to 1.0 when all factors are available.
 */
const WEIGHTS = {
  bookmakerOdds: 0.4,
  recentForm: 0.25,
  h2hHistory: 0.15,
  injuries: 0.1,
  newsSentiment: 0.05,
  homeAdvantage: 0.05,
} as const;

/**
 * Position weights for injury impact calculation.
 * Goalkeepers and forwards are most impactful.
 */
const POSITION_INJURY_WEIGHTS: Record<string, number> = {
  goalkeeper: 1.0,
  forward: 0.8,
  midfielder: 0.6,
  defender: 0.5,
  unknown: 0.4,
};

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get today's predictions from Redis cache.
   * Returns null if no predictions are cached.
   */
  async getTodayPredictions(): Promise<TodayPredictionsResponse | null> {
    const today = this.getToday();
    const cacheKey = buildPredictionsCacheKey(today);

    const cached = await this.redisService.get<string>(cacheKey);

    if (!cached) {
      return null;
    }

    try {
      if (typeof cached === 'object') {
        return cached as unknown as TodayPredictionsResponse;
      }
      return JSON.parse(cached) as TodayPredictionsResponse;
    } catch (error) {
      this.logger.warn(`Failed to parse predictions from cache: ${error}`);
      return null;
    }
  }

  /**
   * Generate predictions for today's fixtures and cache them in Redis.
   * This is called by the scheduler at 00:00 daily.
   */
  async generateAndCachePredictions(): Promise<TodayPredictionsResponse> {
    const today = this.getToday();
    this.logger.log(`Generating predictions for ${today}...`);

    const startTime = Date.now();

    // Get cached fixtures from Redis using the fixtures:ids:{date} and fixture:{id} pattern
    const fixtures = await this.getCachedFixturesForDate(today);

    if (!fixtures || fixtures.length === 0) {
      this.logger.log(`No fixtures found for ${today}`);
      const emptyResponse: TodayPredictionsResponse = {
        date: today,
        predictions: [],
        totalFixturesAnalyzed: 0,
        generatedAt: new Date().toISOString(),
      };

      await this.cachePredictions(today, emptyResponse);
      return emptyResponse;
    }

    this.logger.log(`Analyzing ${fixtures.length} fixtures for predictions...`);

    const predictions: FixturePrediction[] = [];

    for (const fixture of fixtures) {
      const prediction = this.analyzeFixture(fixture);

      if (prediction) {
        predictions.push(prediction);
      }
    }

    const response: TodayPredictionsResponse = {
      date: today,
      predictions,
      totalFixturesAnalyzed: fixtures.length,
      generatedAt: new Date().toISOString(),
    };

    await this.cachePredictions(today, response);

    const duration = Date.now() - startTime;
    this.logger.log(
      `Generated ${predictions.length} high-confidence predictions from ${fixtures.length} fixtures in ${duration}ms`,
    );

    return response;
  }

  /**
   * Get cached fixtures for a specific date from Redis.
   * Uses the fixtures:ids:{date} key to get fixture IDs, then fetches each fixture.
   */
  private async getCachedFixturesForDate(
    date: string,
  ): Promise<KickerGPTFixturesResponse[]> {
    // Get fixture IDs for the date
    const idsKey = `fixtures:ids:${date}`;
    const idsJson = await this.redisService.get<string>(idsKey);

    if (!idsJson) {
      this.logger.log(`No fixture IDs found in cache for ${date}`);
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

    if (!fixtureIds || fixtureIds.length === 0) {
      this.logger.log(`Empty fixture IDs array for ${date}`);
      return [];
    }

    this.logger.log(
      `Found ${fixtureIds.length} fixture IDs for ${date}, fetching fixtures...`,
    );

    // Fetch all fixtures using pipeline for efficiency
    const fixtures: KickerGPTFixturesResponse[] = [];
    const pipeline = this.redisService.pipeline();

    if (!pipeline) {
      this.logger.warn('Redis pipeline not available');
      return [];
    }

    for (const id of fixtureIds) {
      pipeline.get(`fixture:${id}`);
    }

    const results = await pipeline.exec();

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

    this.logger.log(
      `Successfully fetched ${fixtures.length} fixtures from cache`,
    );
    return fixtures;
  }

  /**
   * Analyze a single fixture and return a prediction with appropriate confidence level.
   */
  private analyzeFixture(
    fixture: KickerGPTFixturesResponse,
  ): FixturePrediction | null {
    const calculation = this.calculateProbabilities(fixture);
    const predictedResult: MatchResult =
      calculation.homeProbability > calculation.awayProbability
        ? 'home'
        : 'away';
    const probability =
      predictedResult === 'home'
        ? calculation.homeProbability
        : calculation.awayProbability;

    // Assign confidence level based on probability ranges
    let confidence: ConfidenceLevel;
    if (probability >= VERY_HIGH_CONFIDENCE_THRESHOLD) {
      confidence = 'very high';
    } else if (probability >= HIGH_CONFIDENCE_THRESHOLD) {
      confidence = 'high';
    } else if (probability >= MEDIUM_CONFIDENCE_THRESHOLD) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      fixtureId: fixture.id,
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
      startingAt: fixture.date,
      league: {
        id: fixture.league.id,
        name: fixture.league.name,
        country: fixture.league.country,
      },
      predictions: [
        {
          type: 'result',
          result: predictedResult,
          probability: Math.round(probability * 10) / 10, // Round to 1 decimal
          confidence,
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate win probabilities for a fixture using weighted factors.
   */
  private calculateProbabilities(
    fixture: KickerGPTFixturesResponse,
  ): ProbabilityCalculation {
    const factors: ProbabilityCalculation['factors'] = {
      bookmakerOdds: null,
      recentForm: null,
      h2hHistory: null,
      injuries: null,
      newsSentiment: null,
      homeAdvantage: null,
    };

    let totalWeight = 0;
    let weightedHomeSum = 0;
    let weightedAwaySum = 0;

    // 1. Bookmaker Odds (40%)
    const oddsResult = this.calculateFromOdds(fixture.homeOdd, fixture.awayOdd);
    if (oddsResult) {
      factors.bookmakerOdds = { ...oddsResult, weight: WEIGHTS.bookmakerOdds };
      weightedHomeSum += oddsResult.home * WEIGHTS.bookmakerOdds;
      weightedAwaySum += oddsResult.away * WEIGHTS.bookmakerOdds;
      totalWeight += WEIGHTS.bookmakerOdds;
    }

    // 2. Recent Form (25%)
    const formResult = this.calculateFromRecentForm(
      fixture.homeTeamRecentMatches,
      fixture.awayTeamRecentMatches,
      fixture.teams.home.id,
      fixture.teams.away.id,
    );
    if (formResult) {
      factors.recentForm = { ...formResult, weight: WEIGHTS.recentForm };
      weightedHomeSum += formResult.home * WEIGHTS.recentForm;
      weightedAwaySum += formResult.away * WEIGHTS.recentForm;
      totalWeight += WEIGHTS.recentForm;
    }

    // 3. H2H History (15%)
    const h2hResult = this.calculateFromH2H(fixture.h2h, fixture.teams.home.id);
    if (h2hResult) {
      factors.h2hHistory = { ...h2hResult, weight: WEIGHTS.h2hHistory };
      weightedHomeSum += h2hResult.home * WEIGHTS.h2hHistory;
      weightedAwaySum += h2hResult.away * WEIGHTS.h2hHistory;
      totalWeight += WEIGHTS.h2hHistory;
    }

    // 4. Injuries (10%)
    const injuriesResult = this.calculateFromInjuries(
      fixture.homeInjuries,
      fixture.awayInjuries,
    );
    if (injuriesResult) {
      factors.injuries = { ...injuriesResult, weight: WEIGHTS.injuries };
      weightedHomeSum += injuriesResult.home * WEIGHTS.injuries;
      weightedAwaySum += injuriesResult.away * WEIGHTS.injuries;
      totalWeight += WEIGHTS.injuries;
    }

    // 5. News Sentiment (5%)
    const newsResult = this.calculateFromNews(
      fixture.homeNews,
      fixture.awayNews,
    );
    if (newsResult) {
      factors.newsSentiment = { ...newsResult, weight: WEIGHTS.newsSentiment };
      weightedHomeSum += newsResult.home * WEIGHTS.newsSentiment;
      weightedAwaySum += newsResult.away * WEIGHTS.newsSentiment;
      totalWeight += WEIGHTS.newsSentiment;
    }

    // 6. Home Advantage (5%)
    const homeAdvResult = this.calculateHomeAdvantage(fixture.derby);
    factors.homeAdvantage = { ...homeAdvResult, weight: WEIGHTS.homeAdvantage };
    weightedHomeSum += homeAdvResult.home * WEIGHTS.homeAdvantage;
    weightedAwaySum += homeAdvResult.away * WEIGHTS.homeAdvantage;
    totalWeight += WEIGHTS.homeAdvantage;

    // Normalize probabilities
    let homeProbability: number;
    let awayProbability: number;
    let drawProbability: number;

    if (totalWeight > 0) {
      // Normalize to get raw probabilities
      const rawHome = weightedHomeSum / totalWeight;
      const rawAway = weightedAwaySum / totalWeight;

      // Convert to percentage and ensure they sum properly
      // Account for draw probability (typically ~25% in football)
      const drawEstimate = Math.max(0.1, 1 - rawHome - rawAway);
      const total = rawHome + rawAway + drawEstimate;

      homeProbability = (rawHome / total) * 100;
      awayProbability = (rawAway / total) * 100;
      drawProbability = (drawEstimate / total) * 100;
    } else {
      // No factors available, use neutral probabilities
      homeProbability = 33.33;
      awayProbability = 33.33;
      drawProbability = 33.34;
    }

    return {
      homeProbability,
      awayProbability,
      drawProbability,
      factors,
    };
  }

  /**
   * Calculate probability from bookmaker odds.
   * Uses implied probability: probability = 1 / odds
   */
  private calculateFromOdds(
    homeOdd: string | undefined,
    awayOdd: string | undefined,
  ): { home: number; away: number } | null {
    if (!homeOdd && !awayOdd) {
      return null;
    }

    const homeOddsValue = homeOdd ? parseFloat(homeOdd) : 0;
    const awayOddsValue = awayOdd ? parseFloat(awayOdd) : 0;

    if (
      (homeOdd && (isNaN(homeOddsValue) || homeOddsValue <= 0)) ||
      (awayOdd && (isNaN(awayOddsValue) || awayOddsValue <= 0))
    ) {
      return null;
    }

    // Convert odds to implied probability
    // For decimal odds: probability = 1 / odds
    const homeImplied = homeOddsValue > 0 ? 1 / homeOddsValue : 0.33;
    const awayImplied = awayOddsValue > 0 ? 1 / awayOddsValue : 0.33;

    // Normalize (bookmaker odds include margin, so they sum > 1)
    const total = homeImplied + awayImplied;
    if (total === 0) {
      return null;
    }

    return {
      home: homeImplied / total,
      away: awayImplied / total,
    };
  }

  /**
   * Calculate probability from recent form (last 5 matches).
   */
  private calculateFromRecentForm(
    homeMatches: KickerGPTMatchSummary[] | undefined,
    awayMatches: KickerGPTMatchSummary[] | undefined,
    homeTeamId: number,
    awayTeamId: number,
  ): { home: number; away: number } | null {
    if (
      (!homeMatches || homeMatches.length === 0) &&
      (!awayMatches || awayMatches.length === 0)
    ) {
      return null;
    }

    const homeForm = this.calculateTeamForm(homeMatches ?? [], homeTeamId);
    const awayForm = this.calculateTeamForm(awayMatches ?? [], awayTeamId);

    // If both forms are neutral, skip this factor
    if (homeForm === 0.5 && awayForm === 0.5) {
      return null;
    }

    const total = homeForm + awayForm;
    return {
      home: homeForm / total,
      away: awayForm / total,
    };
  }

  /**
   * Calculate team form score from recent matches.
   * Returns a value between 0 and 1.
   */
  private calculateTeamForm(
    matches: KickerGPTMatchSummary[],
    teamId: number,
  ): number {
    if (!matches || matches.length === 0) {
      return 0.5; // Neutral
    }

    // Take last 5 matches
    const recentMatches = matches.slice(-5);

    let points = 0;
    let matchesAnalyzed = 0;

    for (const match of recentMatches) {
      const isHome = match.teams.home.id === teamId;
      const homeGoals = match.goals.home;
      const awayGoals = match.goals.away;

      if (homeGoals === null || awayGoals === null) {
        continue;
      }

      matchesAnalyzed++;

      if (isHome) {
        if (homeGoals > awayGoals) {
          points += 3; // Win
        } else if (homeGoals === awayGoals) {
          points += 1; // Draw
        }
      } else {
        if (awayGoals > homeGoals) {
          points += 3; // Win
        } else if (awayGoals === homeGoals) {
          points += 1; // Draw
        }
      }
    }

    if (matchesAnalyzed === 0) {
      return 0.5; // Neutral
    }

    // Normalize to 0-1 (max points = 3 * matchesAnalyzed)
    const maxPoints = 3 * matchesAnalyzed;
    return points / maxPoints;
  }

  /**
   * Calculate probability from head-to-head history.
   */
  private calculateFromH2H(
    h2h: KickerGPTMatchSummary[] | undefined,
    homeTeamId: number,
  ): { home: number; away: number } | null {
    if (!h2h || h2h.length === 0) {
      return null;
    }

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;

    for (const match of h2h) {
      const homeGoals = match.goals.home;
      const awayGoals = match.goals.away;

      if (homeGoals === null || awayGoals === null) {
        continue;
      }

      // Determine which team was home in this historical match
      const currentHomeWasHome = match.teams.home.id === homeTeamId;

      if (homeGoals > awayGoals) {
        // Home team in historical match won
        if (currentHomeWasHome) {
          homeWins++;
        } else {
          awayWins++;
        }
      } else if (awayGoals > homeGoals) {
        // Away team in historical match won
        if (currentHomeWasHome) {
          awayWins++;
        } else {
          homeWins++;
        }
      } else {
        draws++;
      }
    }

    const totalMatches = homeWins + awayWins + draws;
    if (totalMatches === 0) {
      return null;
    }

    // Calculate win rate (draws count as 0.5 for each)
    const homeScore = homeWins + draws * 0.5;
    const awayScore = awayWins + draws * 0.5;
    const total = homeScore + awayScore;

    if (total === 0) {
      return null;
    }

    return {
      home: homeScore / total,
      away: awayScore / total,
    };
  }

  /**
   * Calculate probability adjustment based on injuries.
   * More injuries = lower win probability.
   */
  private calculateFromInjuries(
    homeInjuries: KickerGPTInjuryPlayerFlag[] | undefined,
    awayInjuries: KickerGPTInjuryPlayerFlag[] | undefined,
  ): { home: number; away: number } | null {
    // If both teams have no injuries, return neutral
    if (
      (!homeInjuries || homeInjuries.length === 0) &&
      (!awayInjuries || awayInjuries.length === 0)
    ) {
      return { home: 0.5, away: 0.5 };
    }

    const homeInjuryImpact = this.calculateInjuryImpact(homeInjuries ?? []);
    const awayInjuryImpact = this.calculateInjuryImpact(awayInjuries ?? []);

    // Higher impact = worse for team
    // Convert to probability advantage (team with fewer injuries has advantage)
    const homeAdvantage = 1 - homeInjuryImpact;
    const awayAdvantage = 1 - awayInjuryImpact;

    const total = homeAdvantage + awayAdvantage;
    if (total === 0) {
      return { home: 0.5, away: 0.5 };
    }

    return {
      home: homeAdvantage / total,
      away: awayAdvantage / total,
    };
  }

  /**
   * Calculate injury impact score (0-1).
   * Higher score = more negative impact on team.
   */
  private calculateInjuryImpact(injuries: KickerGPTInjuryPlayerFlag[]): number {
    if (!injuries || injuries.length === 0) {
      return 0;
    }

    let totalImpact = 0;

    for (const injury of injuries) {
      const position = (injury.position ?? 'unknown').toLowerCase();
      let weight = POSITION_INJURY_WEIGHTS['unknown'];

      for (const [key, value] of Object.entries(POSITION_INJURY_WEIGHTS)) {
        if (position.includes(key)) {
          weight = value;
          break;
        }
      }

      totalImpact += weight;
    }

    // Normalize impact (cap at 1.0)
    // Assume 5 major injuries is maximum impact
    return Math.min(totalImpact / 5, 1);
  }

  /**
   * Calculate probability adjustment based on news sentiment.
   */
  private calculateFromNews(
    homeNews: KickerGPTNewsItemSummary[] | undefined,
    awayNews: KickerGPTNewsItemSummary[] | undefined,
  ): { home: number; away: number } | null {
    if (
      (!homeNews || homeNews.length === 0) &&
      (!awayNews || awayNews.length === 0)
    ) {
      return null;
    }

    const homeSentiment = this.calculateNewsSentiment(homeNews ?? []);
    const awaySentiment = this.calculateNewsSentiment(awayNews ?? []);

    // Convert sentiment to probability advantage
    // Sentiment is -1 to 1, convert to 0-1 range
    const homeScore = (homeSentiment + 1) / 2;
    const awayScore = (awaySentiment + 1) / 2;

    const total = homeScore + awayScore;
    if (total === 0) {
      return { home: 0.5, away: 0.5 };
    }

    return {
      home: homeScore / total,
      away: awayScore / total,
    };
  }

  /**
   * Calculate news sentiment score (-1 to 1).
   */
  private calculateNewsSentiment(news: KickerGPTNewsItemSummary[]): number {
    if (!news || news.length === 0) {
      return 0; // Neutral
    }

    let sentimentSum = 0;

    for (const item of news) {
      let score = 0;

      switch (item.sentiment) {
        case 'POSITIVE':
          score = 1;
          break;
        case 'NEGATIVE':
          score = -1;
          // Amplify negative impact for certain tags
          if (item.tag === 'INJURY' || item.tag === 'MANAGER') {
            score = -1.5;
          }
          break;
        case 'NEUTRAL':
        default:
          score = 0;
          break;
      }

      sentimentSum += score;
    }

    // Normalize to -1 to 1 range
    const maxScore = news.length * 1.5; // Max possible score
    return Math.max(-1, Math.min(1, sentimentSum / maxScore));
  }

  /**
   * Calculate home advantage factor.
   */
  private calculateHomeAdvantage(isDerby: boolean): {
    home: number;
    away: number;
  } {
    // Historical home win rate is ~46% in top leagues
    // Derby matches reduce this advantage
    const homeAdvantage = isDerby ? 0.52 : 0.58;
    const awayChance = 1 - homeAdvantage;

    return {
      home: homeAdvantage,
      away: awayChance,
    };
  }

  /**
   * Cache predictions in Redis.
   */
  private async cachePredictions(
    date: string,
    predictions: TodayPredictionsResponse,
  ): Promise<void> {
    const cacheKey = buildPredictionsCacheKey(date);

    await this.redisService.set(
      cacheKey,
      JSON.stringify(predictions),
      PREDICTIONS_CACHE_TTL_SECONDS,
    );

    this.logger.log(
      `Cached predictions for ${date} with TTL ${PREDICTIONS_CACHE_TTL_SECONDS}s`,
    );
  }

  /**
   * Get today's date in YYYY-MM-DD format.
   */
  private getToday(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
}
