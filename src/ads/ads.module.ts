import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';
import { PromptUsageModule } from '../prompt-usage/prompt-usage.module';
import adsConfig from './config/ads.config';

@Module({
  imports: [ConfigModule.forFeature(adsConfig), PromptUsageModule],
  controllers: [AdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}

