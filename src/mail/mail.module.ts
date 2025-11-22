import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailerModule } from '../mailer/mailer.module';
import { BulkUserEmailScheduler } from './schedulers/bulk-user-email.scheduler';
import { UserEntity } from '../users/infrastructure/persistence/relational/entities/user.entity';

@Module({
  imports: [ConfigModule, MailerModule, TypeOrmModule.forFeature([UserEntity])],
  providers: [MailService, BulkUserEmailScheduler],
  exports: [MailService],
})
export class MailModule {}
