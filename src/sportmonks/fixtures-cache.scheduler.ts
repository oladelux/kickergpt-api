import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SportmonksService } from './sportmonks.service';
import { AllConfigType } from '../config/config.type';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class FixturesCacheScheduler {
  private readonly logger = new Logger(FixturesCacheScheduler.name);

  constructor(
    private readonly sportmonksService: SportmonksService,
    private readonly configService: ConfigService<AllConfigType>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  @Cron('0 0,6,12,18 * * *')
  async refreshTodayFixturesCache(): Promise<void> {
    if (
      this.configService.get('app.nodeEnv', { infer: true }) === 'development'
    ) {
      this.logger.log(
        'Skipping cron job to refresh today fixtures cache in Redis in development mode.',
      );
      return;
    }

    this.logger.log(
      'Running cron job to refresh today fixtures cache in Redis.',
    );
    try {
      await this.sportmonksService.getTodayFixturesForRedis();
      this.logger.log('Refreshed today fixtures cache in Redis.');
    } catch (error) {
      this.logger.error(
        'Failed to refresh fixtures cache.',
        error instanceof HttpException
          ? JSON.stringify(error.getResponse())
          : error.stack,
      );
    }
  }

  /**
   * Warms the cache for the three-day fixtures endpoint
   * Runs every 30 minutes to ensure data is always cached
   */
  @Cron('*/30 * * * *')
  async warmThreeDaysFixturesCache(): Promise<void> {
    this.logger.log('Running cache warmer for three-day fixtures...');

    const startTime = Date.now();

    try {
      // Pre-fetch the data using the optimized method
      const result =
        await this.sportmonksService.getThreeDaysFixturesOptimized();

      const duration = Date.now() - startTime;

      this.logger.log(
        `Cache warming completed: Fetched ${result.data.length} fixtures in ${duration}ms`,
      );

      // Manually cache the result with the same key the controller would use
      // The key format used by CacheInterceptor is typically: /v1/matches/three-days
      const cacheKey = '/v1/matches/three-days';
      await this.cacheManager.set(cacheKey, result, 14_400_000); // 4 hours in milliseconds

      this.logger.log(
        `Successfully cached three-day fixtures with key: ${cacheKey}`,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Failed to warm three-day fixtures cache after ${duration}ms`,
        error instanceof HttpException
          ? JSON.stringify(error.getResponse())
          : error.stack,
      );
    }
  }
}
