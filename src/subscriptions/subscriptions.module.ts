import { Module, forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StripeModule } from '../stripe/stripe.module';
import { PaystackModule } from '../paystack/paystack.module';
import { RelationalSubscriptionPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PromptUsageModule } from '../prompt-usage/prompt-usage.module';

@Module({
  imports: [
    RelationalSubscriptionPersistenceModule,
    UsersModule,
    forwardRef(() => StripeModule),
    PaystackModule,
    PromptUsageModule,
  ],
  controllers: [SubscriptionsController, StripeWebhookController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService, RelationalSubscriptionPersistenceModule],
})
export class SubscriptionsModule {}
