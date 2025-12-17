import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailerModule } from '../mailer/mailer.module';
import { BulkUserEmailScheduler } from './schedulers/bulk-user-email.scheduler';
import { ExhaustedUsersEmailScheduler } from './schedulers/exhausted-users-email.scheduler';
import { UserEntity } from '../users/infrastructure/persistence/relational/entities/user.entity';
import { SubscriptionEntity } from '../subscriptions/infrastructure/persistence/relational/entities/subscription.entity';
import { PromptUsageEntity } from '../prompt-usage/infrastructure/persistence/relational/entities/prompt-usage.entity';

@Module({
  imports: [
    ConfigModule,
    MailerModule,
    TypeOrmModule.forFeature([
      UserEntity,
      SubscriptionEntity,
      PromptUsageEntity,
    ]),
  ],
  providers: [MailService, BulkUserEmailScheduler, ExhaustedUsersEmailScheduler],
  exports: [MailService],
})
export class MailModule {}
