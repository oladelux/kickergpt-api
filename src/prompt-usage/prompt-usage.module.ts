import { Module, forwardRef } from '@nestjs/common';
import { RelationalPromptUsagePersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { PromptUsageService } from './prompt-usage.service';
import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    RelationalPromptUsagePersistenceModule,
    UsersModule,
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [PromptUsageService],
  exports: [PromptUsageService],
})
export class PromptUsageModule {}
