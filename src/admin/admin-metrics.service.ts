import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../users/infrastructure/persistence/relational/entities/user.entity';
import { FixtureChatEntity } from '../fixtures/infrastructure/persistence/relational/entities/fixture-chat.entity';
import { PromptUsageEntity } from '../prompt-usage/infrastructure/persistence/relational/entities/prompt-usage.entity';
import { SubscriptionEntity } from '../subscriptions/infrastructure/persistence/relational/entities/subscription.entity';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';
import { AdminMetricsDto } from './dto/admin-metrics.dto';

@Injectable()
export class AdminMetricsService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(FixtureChatEntity)
    private readonly fixtureChatRepository: Repository<FixtureChatEntity>,
    @InjectRepository(PromptUsageEntity)
    private readonly promptUsageRepository: Repository<PromptUsageEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
  ) {}

  async getMetrics(): Promise<AdminMetricsDto> {
    const userCountPromise = this.userRepository.count();
    const fixtureChatCountPromise = this.fixtureChatRepository.count();
    const paidUserCountPromise = this.subscriptionRepository.count({
      where: {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    const promptUsageAggPromise = this.promptUsageRepository
      .createQueryBuilder('usage')
      .select('COALESCE(SUM(usage.promptsUsed), 0)', 'totalPrompts')
      .getRawOne();

    const [userCount, fixtureChatCount, paidUserCount, promptUsageAgg] =
      await Promise.all([
        userCountPromise,
        fixtureChatCountPromise,
        paidUserCountPromise,
        promptUsageAggPromise,
      ]);

    const totalPromptsUsed = Number(promptUsageAgg?.totalPrompts ?? 0);
    const avgPromptUsagePerUser =
      userCount > 0 ? totalPromptsUsed / userCount : 0;

    const exhaustedPromptUserCount = await this.countExhaustedUsers();

    return {
      userCount,
      fixtureChatCount,
      avgPromptUsagePerUser,
      paidUserCount,
      exhaustedPromptUserCount,
    };
  }

  private async countExhaustedUsers(): Promise<number> {
    const usages = await this.promptUsageRepository.find();

    if (usages.length === 0) {
      return 0;
    }

    const userIds = usages.map((usage) => usage.userId);
    const subscriptions = await this.subscriptionRepository.find({
      where: { userId: In(userIds) },
    });

    const subscriptionByUserId = new Map<string, SubscriptionEntity>();
    subscriptions.forEach((sub) => {
      subscriptionByUserId.set(sub.userId, sub);
    });

    let exhausted = 0;

    for (const usage of usages) {
      const sub = subscriptionByUserId.get(usage.userId);
      const allowance =
        sub?.plan === SubscriptionPlan.PRO &&
        sub?.status === SubscriptionStatus.ACTIVE
          ? 100
          : 10;

      const isExhausted =
        usage.promptsUsed >= allowance && usage.addonCredits <= 0;

      if (isExhausted) {
        exhausted += 1;
      }
    }

    return exhausted;
  }
}
