import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobilePurchasesController } from './mobile-purchases.controller';
import { MobilePurchasesService } from './mobile-purchases.service';
import { PromptUsageModule } from '../prompt-usage/prompt-usage.module';
import { MobilePurchaseEntity } from './infrastructure/persistence/relational/entities/mobile-purchase.entity';
import { MobilePurchaseRepository } from './infrastructure/persistence/relational/repositories/mobile-purchase.repository';
import googlePlayConfig from './config/google-play.config';

@Module({
  imports: [
    ConfigModule.forFeature(googlePlayConfig),
    TypeOrmModule.forFeature([MobilePurchaseEntity]),
    PromptUsageModule,
  ],
  controllers: [MobilePurchasesController],
  providers: [MobilePurchasesService, MobilePurchaseRepository],
  exports: [MobilePurchasesService],
})
export class MobilePurchasesModule {}

