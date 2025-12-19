import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RevenueCatEventRepository } from '../revenuecat-event.repository';
import { RevenueCatEventEntity } from './entities/revenuecat-event.entity';
import { RevenueCatEventRelationalRepository } from './repositories/revenuecat-event.repository';

@Module({
  imports: [TypeOrmModule.forFeature([RevenueCatEventEntity])],
  providers: [
    {
      provide: RevenueCatEventRepository,
      useClass: RevenueCatEventRelationalRepository,
    },
  ],
  exports: [RevenueCatEventRepository, TypeOrmModule],
})
export class RelationalRevenueCatPersistenceModule {}

