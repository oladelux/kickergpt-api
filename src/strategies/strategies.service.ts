import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { StrategyRepository } from './infrastructure/persistence/strategy.repository';
import { Strategy } from './domain/strategy';
import { StrategyCondition } from './domain/strategy-condition';
import { ConditionEvaluatorService } from './condition-evaluator.service';
import { RedisService } from '../redis/redis.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';
import { KickerGPTFixturesResponse } from '../fixtures/types/fixtures-response.type';

export interface StrategyMatchResult {
  strategyId: string;
  strategyName: string;
  fixtures: KickerGPTFixturesResponse[];
  matchedCount: number;
}

@Injectable()
export class StrategiesService {
  private readonly logger = new Logger(StrategiesService.name);

  constructor(
    private readonly strategyRepository: StrategyRepository,
    private readonly conditionEvaluator: ConditionEvaluatorService,
    private readonly redisService: RedisService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Verify user has active PRO subscription
   */
  private async verifyProSubscription(userId: string): Promise<void> {
    const subscription = await this.subscriptionsService.findByUserId(userId);

    if (
      !subscription ||
      subscription.plan !== SubscriptionPlan.PRO ||
      subscription.status !== SubscriptionStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        'Strategy feature is only available for PRO users',
      );
    }
  }

  /**
   * Create a new strategy
   */
  async create(
    userId: string,
    data: {
      name: string;
      description?: string;
      conditions: StrategyCondition[];
      isActive?: boolean;
    },
  ): Promise<Strategy> {
    await this.verifyProSubscription(userId);

    return this.strategyRepository.create({
      userId,
      name: data.name,
      description: data.description,
      conditions: data.conditions,
      isActive: data.isActive ?? true,
    });
  }

  /**
   * Get all strategies for a user
   */
  async findByUserId(userId: string): Promise<Strategy[]> {
    await this.verifyProSubscription(userId);
    return this.strategyRepository.findByUserId(userId);
  }

  /**
   * Get a single strategy by ID (must belong to user)
   */
  async findById(id: string, userId: string): Promise<Strategy> {
    await this.verifyProSubscription(userId);

    const strategy = await this.strategyRepository.findByIdAndUserId(
      id,
      userId,
    );

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    return strategy;
  }

  /**
   * Update a strategy
   */
  async update(
    id: string,
    userId: string,
    data: Partial<{
      name: string;
      description: string;
      conditions: StrategyCondition[];
      isActive: boolean;
    }>,
  ): Promise<Strategy> {
    await this.verifyProSubscription(userId);

    const existing = await this.strategyRepository.findByIdAndUserId(
      id,
      userId,
    );

    if (!existing) {
      throw new NotFoundException('Strategy not found');
    }

    return this.strategyRepository.update(id, data);
  }

  /**
   * Delete a strategy
   */
  async delete(id: string, userId: string): Promise<void> {
    await this.verifyProSubscription(userId);

    const existing = await this.strategyRepository.findByIdAndUserId(
      id,
      userId,
    );

    if (!existing) {
      throw new NotFoundException('Strategy not found');
    }

    await this.strategyRepository.delete(id);
  }

  /**
   * Find matches that fit a strategy by evaluating fixtures from Redis
   */
  async findMatchingFixtures(
    strategyId: string,
    userId: string,
  ): Promise<StrategyMatchResult> {
    await this.verifyProSubscription(userId);

    const strategy = await this.strategyRepository.findByIdAndUserId(
      strategyId,
      userId,
    );

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    return this.evaluateStrategyAgainstFixtures(strategy);
  }

  /**
   * Evaluate a strategy against all fixtures in Redis
   * Only evaluates fixtures that haven't been played yet
   */
  private async evaluateStrategyAgainstFixtures(
    strategy: Strategy,
  ): Promise<StrategyMatchResult> {
    const allFixtures = await this.getFixturesFromRedis();

    if (allFixtures.length === 0) {
      this.logger.warn('No fixtures found in Redis cache');
      return {
        strategyId: strategy.id,
        strategyName: strategy.name,
        fixtures: [],
        matchedCount: 0,
      };
    }

    // Filter out fixtures that have already been played
    const upcomingFixtures = allFixtures.filter((fixture) =>
      this.isUpcomingFixture(fixture),
    );

    this.logger.log(
      `Found ${upcomingFixtures.length} upcoming fixtures out of ${allFixtures.length} total`,
    );

    const matchingFixtures: KickerGPTFixturesResponse[] = [];

    for (const fixture of upcomingFixtures) {
      const { allPassed } = this.conditionEvaluator.evaluateConditions(
        strategy.conditions,
        fixture,
      );

      if (allPassed) {
        matchingFixtures.push(fixture);
      }
    }

    this.logger.log(
      `Strategy "${strategy.name}" matched ${matchingFixtures.length} fixtures out of ${upcomingFixtures.length} upcoming`,
    );

    return {
      strategyId: strategy.id,
      strategyName: strategy.name,
      fixtures: matchingFixtures,
      matchedCount: matchingFixtures.length,
    };
  }

  /**
   * Check if a fixture hasn't been played yet
   */
  private isUpcomingFixture(fixture: KickerGPTFixturesResponse): boolean {
    // If finalScore exists, the match has been played
    if (fixture.finalScore !== null) {
      return false;
    }

    // Additional check: if timestamp is in the past, match might have started
    if (fixture.timestamp) {
      const now = Date.now();
      const fixtureTime = fixture.timestamp * 1000; // Convert to milliseconds
      // Give a 2-hour buffer for matches that might still be in progress
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;
      if (fixtureTime < twoHoursAgo) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all fixtures from Redis cache
   */
  private async getFixturesFromRedis(): Promise<KickerGPTFixturesResponse[]> {
    const today = this.getToday();
    const fixtureIdsKey = `fixtures:ids:${today}`;

    const fixtureIdsJson = await this.redisService.get<string>(fixtureIdsKey);

    if (!fixtureIdsJson) {
      this.logger.warn(`No fixture IDs found for date ${today}`);
      return [];
    }

    let fixtureIds: number[];
    try {
      fixtureIds =
        typeof fixtureIdsJson === 'string'
          ? JSON.parse(fixtureIdsJson)
          : fixtureIdsJson;
    } catch {
      this.logger.warn('Failed to parse fixture IDs from Redis');
      return [];
    }

    const fixtures: KickerGPTFixturesResponse[] = [];

    for (const fixtureId of fixtureIds) {
      const fixtureKey = `fixture:${fixtureId}`;
      const fixtureJson = await this.redisService.get<string>(fixtureKey);

      if (fixtureJson) {
        try {
          const fixture =
            typeof fixtureJson === 'string'
              ? JSON.parse(fixtureJson)
              : fixtureJson;
          fixtures.push(fixture as KickerGPTFixturesResponse);
        } catch {
          this.logger.warn(`Failed to parse fixture ${fixtureId} from Redis`);
        }
      }
    }

    return fixtures;
  }

  private getToday(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
}
