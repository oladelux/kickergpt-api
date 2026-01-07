import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, In, Between, ILike, LessThanOrEqual } from 'typeorm';
import Stripe from 'stripe';
import { UserEntity } from '../users/infrastructure/persistence/relational/entities/user.entity';
import { SubscriptionEntity } from '../subscriptions/infrastructure/persistence/relational/entities/subscription.entity';
import { PromptUsageEntity } from '../prompt-usage/infrastructure/persistence/relational/entities/prompt-usage.entity';
import { StrategyEntity } from '../strategies/infrastructure/persistence/relational/entities/strategy.entity';
import { FixtureChatEntity } from '../fixtures/infrastructure/persistence/relational/entities/fixture-chat.entity';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';
import { AllConfigType } from '../config/config.type';
import {
  UserDetailDto,
  UserSubscriptionDto,
  UserPromptUsageDto,
} from './dto/user-detail.dto';
import { UserListItemDto } from './dto/user-list.dto';
import {
  FinancialMetricsDto,
  RevenueByCountryDto,
  RevenueByPlanDto,
  NigerianFinancialMetricsDto,
  NonNigerianFinancialMetricsDto,
} from './dto/financial-metrics.dto';
import {
  SubscriptionListItemDto,
  SubscriptionStatsDto,
  SubscriptionByPlanDto,
} from './dto/subscription-stats.dto';
import {
  PromptUsageStatsDto,
  TopPromptUserDto,
  ExhaustedUserDto,
  PromptUsageByCountryDto,
} from './dto/prompt-usage-stats.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';

