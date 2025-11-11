import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromptUsageEntity } from './entities/prompt-usage.entity';
import { PromptUsageRepository } from '../prompt-usage.repository';
import { PromptUsageRelationalRepository } from './repositories/prompt-usage.repository';

@Module({
  imports: [TypeOrmModule.forFeature([PromptUsageEntity])],
  providers: [
    {
      provide: PromptUsageRepository,
      useClass: PromptUsageRelationalRepository,
    },
  ],
  exports: [PromptUsageRepository],
})
export class RelationalPromptUsagePersistenceModule {}
