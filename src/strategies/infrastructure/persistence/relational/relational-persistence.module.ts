import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StrategyEntity } from './entities/strategy.entity';
import { StrategyRepository } from '../strategy.repository';
import { StrategyRelationalRepository } from './repositories/strategy.repository';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyEntity])],
  providers: [
    {
      provide: StrategyRepository,
      useClass: StrategyRelationalRepository,
    },
  ],
  exports: [StrategyRepository],
})
export class RelationalStrategyPersistenceModule {}

