import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import apiFootballConfig from './config/api-football.config';
import { FixturesController } from './fixtures.controller';
import { FixturesService } from './fixtures.service';
import { FixturesAnalysisController } from '../analysis/analysis.controller';
import { FixturesAnalysisService } from '../analysis/analysis.service';
import { ControlRoomController } from '../control-room/control-room.controller';
import { ControlRoomGuard } from '../control-room/control-room.guard';
import { OpenAiModule } from '../openai/openai.module';
import { FixtureChatEntity } from './infrastructure/persistence/relational/entities/fixture-chat.entity';
import { FixtureChatsService } from '../fixture-chats/fixture-chats.service';
import { FixtureChatsController } from '../fixture-chats/fixture-chats.controller';
import { PromptUsageModule } from '../prompt-usage/prompt-usage.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { RedisModule } from '../redis/redis.module';
import { SportmonksService } from '../sportmonks/sportmonks.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule.forFeature(apiFootballConfig),
    TypeOrmModule.forFeature([FixtureChatEntity]),
    OpenAiModule,
    PromptUsageModule,
    SubscriptionsModule,
    RedisModule,
    UsersModule,
    CacheModule.register({
      ttl: 86_400,
    }),
  ],
  controllers: [
    FixturesController,
    FixturesAnalysisController,
    ControlRoomController,
    FixtureChatsController,
  ],
  providers: [
    FixturesService,
    FixturesAnalysisService,
    FixtureChatsService,
    SportmonksService,
    ControlRoomGuard,
  ],
})
export class FixturesModule {}
