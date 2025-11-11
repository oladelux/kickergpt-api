import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import apiFootballConfig from './config/api-football.config';
import { FixturesController } from './fixtures.controller';
import { FixturesService } from './fixtures.service';
import { FixturesAnalysisController } from './fixtures-analysis.controller';
import { FixturesAnalysisService } from './fixtures-analysis.service';
import { OpenAiModule } from '../openai/openai.module';
import { FixtureChatEntity } from './infrastructure/persistence/relational/entities/fixture-chat.entity';
import { FixtureChatsService } from './fixture-chats.service';
import { FixtureChatsController } from './fixture-chats.controller';
import { PromptUsageModule } from '../prompt-usage/prompt-usage.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule.forFeature(apiFootballConfig),
    TypeOrmModule.forFeature([FixtureChatEntity]),
    OpenAiModule,
    PromptUsageModule,
    SubscriptionsModule,
    CacheModule.register({
      ttl: 86_400,
    }),
  ],
  controllers: [
    FixturesController,
    FixturesAnalysisController,
    FixtureChatsController,
  ],
  providers: [FixturesService, FixturesAnalysisService, FixtureChatsService],
})
export class FixturesModule {}
