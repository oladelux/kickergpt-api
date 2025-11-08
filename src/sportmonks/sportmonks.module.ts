import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import sportmonksConfig from './config/sportmonks.config';
import { SportmonksController } from './sportmonks.controller';
import { SportmonksService } from './sportmonks.service';

@Module({
  imports: [ConfigModule.forFeature(sportmonksConfig)],
  controllers: [SportmonksController],
  providers: [SportmonksService],
  exports: [SportmonksService],
})
export class SportmonksModule {}
