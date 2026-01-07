import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminService } from './admin.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { UserEntity } from '../users/infrastructure/persistence/relational/entities/user.entity';
import { FixtureChatEntity } from '../fixtures/infrastructure/persistence/relational/entities/fixture-chat.entity';
import { PromptUsageEntity } from '../prompt-usage/infrastructure/persistence/relational/entities/prompt-usage.entity';
import { SubscriptionEntity } from '../subscriptions/infrastructure/persistence/relational/entities/subscription.entity';
import { StrategyEntity } from '../strategies/infrastructure/persistence/relational/entities/strategy.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      UserEntity,
      FixtureChatEntity,
      PromptUsageEntity,
      SubscriptionEntity,
      StrategyEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminMetricsService, AdminService, AdminApiKeyGuard],
})
export class AdminModule {}
