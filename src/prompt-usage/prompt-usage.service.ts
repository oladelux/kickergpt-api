import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PromptUsageRepository } from './infrastructure/persistence/prompt-usage.repository';
import { PromptUsage } from './domain/prompt-usage';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';
import { UsersService } from '../users/users.service';

@Injectable()
export class PromptUsageService {
  private readonly logger = new Logger(PromptUsageService.name);
  private static readonly FREE_MONTHLY_CREDITS = 10;
  private static readonly PRO_MONTHLY_CREDITS = 100;
  private static readonly NIGERIAN_FREE_MONTHLY_CREDITS = 3;

  constructor(
    private readonly repository: PromptUsageRepository,
    private readonly usersService: UsersService,
  ) {}

  async getUsage(userId: string): Promise<PromptUsage> {
    const usage = await this.repository.findOrCreate({
      userId,
      periodStart: this.calculateCurrentPeriodStart(),
    });

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

    // Fetch user to check countryCode
    const user = await this.usersService.findById(params.userId);
    const countryCode = user?.countryCode;

    // Check if user is Nigerian with unlimited prompts (PRO or MONTHLY_UNLIMITED)
    const isNigerianUnlimited =
      countryCode?.toUpperCase() === 'NG' &&
      (params.plan === SubscriptionPlan.PRO ||
        params.plan === SubscriptionPlan.MONTHLY_UNLIMITED) &&
      params.status === SubscriptionStatus.ACTIVE;

    const allowance = this.getMonthlyAllowance(
      params.plan,
      params.status,
      countryCode,
    );
    const monthlyRemaining = allowance - usage.promptsUsed;

    // Calculate total available credits
    const totalAvailable =
      usage.adCredits +
      usage.purchasedCredits +
      usage.addonCredits +
      monthlyRemaining;

    // Skip limit check for Nigerian unlimited users (PRO or MONTHLY_UNLIMITED)
    if (!isNigerianUnlimited && totalAvailable < amount) {
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

    // 4. Consume monthly allowance (or track usage for unlimited users)
    if (remaining > 0) {
      if (isNigerianUnlimited) {
        // For unlimited users, always track usage even without consuming from allowance
        updates.promptsUsed = usage.promptsUsed + remaining;
        remaining = 0;
      } else if (monthlyRemaining > 0) {
        const monthlyPortion = Math.min(remaining, monthlyRemaining);
        updates.promptsUsed = usage.promptsUsed + monthlyPortion;
        remaining -= monthlyPortion;
      }
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

    // Fetch user to check countryCode
    const user = await this.usersService.findById(params.userId);
    const countryCode = user?.countryCode;

    // Migrate existing Nigerian FREE users if needed
    if (
      countryCode?.toUpperCase() === 'NG' &&
      params.plan === SubscriptionPlan.FREE &&
      usage.promptsUsed > 3
    ) {
      await this.migrateNigerianFreeUserPrompts(params.userId, usage);
      // Re-fetch usage after migration
      const updatedUsage = await this.repository.findByUserId(params.userId);
      if (updatedUsage) {
        usage.promptsUsed = updatedUsage.promptsUsed;
      }
    }

    // Check if user is Nigerian with unlimited prompts (PRO or MONTHLY_UNLIMITED)
    const isNigerianUnlimited =
      countryCode?.toUpperCase() === 'NG' &&
      (params.plan === SubscriptionPlan.PRO ||
        params.plan === SubscriptionPlan.MONTHLY_UNLIMITED) &&
      params.status === SubscriptionStatus.ACTIVE;

    const allowance = this.getMonthlyAllowance(
      params.plan,
      params.status,
      countryCode,
    );
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
      isUnlimited: isNigerianUnlimited,
    };
  }

  private getMonthlyAllowance(
    plan: SubscriptionPlan,
    status: SubscriptionStatus,
    countryCode?: string | null,
  ): number {
    const normalizedPlan =
      plan === SubscriptionPlan.PRO && status === SubscriptionStatus.ACTIVE
        ? SubscriptionPlan.PRO
        : SubscriptionPlan.FREE;

    if (normalizedPlan === SubscriptionPlan.PRO) {
      return PromptUsageService.PRO_MONTHLY_CREDITS;
    }

    // Nigerian FREE users get 3 prompts instead of 10
    if (countryCode?.toUpperCase() === 'NG') {
      return PromptUsageService.NIGERIAN_FREE_MONTHLY_CREDITS;
    }

    return PromptUsageService.FREE_MONTHLY_CREDITS;
  }

  /**
   * Migrate existing Nigerian FREE users' prompts to new limit.
   * If they used 0-7 prompts: reset to 0 used (3 remaining)
   * If they used 8-10 prompts: set to 3 used (0 remaining)
   */
  private async migrateNigerianFreeUserPrompts(
    userId: string,
    usage: PromptUsage,
  ): Promise<void> {
    if (usage.promptsUsed <= 7) {
      // Reset to 0 used, giving them 3 remaining
      await this.repository.update(usage.id, {
        promptsUsed: 0,
      });
      this.logger.log(
        `Migrated Nigerian FREE user ${userId}: Reset promptsUsed from ${usage.promptsUsed} to 0 (3 remaining)`,
      );
    } else if (usage.promptsUsed >= 8) {
      // Set to 3 used, giving them 0 remaining
      await this.repository.update(usage.id, {
        promptsUsed: 3,
      });
      this.logger.log(
        `Migrated Nigerian FREE user ${userId}: Set promptsUsed from ${usage.promptsUsed} to 3 (0 remaining)`,
      );
    }
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

  async resetPromptsUsed(userId: string): Promise<PromptUsage> {
    const usage = await this.getUsage(userId);
    return this.repository.update(usage.id, {
      promptsUsed: 0,
    });
  }
}
