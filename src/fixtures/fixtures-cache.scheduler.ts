import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FixturesService } from './fixtures.service';

@Injectable()
export class FixturesCacheScheduler {
  private readonly logger = new Logger(FixturesCacheScheduler.name);

  constructor(private readonly fixturesService: FixturesService) {}

  @Cron('38 16 * * *')
  async refreshTodayFixturesCache(): Promise<void> {
    this.logger.log(
      'Running cron job to refresh today fixtures cache in Redis.',
    );
    try {
      await this.fixturesService.getTodayFixturesForRedis();
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
