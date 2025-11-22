import { Injectable, Logger } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { MailService } from '../mail.service';
import { UserEntity } from '../../users/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class BulkUserEmailScheduler {
  private readonly logger = new Logger(BulkUserEmailScheduler.name);
  private readonly batchSize = 100;
  private readonly delayPerEmailMs = 600; // avoid rate limits
  private readonly delayBetweenBatchesMs = 1000;
  private readonly targetDateIso: string;
  private hasRunForTargetDate = false;

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly mailService: MailService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  @Cron('00 08 * * *', {
    name: 'bulk-user-email',
    timeZone: 'Europe/Berlin',
  })
  async sendBulkUserEmail(): Promise<void> {
    const targetDate = '2025-11-23';
    const todayBerlin = new Date()
      .toLocaleString('en-US', { timeZone: 'Europe/Berlin' })
      .slice(0, 10);

    if (todayBerlin !== targetDate) {
      return; // Not the target date yet
    }
    this.logger.log('Starting bulk user email job...');

    this.logger.log('Starting bulk user email job...');

    let offset = 0;
    let totalSent = 0;
    let totalFailed = 0;

    while (true) {
      const users = await this.usersRepository.find({
        select: ['id', 'email', 'firstName', 'lastName', 'createdAt'],
        where: {
          email: Not(IsNull()),
        },
        order: { createdAt: 'ASC' },
        skip: offset,
        take: this.batchSize,
      });

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
          await this.mailService.sendFirst300Email({
            to: user.email,
            name,
            promoCode: 'FIRST300',
            surveyLink: 'https://form.typeform.com/to/VVskOTGX',
          });
          totalSent += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          totalFailed += 1;
          this.logger.warn(
            `Failed to send bulk email to ${user.email}: ${message}`,
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
    }

    this.logger.log(
      `Bulk email job completed. Disabling cron. Sent: ${totalSent}, Failed: ${totalFailed}`,
    );

    // Disable this cron job permanently
    const job = this.schedulerRegistry.getCronJob('bulk-user-email');
    await job.stop();
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
