import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';
import { PredictionsScheduler } from './predictions.scheduler';
import { RedisModule } from '../redis/redis.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [ConfigModule, RedisModule, SubscriptionsModule],
  controllers: [PredictionsController],
  providers: [PredictionsService, PredictionsScheduler],
  exports: [PredictionsService],
})
export class PredictionsModule {}

