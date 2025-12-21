import { Module, forwardRef } from '@nestjs/common';
import { StripeClientService } from './stripe-client.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { RelationalSubscriptionPersistenceModule } from '../subscriptions/infrastructure/persistence/relational/relational-persistence.module';
import { UsersModule } from '../users/users.module';
import { ConfigModule } from '@nestjs/config';
@Module({
  imports: [
    RelationalSubscriptionPersistenceModule,
    forwardRef(() => SubscriptionsModule),
    UsersModule,
    ConfigModule,
  ],
  providers: [StripeClientService],
  exports: [StripeClientService],
})
export class StripeModule {}
