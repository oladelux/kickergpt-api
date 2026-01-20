import { Module } from '@nestjs/common';
import { NaturalQueryController } from './natural-query.controller';
import { NaturalQueryService } from './natural-query.service';
import { IntentClassifierService } from './intent-classifier.service';
import { FixtureFilterService } from './fixture-filter.service';
import { OpenAiModule } from '../openai/openai.module';
import { RedisModule } from '../redis/redis.module';
import { QueryPreprocessorService } from './query-preprocessor.service';

@Module({
  imports: [OpenAiModule, RedisModule],
  controllers: [NaturalQueryController],
  providers: [
    NaturalQueryService,
    IntentClassifierService,
    FixtureFilterService,
    QueryPreprocessorService,
  ],
  exports: [NaturalQueryService],
})
export class NaturalQueryModule {}
