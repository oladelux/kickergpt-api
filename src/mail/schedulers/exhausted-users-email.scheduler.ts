import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail.service';
import { UserEntity } from '../../users/infrastructure/persistence/relational/entities/user.entity';
import { SubscriptionEntity } from '../../subscriptions/infrastructure/persistence/relational/entities/subscription.entity';
import { PromptUsageEntity } from '../../prompt-usage/infrastructure/persistence/relational/entities/prompt-usage.entity';
import { SubscriptionPlan } from '../../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../../subscriptions/domain/subscription-status.enum';
import { StatusEnum } from '../../statuses/statuses.enum';

@Injectable()
export class ExhaustedUsersEmailScheduler {
  private readonly logger = new Logger(ExhaustedUsersEmailScheduler.name);
  private readonly batchSize = 100;
  private readonly delayPerEmailMs = 600; // avoid rate limits
  private readonly delayBetweenBatchesMs = 1000;

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
    @InjectRepository(PromptUsageEntity)
    private readonly promptUsageRepository: Repository<PromptUsageEntity>,
    private readonly mailService: MailService,
  ) {}

  @Cron('30 14 * * *')
  async sendExhaustedUsersEmail(): Promise<void> {
    this.logger.log('Exhausted users email cron is disabled.');
    return;

    this.logger.log('Starting exhausted users email job...');
    let offset = 0;
    let totalSent = 0;
    let totalFailed = 0;

    while (true) {
      // Query for users who:
      // 1. Have active status (verified)
      // 2. Have FREE plan
      // 3. Have ACTIVE subscription status
      // 4. Have used >= 10 prompts
      // 5. Have no addon credits
      const queryBuilder = this.usersRepository
        .createQueryBuilder('user')
        .innerJoin('user.status', 'status')
        .innerJoin(
          SubscriptionEntity,
          'subscription',
          'subscription.userId = user.id',
        )
        .innerJoin(
          PromptUsageEntity,
          'promptUsage',
          'promptUsage.userId = user.id',
        )
        .where('status.name = :statusName', { statusName: StatusEnum.active })
        .andWhere('subscription.plan = :plan', { plan: SubscriptionPlan.FREE })
        .andWhere('subscription.status = :status', {
          status: SubscriptionStatus.ACTIVE,
        })
        .andWhere('promptUsage.promptsUsed = :minPrompts', { minPrompts: 10 })
        .andWhere('promptUsage.addonCredits = :addonCredits', {
          addonCredits: 0,
        })
        .select([
          'user.id',
          'user.email',
          'user.firstName',
          'user.lastName',
          'user.createdAt',
        ])
        .orderBy('user.createdAt', 'ASC')
        .skip(offset)
        .take(this.batchSize);

      const users = await queryBuilder.getMany();

      if (users.length === 0) {
        break;
      }

      this.logger.debug(
        `Processing batch with ${users.length} user(s) (offset ${offset})`,
      );

      for (let i = 0; i < users.length; i += 1) {
        const user = users[i];
        if (!user.email) {
          continue;
        }

        const name = user.firstName?.trim() || user.lastName?.trim() || 'there';

        try {
          await this.mailService.sendExhaustedPromptsEmail({
            to: user.email as string,
            name,
          });
          totalSent += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          totalFailed += 1;
          this.logger.warn(
            `Failed to send exhausted prompts email to ${user.email}: ${message}`,
          );
        }

        const hasMoreInBatch = i < users.length - 1;
        if (hasMoreInBatch && this.delayPerEmailMs > 0) {
          await this.delay(this.delayPerEmailMs);
        }
      }

      offset += users.length;

      const moreToProcess = users.length === this.batchSize;
      if (moreToProcess && this.delayBetweenBatchesMs > 0) {
        await this.delay(this.delayBetweenBatchesMs);
      }

      if (!moreToProcess) {
        break;
      }
    }

    this.logger.log(
      `Exhausted users email job completed. Sent: ${totalSent}, Failed: ${totalFailed}`,
    );
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
