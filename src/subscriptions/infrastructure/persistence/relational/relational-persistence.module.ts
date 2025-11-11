import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionRepository } from '../subscription.repository';
import { SubscriptionEntity } from './entities/subscription.entity';
import { SubscriptionRelationalRepository } from './repositories/subscription.repository';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionEntity])],
  providers: [
    {
      provide: SubscriptionRepository,
      useClass: SubscriptionRelationalRepository,
    },
  ],
  exports: [SubscriptionRepository],
})
export class RelationalSubscriptionPersistenceModule {}
