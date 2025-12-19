import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromptUsageService } from '../prompt-usage/prompt-usage.service';
import { AllConfigType } from '../config/config.type';
import { AdRewardResponseDto } from './dto/ad-reward-response.dto';

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private readonly promptUsageService: PromptUsageService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async grantAdReward(
    userId: string,
    creditsEarned: number,
  ): Promise<AdRewardResponseDto> {
    const maxAdsPerDay = this.configService.getOrThrow('ads.maxAdsPerDay', {
      infer: true,
    });
    const adCooldownMinutes = this.configService.getOrThrow(
      'ads.adCooldownMinutes',
      { infer: true },
    );
    const creditsPerAd = this.configService.getOrThrow('ads.creditsPerAd', {
      infer: true,
    });

    // Validate credits earned
    if (creditsEarned !== creditsPerAd) {
      throw new BadRequestException(
        `Invalid credits amount. Expected ${creditsPerAd}, got ${creditsEarned}`,
      );
    }

    // Get user's current usage
    const usage = await this.promptUsageService.getUsage(userId);

    // Check if we need to reset daily counter
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const lastWatchDate = usage.adsWatchDate
      ? new Date(usage.adsWatchDate).toISOString().split('T')[0]
      : null;

    let adsWatchedToday = usage.adsWatchedToday ?? 0;
    if (lastWatchDate !== today) {
      adsWatchedToday = 0;
    }

    // Check daily limit
    if (adsWatchedToday >= maxAdsPerDay) {
      throw new ForbiddenException({
        message: 'dailyAdLimitReached',
        maxAdsPerDay,
      });
    }

    // Check cooldown
    if (usage.lastAdWatchedAt) {
      const lastWatchTime = new Date(usage.lastAdWatchedAt).getTime();
      const cooldownMs = adCooldownMinutes * 60 * 1000;
      const timeSinceLastAd = now.getTime() - lastWatchTime;

      if (timeSinceLastAd < cooldownMs) {
        const nextAvailableTime = new Date(lastWatchTime + cooldownMs);
        throw new ForbiddenException({
          message: 'adCooldownActive',
          nextAdAvailable: nextAvailableTime.toISOString(),
          cooldownMinutes: adCooldownMinutes,
        });
      }
    }

    // Grant credits
    const updatedUsage = await this.promptUsageService.addAdCredits(
      userId,
      creditsEarned,
      adsWatchedToday + 1,
      now,
    );

    // Calculate next ad availability
    const nextAdTime = new Date(now.getTime() + adCooldownMinutes * 60 * 1000);
    const nextAdAvailable =
      adsWatchedToday + 1 >= maxAdsPerDay ? null : nextAdTime.toISOString();

    // Calculate total credits
    const totalCredits =
      (updatedUsage.adCredits ?? 0) +
      (updatedUsage.purchasedCredits ?? 0) +
      (updatedUsage.addonCredits ?? 0);

    this.logger.log(
      `Granted ${creditsEarned} ad credits to user ${userId}. New balance: ${updatedUsage.adCredits} ad credits, ${totalCredits} total`,
    );

    return {
      success: true,
      creditsGranted: creditsEarned,
      newBalance: {
        adCreditsRemaining: updatedUsage.adCredits ?? 0,
        totalCreditsRemaining: totalCredits,
      },
      nextAdAvailable,
    };
  }
}
