import { Module } from '@nestjs/common';
import { StrategiesController } from './strategies.controller';
import { StrategiesService } from './strategies.service';
import { ConditionEvaluatorService } from './condition-evaluator.service';
import { RelationalStrategyPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { RedisModule } from '../redis/redis.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    RelationalStrategyPersistenceModule,
    RedisModule,
    SubscriptionsModule,
  ],
  controllers: [StrategiesController],
  providers: [StrategiesService, ConditionEvaluatorService],
  exports: [StrategiesService],
})
export class StrategiesModule {}
