import { Module } from '@nestjs/common';
import { RelationalPromptUsagePersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { PromptUsageService } from './prompt-usage.service';

@Module({
  imports: [RelationalPromptUsagePersistenceModule],
  providers: [PromptUsageService],
  exports: [PromptUsageService],
})
export class PromptUsageModule {}
