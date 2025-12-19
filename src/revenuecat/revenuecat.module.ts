import { Module } from '@nestjs/common';
import { RelationalRevenueCatPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { RevenueCatWebhookController } from './revenuecat-webhook.controller';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PromptUsageModule } from '../prompt-usage/prompt-usage.module';

@Module({
  imports: [
    RelationalRevenueCatPersistenceModule,
    SubscriptionsModule,
    PromptUsageModule,
  ],
  controllers: [RevenueCatWebhookController],
  providers: [RevenueCatWebhookService],
  exports: [RevenueCatWebhookService, RelationalRevenueCatPersistenceModule],
})
export class RevenueCatModule {}

