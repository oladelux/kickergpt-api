import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PromptUsageRepository } from './infrastructure/persistence/prompt-usage.repository';
import { PromptUsage } from './domain/prompt-usage';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';

@Injectable()
export class PromptUsageService {
  private readonly logger = new Logger(PromptUsageService.name);
  private static readonly FREE_MONTHLY_CREDITS = 10;
  private static readonly PRO_MONTHLY_CREDITS = 100;

  constructor(private readonly repository: PromptUsageRepository) {}

  async getUsage(userId: string): Promise<PromptUsage> {
    let usage = await this.repository.findByUserId(userId);
    if (!usage) {
      usage = await this.repository.create({
        userId,
        periodStart: this.calculateCurrentPeriodStart(),
      });
    }

    return this.ensureCurrentPeriod(usage);
  }

  async consumePromptCredit(params: {
    userId: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
  }): Promise<PromptUsage> {
    const amount = 1; // TODO: Implement amount
    if (amount <= 0) {
      throw new Error('Prompt amount must be positive');
    }

    let usage = await this.getUsage(params.userId);
    usage = await this.ensureCurrentPeriod(usage);

    const allowance = this.getMonthlyAllowance(params.plan, params.status);
    const monthlyRemaining = allowance - usage.promptsUsed;

    // Calculate total available credits
    const totalAvailable =
      usage.adCredits +
      usage.purchasedCredits +
      usage.addonCredits +
      monthlyRemaining;

    if (totalAvailable < amount) {
      throw new ForbiddenException({
        message: 'promptLimitReached',
      });
    }

    // Priority order: ad credits -> purchased credits -> addon credits -> monthly allowance
    let remaining = amount;
    const updates: Partial<PromptUsage> = {};

    // 1. Consume ad credits first
    const adCredits = usage.adCredits ?? 0;
    if (remaining > 0 && adCredits > 0) {
      const adPortion = Math.min(remaining, adCredits);
      updates.adCredits = adCredits - adPortion;
      remaining -= adPortion;
    }

    // 2. Consume purchased credits
    const purchasedCredits = usage.purchasedCredits ?? 0;
    if (remaining > 0 && purchasedCredits > 0) {
      const purchasedPortion = Math.min(remaining, purchasedCredits);
      updates.purchasedCredits = purchasedCredits - purchasedPortion;
      remaining -= purchasedPortion;
    }

    // 3. Consume addon credits
    const addonCredits = usage.addonCredits ?? 0;
    if (remaining > 0 && addonCredits > 0) {
      const addonPortion = Math.min(remaining, addonCredits);
      updates.addonCredits = addonCredits - addonPortion;
      remaining -= addonPortion;
    }

    // 4. Consume monthly allowance
    if (remaining > 0 && monthlyRemaining > 0) {
      const monthlyPortion = Math.min(remaining, monthlyRemaining);
      updates.promptsUsed = usage.promptsUsed + monthlyPortion;
      remaining -= monthlyPortion;
    }

    return this.repository.update(usage.id, updates);
  }

  async addAddonCredits(userId: string, credits: number): Promise<PromptUsage> {
    if (credits <= 0) {
      throw new Error('Addon credits must be positive');
    }

    const usage = await this.getUsage(userId);
    return this.repository.update(usage.id, {
      addonCredits: (usage.addonCredits ?? 0) + credits,
    });
  }

  async addAdCredits(
    userId: string,
    credits: number,
    adsWatchedToday: number,
    lastAdWatchedAt: Date,
  ): Promise<PromptUsage> {
    if (credits <= 0) {
      throw new Error('Ad credits must be positive');
    }

    const usage = await this.getUsage(userId);
    const today = new Date().toISOString().split('T')[0];

    return this.repository.update(usage.id, {
      adCredits: (usage.adCredits ?? 0) + credits,
      adsWatchedToday,
      lastAdWatchedAt,
      adsWatchDate: new Date(today),
    });
  }

  async addPurchasedCredits(
    userId: string,
    credits: number,
  ): Promise<PromptUsage> {
    if (credits <= 0) {
      throw new Error('Purchased credits must be positive');
    }

    const usage = await this.getUsage(userId);
    return this.repository.update(usage.id, {
      purchasedCredits: (usage.purchasedCredits ?? 0) + credits,
    });
  }

  async getUsageSummary(params: {
    userId: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
  }) {
    const usage = await this.getUsage(params.userId);
    const allowance = this.getMonthlyAllowance(params.plan, params.status);
    const remaining = Math.max(allowance - usage.promptsUsed, 0);

    const adCredits = usage.adCredits ?? 0;
    const purchasedCredits = usage.purchasedCredits ?? 0;
    const addonCredits = usage.addonCredits ?? 0;

    const totalCreditsRemaining =
      remaining + adCredits + purchasedCredits + addonCredits;

    return {
      monthlyAllowance: allowance,
      monthlyUsed: usage.promptsUsed,
      monthlyRemaining: remaining,
      adCreditsRemaining: adCredits,
      purchasedCreditsRemaining: purchasedCredits,
      addonCreditsRemaining: addonCredits,
      totalCreditsRemaining,
    };
  }

  private getMonthlyAllowance(
    plan: SubscriptionPlan,
    status: SubscriptionStatus,
  ): number {
    const normalizedPlan =
      plan === SubscriptionPlan.PRO && status === SubscriptionStatus.ACTIVE
        ? SubscriptionPlan.PRO
        : SubscriptionPlan.FREE;

    if (normalizedPlan === SubscriptionPlan.PRO) {
      return PromptUsageService.PRO_MONTHLY_CREDITS;
    }

    return PromptUsageService.FREE_MONTHLY_CREDITS;
  }

  private async ensureCurrentPeriod(usage: PromptUsage): Promise<PromptUsage> {
    const currentPeriod = this.calculateCurrentPeriodStart();

    if (usage.periodStart.getTime() === currentPeriod.getTime()) {
      return usage;
    }

    const updated = await this.repository.update(usage.id, {
      periodStart: currentPeriod,
      promptsUsed: 0,
    });

    return updated;
  }

  private calculateCurrentPeriodStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.repository.deleteByUserId(userId);
  }
}
