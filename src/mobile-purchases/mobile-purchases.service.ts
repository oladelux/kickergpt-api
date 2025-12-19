import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PromptUsageService } from '../prompt-usage/prompt-usage.service';
import { MobilePurchaseRepository } from './infrastructure/persistence/relational/repositories/mobile-purchase.repository';
import { AllConfigType } from '../config/config.type';
import { VerifyMobilePurchaseResponseDto } from './dto/verify-mobile-purchase-response.dto';
import { SyncPurchasesResponseDto } from './dto/sync-purchases-response.dto';

@Injectable()
export class MobilePurchasesService {
  private readonly logger = new Logger(MobilePurchasesService.name);

  // Product ID to credits mapping
  private readonly PRODUCT_CREDITS_MAP: Record<string, number> = {
    credits_10: 10,
    credits_50: 50,
    credits_100: 100,
  };

  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly promptUsageService: PromptUsageService,
    private readonly mobilePurchaseRepository: MobilePurchaseRepository,
  ) {}

  async verifyAndGrantPurchase(
    userId: string,
    productId: string,
    transactionId: string,
    platform: 'android' | 'ios',
  ): Promise<VerifyMobilePurchaseResponseDto> {
    // Check if transaction already processed
    const existingPurchase =
      await this.mobilePurchaseRepository.findByTransactionId(transactionId);

    if (existingPurchase) {
      throw new ConflictException({
        message: 'transactionAlreadyProcessed',
        transactionId,
      });
    }

    // Map product ID to credits
    const creditsGranted = this.PRODUCT_CREDITS_MAP[productId];
    if (!creditsGranted) {
      throw new BadRequestException({
        message: 'invalidProductId',
        productId,
      });
    }

    // Verify purchase with platform
    let rawReceipt: string | null = null;
    if (platform === 'android') {
      rawReceipt = await this.verifyAndroidPurchase(productId, transactionId);
    } else if (platform === 'ios') {
      // iOS verification would go here
      // For now, we'll log a warning
      this.logger.warn('iOS purchase verification not yet implemented');
    }

    // Grant credits
    const updatedUsage = await this.promptUsageService.addPurchasedCredits(
      userId,
      creditsGranted,
    );

    // Store purchase record
    await this.mobilePurchaseRepository.create({
      userId,
      productId,
      transactionId,
      platform,
      creditsGranted,
      purchaseDate: new Date(),
      verifiedAt: new Date(),
      rawReceipt,
    });

    // Calculate total credits
    const totalCredits =
      (updatedUsage.purchasedCredits ?? 0) +
      (updatedUsage.adCredits ?? 0) +
      (updatedUsage.addonCredits ?? 0);

    this.logger.log(
      `Granted ${creditsGranted} purchased credits to user ${userId}. Transaction: ${transactionId}`,
    );

    return {
      success: true,
      creditsGranted,
      transactionId,
      newBalance: {
        purchasedCreditsRemaining: updatedUsage.purchasedCredits ?? 0,
        totalCreditsRemaining: totalCredits,
      },
    };
  }

  async syncPurchases(userId: string): Promise<SyncPurchasesResponseDto> {
    // TODO: Implement RevenueCat sync
    // For now, return a placeholder response
    this.logger.log(`Syncing purchases for user ${userId}`);

    return Promise.resolve({
      success: true,
      purchasesSynced: 0,
      creditsAdded: 0,
    });
  }

  private async verifyAndroidPurchase(
    productId: string,
    purchaseToken: string,
  ): Promise<string> {
    try {
      const packageName = this.configService.getOrThrow(
        'googlePlay.packageName',
        {
          infer: true,
        },
      );
      const serviceAccountKey = this.configService.getOrThrow(
        'googlePlay.serviceAccountKey',
        { infer: true },
      );

      // Initialize Google Auth
      const auth = new google.auth.GoogleAuth({
        keyFile: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });

      const androidPublisher = google.androidpublisher({
        version: 'v3',
        auth: auth,
      });

      // Verify the purchase
      const result = await androidPublisher.purchases.products.get({
        packageName,
        productId,
        token: purchaseToken,
      });

      // Check purchase state (0 = purchased, 1 = canceled)
      if (result.data.purchaseState !== 0) {
        throw new BadRequestException({
          message: 'purchaseNotValid',
          state: result.data.purchaseState,
        });
      }

      // Check consumption state (0 = not consumed, 1 = consumed)
      // We want to ensure it's consumed after granting credits
      if (result.data.consumptionState === 1) {
        throw new ConflictException({
          message: 'purchaseAlreadyConsumed',
        });
      }

      // Acknowledge/consume the purchase
      await androidPublisher.purchases.products.acknowledge({
        packageName,
        productId,
        token: purchaseToken,
      });

      this.logger.log(
        `Successfully verified Android purchase: ${productId}, token: ${purchaseToken.substring(0, 20)}...`,
      );

      return JSON.stringify(result.data);
    } catch (error) {
      this.logger.error(
        `Failed to verify Android purchase: ${error.message}`,
        error.stack,
      );

      // In development, we might want to allow unverified purchases
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn(
          'Development mode: Allowing unverified purchase. DO NOT USE IN PRODUCTION!',
        );
        return JSON.stringify({ dev_mode: true });
      }

      throw new BadRequestException({
        message: 'purchaseVerificationFailed',
        error: error.message,
      });
    }
  }
}
