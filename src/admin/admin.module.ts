import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { UserEntity } from '../users/infrastructure/persistence/relational/entities/user.entity';
import { FixtureChatEntity } from '../fixtures/infrastructure/persistence/relational/entities/fixture-chat.entity';
import { PromptUsageEntity } from '../prompt-usage/infrastructure/persistence/relational/entities/prompt-usage.entity';
import { SubscriptionEntity } from '../subscriptions/infrastructure/persistence/relational/entities/subscription.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      FixtureChatEntity,
      PromptUsageEntity,
      SubscriptionEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminMetricsService, AdminApiKeyGuard],
})
export class AdminModule {}
