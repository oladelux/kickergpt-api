import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail.service';
import { UserEntity } from '../../users/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class NigerianPricingUpdateScheduler {
  private readonly logger = new Logger(NigerianPricingUpdateScheduler.name);
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

  /**
   * Send Nigerian pricing update email to Nigerian users.
   * Can be triggered manually or via cron.
   * NOTE: Remove the return statement to enable automatic sending via cron.
   */
  @Cron('00 08 * * *')
  async sendNigerianPricingUpdateEmail(): Promise<void> {
    // Remove this return statement when ready to send
    return;
    this.logger.log(
      'Starting Nigerian pricing update bulk email job for Nigerian users...',
    );
    let offset = 0;
    let totalSent = 0;
    let totalFailed = 0;

    while (true) {
      // Query for Nigerian users:
      // 1. Have email
      // 2. Country code is 'NG' (Nigeria)
      const queryBuilder = this.usersRepository
        .createQueryBuilder('user')
        .select([
          'user.id',
          'user.email',
          'user.firstName',
          'user.lastName',
          'user.countryCode',
          'user.createdAt',
        ])
        .where('user.email IS NOT NULL')
        .andWhere('UPPER(user.countryCode) = :ngCode', { ngCode: 'NG' })
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

        // Double check that user is Nigerian
        if (user.countryCode?.toUpperCase() !== 'NG') {
          continue;
        }

        const name = user.firstName?.trim() || user.lastName?.trim() || 'there';

        try {
          // Send Nigerian pricing update email
          await this.mailService.sendNigerianPricingUpdateEmail({
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
      `Nigerian pricing update email job completed. Emails sent: ${totalSent}, Failed: ${totalFailed}`,
    );
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