@Injectable()
export class AdminService {
  private stripeClient: Stripe;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
    @InjectRepository(PromptUsageEntity)
    private readonly promptUsageRepository: Repository<PromptUsageEntity>,
    @InjectRepository(StrategyEntity)
    private readonly strategyRepository: Repository<StrategyEntity>,
    @InjectRepository(FixtureChatEntity)
    private readonly fixtureChatRepository: Repository<FixtureChatEntity>,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    const stripeSecret = this.configService.getOrThrow('stripe.secret', {
      infer: true,
    });
    this.stripeClient = new Stripe(stripeSecret, {
      apiVersion: '2025-01-27.acacia',
    });
  }

  // User Management Methods

  async getUsers(params: {
    page?: number;
    limit?: number;
    email?: string;
    countryCode?: string;
    plan?: SubscriptionPlan;
    status?: SubscriptionStatus;
    search?: string;
  }): Promise<PaginatedResponseDto<UserListItemDto>> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.status', 'status')
      .leftJoin('subscription', 'sub', 'sub.userId = user.id')
      .select([
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
        'user.countryCode',
        'user.createdAt',
        'user.updatedAt',
        'sub.plan',
        'sub.status',
      ]);

    if (params.email) {
      queryBuilder.andWhere('user.email ILIKE :email', {
        email: `%${params.email}%`,
      });
    }

    if (params.countryCode) {
      queryBuilder.andWhere('user.countryCode = :countryCode', {
        countryCode: params.countryCode.toUpperCase(),
      });
    }

    if (params.plan) {
      queryBuilder.andWhere('sub.plan = :plan', { plan: params.plan });
    }

    if (params.status) {
      queryBuilder.andWhere('sub.status = :status', { status: params.status });
    }

    if (params.search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${params.search}%` },
      );
    }

    const [users, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('user.createdAt', 'DESC')
      .getManyAndCount();

    const items: UserListItemDto[] = users.map((user) => {
      const subscription = (user as any).sub;
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        countryCode: user.countryCode,
        subscriptionPlan: subscription?.plan ?? null,
        subscriptionStatus: subscription?.status ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });

    return {
      data: items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserById(userId: string): Promise<UserDetailDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['status', 'role'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [subscription, promptUsage, strategyCount, fixtureChatCount] =
      await Promise.all([
        this.subscriptionRepository.findOne({
          where: { userId },
        }),
        this.promptUsageRepository.findOne({
          where: { userId },
        }),
        this.strategyRepository.count({
          where: { userId },
        }),
        this.fixtureChatRepository.count({
          where: { user: { id: userId } },
        }),
      ]);

    const subscriptionDto: UserSubscriptionDto | null = subscription
      ? {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          paymentProvider: subscription.paymentProvider,
          stripeCustomerId: subscription.stripeCustomerId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          paystackCustomerCode: subscription.paystackCustomerCode,
          paystackSubscriptionCode: subscription.paystackSubscriptionCode,
          currentPeriodEnd: subscription.currentPeriodEnd,
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
        }
      : null;

    const promptUsageDto: UserPromptUsageDto | null = promptUsage
      ? {
          id: promptUsage.id,
          promptsUsed: promptUsage.promptsUsed,
          addonCredits: promptUsage.addonCredits,
          adCredits: promptUsage.adCredits,
          purchasedCredits: promptUsage.purchasedCredits,
          lastAdWatchedAt: promptUsage.lastAdWatchedAt,
          adsWatchedToday: promptUsage.adsWatchedToday,
          adsWatchDate: promptUsage.adsWatchDate,
          periodStart: promptUsage.periodStart,
          createdAt: promptUsage.createdAt,
          updatedAt: promptUsage.updatedAt,
        }
      : null;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      countryCode: user.countryCode,
      provider: user.provider,
      socialId: user.socialId ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      subscription: subscriptionDto,
      promptUsage: promptUsageDto,
      strategyCount,
      fixtureChatCount,
    };
  }

  async searchUsers(query: string): Promise<UserListItemDto[]> {
    const users = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin('subscription', 'sub', 'sub.userId = user.id')
      .where(
        '(user.email ILIKE :query OR user.firstName ILIKE :query OR user.lastName ILIKE :query)',
        { query: `%${query}%` },
      )
      .select([
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
        'user.countryCode',
        'user.createdAt',
        'user.updatedAt',
        'sub.plan',
        'sub.status',
      ])
      .take(50)
      .orderBy('user.createdAt', 'DESC')
      .getMany();

    return users.map((user) => {
      const subscription = (user as any).sub;
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        countryCode: user.countryCode,
        subscriptionPlan: subscription?.plan ?? null,
        subscriptionStatus: subscription?.status ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }

  // Financial Metrics Methods

  private async getStripePrice(priceId: string): Promise<number> {
    try {
      const price = await this.stripeClient.prices.retrieve(priceId);
      return (price.unit_amount ?? 0) / 100; // Convert from cents to dollars
    } catch (error) {
      // If we can't fetch, return 0 or a default
      return 0;
    }
  }

  private getNigerianPlanPrice(plan: SubscriptionPlan): number {
    switch (plan) {
      case SubscriptionPlan.THREE_DAY_PASS:
        return 700; // ₦700
      case SubscriptionPlan.SEVEN_DAY_PASS:
        return 1200; // ₦1,200
      case SubscriptionPlan.MONTHLY_UNLIMITED:
        return 3000; // ₦3,000
      default:
        return 0;
    }
  }

  private async calculateSubscriptionMrr(
    subscription: SubscriptionEntity,
    user: UserEntity,
  ): Promise<number> {
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      return 0;
    }

    const countryCode = user.countryCode?.toUpperCase();

    switch (subscription.plan) {
      case SubscriptionPlan.FREE:
        return 0;

      case SubscriptionPlan.PRO:
        // Get price from Stripe based on country
        const priceId = this.getPriceIdByCountry(countryCode);
        const price = await this.getStripePrice(priceId);
        return price;

      case SubscriptionPlan.MONTHLY_UNLIMITED:
        if (countryCode === 'NG') {
          return this.getNigerianPlanPrice(SubscriptionPlan.MONTHLY_UNLIMITED);
        }
        // For non-NG, we'd need to get from Stripe or use a default
        // For now, return 0 or fetch from Stripe if available
        return 0;

      case SubscriptionPlan.THREE_DAY_PASS:
        if (countryCode === 'NG') {
          const price = this.getNigerianPlanPrice(
            SubscriptionPlan.THREE_DAY_PASS,
          );
          return (price / 3) * 30; // Prorate to monthly
        }
        return 0;

      case SubscriptionPlan.SEVEN_DAY_PASS:
        if (countryCode === 'NG') {
          const price = this.getNigerianPlanPrice(
            SubscriptionPlan.SEVEN_DAY_PASS,
          );
          return (price / 7) * 30; // Prorate to monthly
        }
        return 0;

      default:
        return 0;
    }
  }

  private getPriceIdByCountry(countryCode?: string | null): string {
    if (!countryCode) {
      return this.configService.getOrThrow('stripe.proPriceIdUsd', {
        infer: true,
      });
    }

    const normalizedCountry = countryCode.toUpperCase();

    if (normalizedCountry === 'NG') {
      return this.configService.getOrThrow('stripe.proPriceIdNgn', {
        infer: true,
      });
    }

    if (normalizedCountry === 'GB') {
      return this.configService.getOrThrow('stripe.proPriceIdGbp', {
        infer: true,
      });
    }

    const europeanCountries = [
      'AT',
      'BE',
      'CY',
      'EE',
      'FI',
      'FR',
      'DE',
      'GR',
      'IE',
      'IT',
      'LV',
      'LT',
      'LU',
      'MT',
      'NL',
      'PT',
      'SK',
      'SI',
      'ES',
    ];

    if (europeanCountries.includes(normalizedCountry)) {
      return this.configService.getOrThrow('stripe.proPriceIdEur', {
        infer: true,
      });
    }

    if (normalizedCountry === 'US') {
      return this.configService.getOrThrow('stripe.proPriceIdUsd', {
        infer: true,
      });
    }

    return this.configService.getOrThrow('stripe.proPriceIdUsd', {
      infer: true,
    });
  }

  async getFinancialMetrics(): Promise<FinancialMetricsDto> {
    const activeSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        plan: In([
          SubscriptionPlan.PRO,
          SubscriptionPlan.MONTHLY_UNLIMITED,
          SubscriptionPlan.THREE_DAY_PASS,
          SubscriptionPlan.SEVEN_DAY_PASS,
        ]),
      },
      relations: ['user'],
    });

    const mrrByCountry = new Map<string, number>();
    const arrByCountry = new Map<string, number>();
    const countByCountry = new Map<string, number>();
    const mrrByPlan = new Map<SubscriptionPlan, number>();
    const arrByPlan = new Map<SubscriptionPlan, number>();
    const countByPlan = new Map<SubscriptionPlan, number>();

    let totalMrr = 0;

    for (const subscription of activeSubscriptions) {
      const user = subscription.user;
      const countryKey = user?.countryCode ?? 'UNKNOWN';
      const mrr = await this.calculateSubscriptionMrr(subscription, user);

      totalMrr += mrr;

      // By country
      const currentMrr = mrrByCountry.get(countryKey) ?? 0;
      mrrByCountry.set(countryKey, currentMrr + mrr);
      arrByCountry.set(countryKey, (currentMrr + mrr) * 12);
      countByCountry.set(countryKey, (countByCountry.get(countryKey) ?? 0) + 1);

      // By plan
      const currentPlanMrr = mrrByPlan.get(subscription.plan) ?? 0;
      mrrByPlan.set(subscription.plan, currentPlanMrr + mrr);
      arrByPlan.set(subscription.plan, (currentPlanMrr + mrr) * 12);
      countByPlan.set(
        subscription.plan,
        (countByPlan.get(subscription.plan) ?? 0) + 1,
      );
    }

    const byCountryPromises = Array.from(mrrByCountry.entries()).map(
      async ([countryCode, mrr]) => {
        const arr = arrByCountry.get(countryCode) ?? 0;
        const count = countByCountry.get(countryCode) ?? 0;

        // Get plan breakdown for this country
        const planBreakdown = new Map<SubscriptionPlan, number>();
        const planCounts = new Map<SubscriptionPlan, number>();

        const countrySubscriptions = activeSubscriptions.filter(
          (sub) =>
            (sub.user?.countryCode ?? 'UNKNOWN') === countryCode &&
            sub.status === SubscriptionStatus.ACTIVE,
        );

        for (const sub of countrySubscriptions) {
          const subMrr = await this.calculateSubscriptionMrr(sub, sub.user);
          const current = planBreakdown.get(sub.plan) ?? 0;
          planBreakdown.set(sub.plan, current + subMrr);
          planCounts.set(sub.plan, (planCounts.get(sub.plan) ?? 0) + 1);
        }

        const byPlan: RevenueByPlanDto[] = Array.from(
          planBreakdown.entries(),
        ).map(([plan, planMrr]) => ({
          plan,
          mrr: planMrr,
          arr: planMrr * 12,
          activeSubscriptions: planCounts.get(plan) ?? 0,
        }));

        return {
          countryCode: countryCode === 'UNKNOWN' ? null : countryCode,
          mrr,
          arr,
          activeSubscriptions: count,
          byPlan,
        };
      },
    );

    const byCountry = await Promise.all(byCountryPromises);

    const byPlan: RevenueByPlanDto[] = Array.from(mrrByPlan.entries()).map(
      ([plan, mrr]) => ({
        plan,
        mrr,
        arr: arrByPlan.get(plan) ?? 0,
        activeSubscriptions: countByPlan.get(plan) ?? 0,
      }),
    );

    return {
      totalMrr,
      totalArr: totalMrr * 12,
      totalActiveSubscriptions: activeSubscriptions.length,
      byCountry,
      byPlan,
    };
  }

  async getFinancialMetricsByCountry(): Promise<RevenueByCountryDto[]> {
    const metrics = await this.getFinancialMetrics();
    return metrics.byCountry;
  }

  async getNigerianFinancialMetrics(): Promise<NigerianFinancialMetricsDto> {
    const activeSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        plan: In([
          SubscriptionPlan.PRO,
          SubscriptionPlan.MONTHLY_UNLIMITED,
          SubscriptionPlan.THREE_DAY_PASS,
          SubscriptionPlan.SEVEN_DAY_PASS,
        ]),
      },
      relations: ['user'],
    });

    const nigerianSubscriptions = activeSubscriptions.filter(
      (sub) => sub.user?.countryCode?.toUpperCase() === 'NG',
    );

    const mrrByPlan = new Map<SubscriptionPlan, number>();
    const countByPlan = new Map<SubscriptionPlan, number>();
    let totalMrr = 0;

    for (const subscription of nigerianSubscriptions) {
      const mrr = await this.calculateSubscriptionMrr(
        subscription,
        subscription.user,
      );
      totalMrr += mrr;

      const current = mrrByPlan.get(subscription.plan) ?? 0;
      mrrByPlan.set(subscription.plan, current + mrr);
      countByPlan.set(
        subscription.plan,
        (countByPlan.get(subscription.plan) ?? 0) + 1,
      );
    }

    const byPlan: RevenueByPlanDto[] = Array.from(mrrByPlan.entries()).map(
      ([plan, mrr]) => ({
        plan,
        mrr,
        arr: mrr * 12,
        activeSubscriptions: countByPlan.get(plan) ?? 0,
      }),
    );

    return {
      mrr: totalMrr,
      arr: totalMrr * 12,
      activeSubscriptions: nigerianSubscriptions.length,
      byPlan,
    };
  }

  async getNonNigerianFinancialMetrics(): Promise<NonNigerianFinancialMetricsDto> {
    const activeSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        plan: In([
          SubscriptionPlan.PRO,
          SubscriptionPlan.MONTHLY_UNLIMITED,
          SubscriptionPlan.THREE_DAY_PASS,
          SubscriptionPlan.SEVEN_DAY_PASS,
        ]),
      },
      relations: ['user'],
    });

    const nonNigerianSubscriptions = activeSubscriptions.filter(
      (sub) => sub.user?.countryCode?.toUpperCase() !== 'NG',
    );

    const mrrByCountry = new Map<string, number>();
    const countByCountry = new Map<string, number>();
    const mrrByPlan = new Map<SubscriptionPlan, number>();
    const countByPlan = new Map<SubscriptionPlan, number>();
    let totalMrr = 0;

    for (const subscription of nonNigerianSubscriptions) {
      const mrr = await this.calculateSubscriptionMrr(
        subscription,
        subscription.user,
      );
      totalMrr += mrr;

      const countryKey = subscription.user?.countryCode ?? 'UNKNOWN';
      const currentCountryMrr = mrrByCountry.get(countryKey) ?? 0;
      mrrByCountry.set(countryKey, currentCountryMrr + mrr);
      countByCountry.set(countryKey, (countByCountry.get(countryKey) ?? 0) + 1);

      const currentPlanMrr = mrrByPlan.get(subscription.plan) ?? 0;
      mrrByPlan.set(subscription.plan, currentPlanMrr + mrr);
      countByPlan.set(
        subscription.plan,
        (countByPlan.get(subscription.plan) ?? 0) + 1,
      );
    }

    const byCountryPromises = Array.from(mrrByCountry.entries()).map(
      async ([countryCode, mrr]) => {
        const count = countByCountry.get(countryCode) ?? 0;
        // Get plan breakdown for this country
        const planBreakdown = new Map<SubscriptionPlan, number>();
        const planCounts = new Map<SubscriptionPlan, number>();

        const countrySubscriptions = nonNigerianSubscriptions.filter(
          (sub) =>
            (sub.user?.countryCode ?? 'UNKNOWN') === countryCode &&
            sub.status === SubscriptionStatus.ACTIVE,
        );

        for (const sub of countrySubscriptions) {
          const subMrr = await this.calculateSubscriptionMrr(sub, sub.user);
          const current = planBreakdown.get(sub.plan) ?? 0;
          planBreakdown.set(sub.plan, current + subMrr);
          planCounts.set(sub.plan, (planCounts.get(sub.plan) ?? 0) + 1);
        }

        const byPlan: RevenueByPlanDto[] = Array.from(
          planBreakdown.entries(),
        ).map(([plan, planMrr]) => ({
          plan,
          mrr: planMrr,
          arr: planMrr * 12,
          activeSubscriptions: planCounts.get(plan) ?? 0,
        }));

        return {
          countryCode: countryCode === 'UNKNOWN' ? null : countryCode,
          mrr,
          arr: mrr * 12,
          activeSubscriptions: count,
          byPlan,
        };
      },
    );

    const byCountry = await Promise.all(byCountryPromises);

    const byPlan: RevenueByPlanDto[] = Array.from(mrrByPlan.entries()).map(
      ([plan, mrr]) => ({
        plan,
        mrr,
        arr: mrr * 12,
        activeSubscriptions: countByPlan.get(plan) ?? 0,
      }),
    );

    return {
      mrr: totalMrr,
      arr: totalMrr * 12,
      activeSubscriptions: nonNigerianSubscriptions.length,
      byCountry,
      byPlan,
    };
  }

  // Subscription Analytics Methods

  async getSubscriptions(params: {
    page?: number;
    limit?: number;
    plan?: SubscriptionPlan;
    status?: SubscriptionStatus;
    countryCode?: string;
  }): Promise<PaginatedResponseDto<SubscriptionListItemDto>> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.subscriptionRepository
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.user', 'user')
      .select([
        'subscription.id',
        'subscription.plan',
        'subscription.status',
        'subscription.currentPeriodEnd',
        'subscription.createdAt',
        'user.countryCode',
        'user.email',
        'user.firstName',
        'user.lastName',
      ]);

    if (params.plan) {
      queryBuilder.andWhere('subscription.plan = :plan', { plan: params.plan });
    }

    if (params.status) {
      queryBuilder.andWhere('subscription.status = :status', {
        status: params.status,
      });
    }

    if (params.countryCode) {
      queryBuilder.andWhere('user.countryCode = :countryCode', {
        countryCode: params.countryCode.toUpperCase(),
      });
    }

    const [subscriptions, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('subscription.createdAt', 'DESC')
      .getManyAndCount();

    const items: SubscriptionListItemDto[] = subscriptions.map((sub) => ({
      id: sub.id,
      plan: sub.plan,
      status: sub.status,
      countryCode: sub.user?.countryCode ?? null,
      userEmail: sub.user?.email ?? null,
      userFirstName: sub.user?.firstName ?? null,
      userLastName: sub.user?.lastName ?? null,
      currentPeriodEnd: sub.currentPeriodEnd,
      createdAt: sub.createdAt,
    }));

    return {
      data: items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSubscriptionStats(): Promise<SubscriptionStatsDto> {
    const [total, byPlanRaw, byStatusRaw, activeCount, inactiveCount] =
      await Promise.all([
        this.subscriptionRepository.count(),
        this.subscriptionRepository
          .createQueryBuilder('subscription')
          .select('subscription.plan', 'plan')
          .addSelect('COUNT(*)', 'count')
          .groupBy('subscription.plan')
          .getRawMany<{ plan: SubscriptionPlan; count: string }>(),
        this.subscriptionRepository
          .createQueryBuilder('subscription')
          .select('subscription.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('subscription.status')
          .getRawMany<{ status: SubscriptionStatus; count: string }>(),
        this.subscriptionRepository.count({
          where: { status: SubscriptionStatus.ACTIVE },
        }),
        this.subscriptionRepository.count({
          where: { status: SubscriptionStatus.INACTIVE },
        }),
      ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newLast30Days = await this.subscriptionRepository.count({
      where: {
        createdAt: Between(thirtyDaysAgo, new Date()),
      },
    });

    const byPlan = byPlanRaw.map((item) => ({
      plan: item.plan,
      count: Number(item.count),
    }));

    const byStatus = byStatusRaw.map((item) => ({
      status: item.status,
      count: Number(item.count),
    }));

    // Calculate churn rate (simplified: inactive / total)
    const churnRate = total > 0 ? (inactiveCount / total) * 100 : 0;

    return {
      total,
      byPlan,
      byStatus,
      activeCount,
      inactiveCount,
      newLast30Days,
      churnRate,
    };
  }

  async getSubscriptionsByPlan(): Promise<SubscriptionByPlanDto[]> {
    const activeSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        plan: In([
          SubscriptionPlan.PRO,
          SubscriptionPlan.MONTHLY_UNLIMITED,
          SubscriptionPlan.THREE_DAY_PASS,
          SubscriptionPlan.SEVEN_DAY_PASS,
        ]),
      },
      relations: ['user'],
    });

    const mrrByPlan = new Map<SubscriptionPlan, number>();
    const countByPlan = new Map<SubscriptionPlan, number>();

    for (const subscription of activeSubscriptions) {
      const mrr = await this.calculateSubscriptionMrr(
        subscription,
        subscription.user,
      );
      const current = mrrByPlan.get(subscription.plan) ?? 0;
      mrrByPlan.set(subscription.plan, current + mrr);
      countByPlan.set(
        subscription.plan,
        (countByPlan.get(subscription.plan) ?? 0) + 1,
      );
    }

    return Array.from(mrrByPlan.entries()).map(([plan, mrr]) => ({
      plan,
      count: countByPlan.get(plan) ?? 0,
      mrr,
      arr: mrr * 12,
    }));
  }

  async getExpiringSubscriptions(
    days: number = 30,
  ): Promise<SubscriptionListItemDto[]> {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + days);

    const subscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: LessThanOrEqual(expirationDate),
      },
      relations: ['user'],
      order: {
        currentPeriodEnd: 'ASC',
      },
    });

    return subscriptions.map((sub) => ({
      id: sub.id,
      plan: sub.plan,
      status: sub.status,
      countryCode: sub.user?.countryCode ?? null,
      userEmail: sub.user?.email ?? null,
      userFirstName: sub.user?.firstName ?? null,
      userLastName: sub.user?.lastName ?? null,
      currentPeriodEnd: sub.currentPeriodEnd,
      createdAt: sub.createdAt,
    }));
  }

  // Prompt Usage Analytics Methods

  async getPromptUsageStats(): Promise<PromptUsageStatsDto> {
    const [usageAgg, totalUsers, exhaustedCount, creditsAgg] =
      await Promise.all([
        this.promptUsageRepository
          .createQueryBuilder('usage')
          .select('COALESCE(SUM(usage.promptsUsed), 0)', 'totalPrompts')
          .getRawOne<{ totalPrompts: string }>(),
        this.promptUsageRepository
          .createQueryBuilder('usage')
          .select('COUNT(DISTINCT usage.userId)', 'count')
          .getRawOne<{ count: string }>(),
        this.countExhaustedUsers(),
        this.promptUsageRepository
          .createQueryBuilder('usage')
          .select('COALESCE(SUM(usage.addonCredits), 0)', 'totalAddon')
          .addSelect('COALESCE(SUM(usage.adCredits), 0)', 'totalAd')
          .addSelect(
            'COALESCE(SUM(usage.purchasedCredits), 0)',
            'totalPurchased',
          )
          .getRawOne<{
            totalAddon: string;
            totalAd: string;
            totalPurchased: string;
          }>(),
      ]);

    const totalPromptsUsed = Number(usageAgg?.totalPrompts ?? 0);
    const userCount = Number(totalUsers?.count ?? 0);
    const avgPromptsPerUser = userCount > 0 ? totalPromptsUsed / userCount : 0;

    return {
      totalPromptsUsed,
      totalUsers: userCount,
      avgPromptsPerUser,
      exhaustedUsersCount: exhaustedCount,
      totalAddonCredits: Number(creditsAgg?.totalAddon ?? 0),
      totalAdCredits: Number(creditsAgg?.totalAd ?? 0),
      totalPurchasedCredits: Number(creditsAgg?.totalPurchased ?? 0),
    };
  }

  private async countExhaustedUsers(): Promise<number> {
    const usages = await this.promptUsageRepository.find({
      relations: ['user'],
    });

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
        (sub?.plan === SubscriptionPlan.PRO ||
          sub?.plan === SubscriptionPlan.MONTHLY_UNLIMITED) &&
        sub?.status === SubscriptionStatus.ACTIVE
          ? 100
          : 10;

      const isExhausted =
        usage.promptsUsed >= allowance &&
        usage.addonCredits <= 0 &&
        usage.adCredits <= 0 &&
        usage.purchasedCredits <= 0;

      if (isExhausted) {
        exhausted += 1;
      }
    }

    return exhausted;
  }

  async getTopPromptUsers(
    limit: number = 10,
    period?: 'today' | 'week' | 'month' | 'all',
  ): Promise<TopPromptUserDto[]> {
    let startDate: Date | undefined;
    const now = new Date();

    if (period === 'today') {
      startDate = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );
    } else if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
      );
    }

    const queryBuilder = this.promptUsageRepository
      .createQueryBuilder('usage')
      .leftJoin('user', 'user', 'user.id = usage.userId')
      .select([
        'usage.userId',
        'usage.promptsUsed',
        'usage.addonCredits',
        'usage.adCredits',
        'usage.purchasedCredits',
        'user.email',
        'user.firstName',
        'user.lastName',
      ])
      .orderBy('usage.promptsUsed', 'DESC')
      .limit(limit);

    if (startDate) {
      queryBuilder.andWhere('usage.updatedAt >= :startDate', { startDate });
    }

    const results = await queryBuilder.getRawMany<{
      usage_userId: string;
      usage_promptsUsed: number;
      usage_addonCredits: number;
      usage_adCredits: number;
      usage_purchasedCredits: number;
      user_email: string | null;
      user_firstName: string | null;
      user_lastName: string | null;
    }>();

    return results.map((row) => ({
      userId: row.usage_userId,
      email: row.user_email,
      firstName: row.user_firstName,
      lastName: row.user_lastName,
      promptsUsed: row.usage_promptsUsed,
      addonCredits: row.usage_addonCredits,
      adCredits: row.usage_adCredits,
      purchasedCredits: row.usage_purchasedCredits,
    }));
  }

  async getExhaustedUsers(): Promise<ExhaustedUserDto[]> {
    const usages = await this.promptUsageRepository.find({
      relations: ['user'],
    });

    if (usages.length === 0) {
      return [];
    }

    const userIds = usages.map((usage) => usage.userId);
    const subscriptions = await this.subscriptionRepository.find({
      where: { userId: In(userIds) },
    });

    const subscriptionByUserId = new Map<string, SubscriptionEntity>();
    subscriptions.forEach((sub) => {
      subscriptionByUserId.set(sub.userId, sub);
    });

    const exhausted: ExhaustedUserDto[] = [];

    for (const usage of usages) {
      const sub = subscriptionByUserId.get(usage.userId);
      const allowance =
        (sub?.plan === SubscriptionPlan.PRO ||
          sub?.plan === SubscriptionPlan.MONTHLY_UNLIMITED) &&
        sub?.status === SubscriptionStatus.ACTIVE
          ? 100
          : 10;

      const isExhausted =
        usage.promptsUsed >= allowance &&
        usage.addonCredits <= 0 &&
        usage.adCredits <= 0 &&
        usage.purchasedCredits <= 0;

      if (isExhausted) {
        exhausted.push({
          userId: usage.userId,
          email: usage.user?.email ?? null,
          firstName: usage.user?.firstName ?? null,
          lastName: usage.user?.lastName ?? null,
          promptsUsed: usage.promptsUsed,
          addonCredits: usage.addonCredits,
          adCredits: usage.adCredits,
          purchasedCredits: usage.purchasedCredits,
        });
      }
    }

    return exhausted;
  }

  async getPromptUsageByCountry(): Promise<PromptUsageByCountryDto[]> {
    const results = await this.promptUsageRepository
      .createQueryBuilder('usage')
      .leftJoin('user', 'user', 'user.id = usage.userId')
      .select('user.countryCode', 'countryCode')
      .addSelect('COALESCE(SUM(usage.promptsUsed), 0)', 'totalPrompts')
      .addSelect('COUNT(DISTINCT usage.userId)', 'userCount')
      .groupBy('user.countryCode')
      .getRawMany<{
        countryCode: string | null;
        totalPrompts: string;
        userCount: string;
      }>();

    return results.map((row) => {
      const totalPrompts = Number(row.totalPrompts);
      const userCount = Number(row.userCount);
      return {
        countryCode: row.countryCode,
        totalPromptsUsed: totalPrompts,
        userCount,
        avgPromptsPerUser: userCount > 0 ? totalPrompts / userCount : 0,
      };
    });
  }
}
