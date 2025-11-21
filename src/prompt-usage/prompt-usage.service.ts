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

    if (monthlyRemaining >= amount) {
      return this.repository.update(usage.id, {
        promptsUsed: usage.promptsUsed + amount,
      });
    }

    const addonAvailable = usage.addonCredits;
    if (monthlyRemaining + addonAvailable < amount) {
      throw new ForbiddenException({
        message: 'promptLimitReached',
      });
    }

    const monthlyPortion = Math.max(monthlyRemaining, 0);
    const addonPortion = amount - monthlyPortion;

    return this.repository.update(usage.id, {
      promptsUsed: usage.promptsUsed + monthlyPortion,
      addonCredits: usage.addonCredits - addonPortion,
    });
  }

  async addAddonCredits(userId: string, credits: number): Promise<PromptUsage> {
    if (credits <= 0) {
      throw new Error('Addon credits must be positive');
    }

    const usage = await this.getUsage(userId);
    return this.repository.update(usage.id, {
      addonCredits: usage.addonCredits + credits,
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

    return {
      monthlyAllowance: allowance,
      monthlyUsed: usage.promptsUsed,
      monthlyRemaining: remaining,
      addonCreditsRemaining: usage.addonCredits,
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
}
