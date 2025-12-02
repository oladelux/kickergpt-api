import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { UserEntity } from '../users/infrastructure/persistence/relational/entities/user.entity';
import { FixtureChatEntity } from '../fixtures/infrastructure/persistence/relational/entities/fixture-chat.entity';
import { PromptUsageEntity } from '../prompt-usage/infrastructure/persistence/relational/entities/prompt-usage.entity';
import { SubscriptionEntity } from '../subscriptions/infrastructure/persistence/relational/entities/subscription.entity';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';
import { AdminMetricsDto, TopChatUserDto } from './dto/admin-metrics.dto';

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
    const windows = this.build7DayWindows();

    const [
      userCount,
      fixtureChatCount,
      paidUserCount,
      promptUsageAgg,
      newUsers7d,
      newUsersPrev7d,
      fixtureChats7d,
      fixtureChatsPrev7d,
      activeUsers7d,
      activeUsersPrev7d,
    ] = await Promise.all([
      this.userRepository.count(),
      this.fixtureChatRepository.count(),
      this.subscriptionRepository.count({
        where: {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
        },
      }),
      this.promptUsageRepository
        .createQueryBuilder('usage')
        .select('COALESCE(SUM(usage.promptsUsed), 0)', 'totalPrompts')
        .getRawOne(),
      this.countNewUsersBetween(windows.currentStart, windows.currentEnd),
      this.countNewUsersBetween(windows.prevStart, windows.prevEnd),
      this.countFixtureChatsBetween(windows.currentStart, windows.currentEnd),
      this.countFixtureChatsBetween(windows.prevStart, windows.prevEnd),
      this.countActiveUsersBetween(windows.currentStart, windows.currentEnd),
      this.countActiveUsersBetween(windows.prevStart, windows.prevEnd),
    ]);

    const totalPromptsUsed = Number(promptUsageAgg?.totalPrompts ?? 0);
    const avgPromptUsagePerUser =
      userCount > 0 ? totalPromptsUsed / userCount : 0;

    const exhaustedPromptUserCount = await this.countExhaustedUsers();
    const { todayStart, todayEnd, monthStart, monthEnd } =
      this.buildDayAndMonthWindows();

    const [topChatUsersToday, topChatUsersMonth] = await Promise.all([
      this.topChatUsersBetween(todayStart, todayEnd),
      this.topChatUsersBetween(monthStart, monthEnd),
    ]);

    return {
      userCount,
      newUsers7d,
      newUsersPrev7d,
      newUsers7dChangePct: this.changePct(newUsers7d, newUsersPrev7d),
      fixtureChatCount,
      fixtureChats7d,
      fixtureChatsPrev7d,
      fixtureChats7dChangePct: this.changePct(
        fixtureChats7d,
        fixtureChatsPrev7d,
      ),
      activeUsers7d,
      activeUsersPrev7d,
      activeUsers7dChangePct: this.changePct(activeUsers7d, activeUsersPrev7d),
      avgPromptUsagePerUser,
      paidUserCount,
      exhaustedPromptUserCount,
      topChatUsersToday,
      topChatUsersMonth,
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

  private buildDayAndMonthWindows(): {
    todayStart: Date;
    todayEnd: Date;
    monthStart: Date;
    monthEnd: Date;
  } {
    const now = new Date();

    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const todayEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );

    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const monthEnd = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );

    return { todayStart, todayEnd, monthStart, monthEnd };
  }

  private build7DayWindows(): {
    currentStart: Date;
    currentEnd: Date;
    prevStart: Date;
    prevEnd: Date;
  } {
    const now = new Date();
    const currentEnd = new Date(now);
    currentEnd.setUTCHours(23, 59, 59, 999);

    const currentStart = new Date(currentEnd);
    currentStart.setUTCDate(currentStart.getUTCDate() - 6);
    currentStart.setUTCHours(0, 0, 0, 0);

    const prevEnd = new Date(currentStart);
    prevEnd.setUTCHours(23, 59, 59, 999);
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

    const prevStart = new Date(prevEnd);
    prevStart.setUTCDate(prevStart.getUTCDate() - 6);
    prevStart.setUTCHours(0, 0, 0, 0);

    return { currentStart, currentEnd, prevStart, prevEnd };
  }

  private async countNewUsersBetween(start: Date, end: Date): Promise<number> {
    return this.userRepository.count({
      where: {
        createdAt: Between(start, end),
      },
    });
  }

  private async countFixtureChatsBetween(
    start: Date,
    end: Date,
  ): Promise<number> {
    return this.fixtureChatRepository.count({
      where: {
        createdAt: Between(start, end),
      },
    });
  }

  private async countActiveUsersBetween(
    start: Date,
    end: Date,
  ): Promise<number> {
    const result = await this.fixtureChatRepository
      .createQueryBuilder('chat')
      .select('COUNT(DISTINCT chat.userId)', 'count')
      .where('chat.createdAt BETWEEN :start AND :end', { start, end })
      .getRawOne();

    return Number(result?.count ?? 0);
  }

  private changePct(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
  }

  private async topChatUsersBetween(
    start: Date,
    end: Date,
    limit = 10,
  ): Promise<TopChatUserDto[]> {
    const raw = await this.fixtureChatRepository
      .createQueryBuilder('chat')
      .select('chat.userId', 'userId')
      .addSelect('COUNT(chat.id)', 'chatCount')
      .where('chat.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('chat.userId')
      .orderBy('COUNT(chat.id)', 'DESC')
      .limit(limit)
      .getRawMany<{ userId: string; chatCount: string }>();

    if (!raw.length) {
      return [];
    }

    const users = await this.userRepository.find({
      select: ['id', 'email', 'firstName', 'lastName'],
      where: { id: In(raw.map((r) => r.userId)) },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return raw
      .map<TopChatUserDto>((row) => {
        const user = userById.get(row.userId);
        return {
          userId: row.userId,
          email: user?.email ?? null,
          firstName: user?.firstName ?? null,
          lastName: user?.lastName ?? null,
          chatCount: Number(row.chatCount ?? 0),
        };
      })
      .filter((entry) => entry.chatCount > 0);
  }
}
