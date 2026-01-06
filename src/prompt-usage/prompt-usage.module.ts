import { Module } from '@nestjs/common';
import { RelationalPromptUsagePersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { PromptUsageService } from './prompt-usage.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [RelationalPromptUsagePersistenceModule, UsersModule],
  providers: [PromptUsageService],
  exports: [PromptUsageService],
})
export class PromptUsageModule {}
