import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import apiFootballConfig from './config/api-football.config';
import { FixturesController } from './fixtures.controller';
import { FixturesService } from './fixtures.service';
import { FixturesAnalysisController } from '../analysis/analysis.controller';
import { FixturesAnalysisService } from '../analysis/analysis.service';
import { OpenAiModule } from '../openai/openai.module';
import { FixtureChatEntity } from './infrastructure/persistence/relational/entities/fixture-chat.entity';
import { FixtureChatsService } from '../fixture-chats/fixture-chats.service';
import { FixtureChatsController } from '../fixture-chats/fixture-chats.controller';
import { PromptUsageModule } from '../prompt-usage/prompt-usage.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { RedisModule } from '../redis/redis.module';
import { SportmonksService } from '../sportmonks/sportmonks.service';

@Module({
  imports: [
    ConfigModule.forFeature(apiFootballConfig),
    TypeOrmModule.forFeature([FixtureChatEntity]),
    OpenAiModule,
    PromptUsageModule,
    SubscriptionsModule,
    RedisModule,
    CacheModule.register({
      ttl: 86_400,
    }),
  ],
  controllers: [
    FixturesController,
    FixturesAnalysisController,
    FixtureChatsController,
  ],
  providers: [
    FixturesService,
    FixturesAnalysisService,
    FixtureChatsService,
    SportmonksService,
  ],
})
export class FixturesModule {}
