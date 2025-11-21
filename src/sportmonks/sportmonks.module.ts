import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import sportmonksConfig from './config/sportmonks.config';
import { SportmonksController } from './sportmonks.controller';
import { SportmonksService } from './sportmonks.service';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisModule } from '../redis/redis.module';
import { FixturesCacheScheduler } from './fixtures-cache.scheduler';

@Module({
  imports: [
    ConfigModule.forFeature(sportmonksConfig),
    CacheModule.register({
      ttl: 86_400,
    }),
    RedisModule,
  ],
  controllers: [SportmonksController],
  providers: [SportmonksService, FixturesCacheScheduler],
  exports: [SportmonksService],
})
export class SportmonksModule {}
