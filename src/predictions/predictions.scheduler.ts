import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PredictionsService } from './predictions.service';
import { AllConfigType } from '../config/config.type';

/**
 * Scheduler for generating daily predictions.
 * Runs at 00:00 every day to generate predictions for today's fixtures.
 */
@Injectable()
export class PredictionsScheduler {
  private readonly logger = new Logger(PredictionsScheduler.name);

  constructor(
    private readonly predictionsService: PredictionsService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  /**
   * Generate predictions daily at 00:00 UTC.
   * Cron: minute hour day-of-month month day-of-week
   * "0 0 * * *" = At 00:00 every day
   */
  @Cron('0 0 * * *')
  async generateDailyPredictions(): Promise<void> {
    // Skip in development mode to avoid unnecessary processing
    if (
      this.configService.get('app.nodeEnv', { infer: true }) === 'development'
    ) {
      this.logger.log('Skipping predictions generation in development mode.');
      return;
    }

    this.logger.log('Starting daily predictions generation...');

    const startTime = Date.now();

    try {
      const result =
        await this.predictionsService.generateAndCachePredictions();

      const duration = Date.now() - startTime;

      this.logger.log(
        `Daily predictions generated successfully: ${result.predictions.length} predictions from ${result.totalFixturesAnalyzed} fixtures in ${duration}ms`,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Failed to generate daily predictions after ${duration}ms`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Manual trigger for generating predictions.
   * Useful for testing or forcing a refresh.
   */
  async triggerPredictionsGeneration(): Promise<{
    predictions: number;
    fixturesAnalyzed: number;
    duration: number;
  }> {
    this.logger.log('Manual predictions generation triggered...');

    const startTime = Date.now();
    const result = await this.predictionsService.generateAndCachePredictions();
    const duration = Date.now() - startTime;

    return {
      predictions: result.predictions.length,
      fixturesAnalyzed: result.totalFixturesAnalyzed,
      duration,
    };
  }
}
