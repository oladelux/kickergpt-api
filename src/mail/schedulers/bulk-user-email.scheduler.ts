import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { MailService } from '../mail.service';
import { UserEntity } from '../../users/infrastructure/persistence/relational/entities/user.entity';
import { PromptUsageService } from '../../prompt-usage/prompt-usage.service';

@Injectable()
export class BulkUserEmailScheduler {
  private readonly logger = new Logger(BulkUserEmailScheduler.name);
  private readonly batchSize = 100;
  private readonly delayPerEmailMs = 600; // avoid rate limits
  private readonly delayBetweenBatchesMs = 1000;
  private readonly freePromptsToGrant = 5;

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly mailService: MailService,
    private readonly promptUsageService: PromptUsageService,
  ) {}

  @Cron('00 07 * * *')
  async sendBulkUserEmail(): Promise<void> {
    this.logger.log('Starting milestone celebration bulk email job...');
    let offset = 0;
    let totalSent = 0;
    let totalFailed = 0;
    let totalCreditsGranted = 0;

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
          // Grant 5 free prompts to the user
          await this.promptUsageService.addAddonCredits(
            user.id,
            this.freePromptsToGrant,
          );
          totalCreditsGranted += 1;

          // Send milestone celebration email
          await this.mailService.sendMilestoneCelebrationEmail({
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
    }

    this.logger.log(
      `Milestone celebration email job completed. Credits granted: ${totalCreditsGranted}, Emails sent: ${totalSent}, Failed: ${totalFailed}`,
    );
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
