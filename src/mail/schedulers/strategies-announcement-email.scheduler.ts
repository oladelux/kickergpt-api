import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { MailService } from '../mail.service';
import { UserEntity } from '../../users/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class StrategiesAnnouncementEmailScheduler {
  private readonly logger = new Logger(
    StrategiesAnnouncementEmailScheduler.name,
  );
  private readonly batchSize = 100;
  // Rate limiting is now handled centrally in MailerService
  // No delay needed per email - rate limiter handles it
  private readonly delayPerEmailMs = 0;
  // Small delay between batches to avoid overwhelming database
  private readonly delayBetweenBatchesMs = 200;

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly mailService: MailService,
  ) {}

  @Cron('18 04 * * *')
  /**
   * Send strategies feature announcement email to all users at 7am daily.
   * Can be triggered manually or via cron.
   * NOTE: This is currently disabled. Remove the return statement to enable.
   */
  async sendStrategiesAnnouncementEmail(): Promise<void> {
    this.logger.log(
      'Starting strategies feature announcement bulk email job...',
    );
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
          // Send strategies feature announcement email
          await this.mailService.sendStrategiesFeatureEmail({
            to: user.email as string,
            name,
          });
          totalSent += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          totalFailed += 1;
          this.logger.warn(`Failed to process user ${user.email}: ${message}`);
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
      `Strategies announcement email job completed. Emails sent: ${totalSent}, Failed: ${totalFailed}`,
    );
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
