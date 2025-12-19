import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SportmonksService } from './sportmonks.service';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class FixturesCacheScheduler {
  private readonly logger = new Logger(FixturesCacheScheduler.name);

  constructor(
    private readonly sportmonksService: SportmonksService,
    private readonly configService: ConfigService<AllConfigType>,
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
}
