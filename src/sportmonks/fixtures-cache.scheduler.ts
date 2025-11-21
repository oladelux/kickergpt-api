import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SportmonksService } from './sportmonks.service';

@Injectable()
export class FixturesCacheScheduler {
  private readonly logger = new Logger(FixturesCacheScheduler.name);

  constructor(private readonly sportmonksService: SportmonksService) {}

  @Cron('0 0,6,12,18 * * *')
  async refreshTodayFixturesCache(): Promise<void> {
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
