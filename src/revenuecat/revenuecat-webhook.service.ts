import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../config/config.type';
import { RevenueCatEventRepository } from './infrastructure/persistence/revenuecat-event.repository';
import { SubscriptionRepository } from '../subscriptions/infrastructure/persistence/subscription.repository';
import { PromptUsageService } from '../prompt-usage/prompt-usage.service';
import { RevenueCatWebhookRequestDto } from './dto/revenuecat-webhook-event.dto';
import { RevenueCatEventType } from './domain/revenuecat-event-type.enum';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';
import { PaymentProvider } from '../subscriptions/domain/payment-provider.enum';

@Injectable()
export class RevenueCatWebhookService {
  private readonly logger = new Logger(RevenueCatWebhookService.name);

  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly revenueCatEventRepository: RevenueCatEventRepository,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly promptUsageService: PromptUsageService,
  ) {}

  verifyWebhookSignature(authHeader: string | undefined): boolean {
    if (!authHeader) {
      return false;
    }

    const expectedSecret = this.configService.getOrThrow(
      'revenuecat.webhookSecret',
      { infer: true },
    );

    // RevenueCat sends: "Bearer YOUR_WEBHOOK_SECRET"
    const token = authHeader.replace('Bearer ', '');
    return token === expectedSecret;
  }

  async processWebhookEvent(
    payload: RevenueCatWebhookRequestDto,
  ): Promise<{ success: boolean; message: string }> {
    const event = payload.event;

    // Generate transaction ID if not provided
    const transactionId =
      event.transaction_id ??
      `${event.type}_${event.app_user_id}_${Date.now()}`;

    // Check idempotency
    const existingEvent =
      await this.revenueCatEventRepository.findByTransactionId(transactionId);
    if (existingEvent) {
      this.logger.log(
        `Event already processed: ${transactionId}, type: ${event.type}`,
      );
      return {
        success: true,
        message: 'Event already processed',
      };
    }

    // Find or create subscription for user
    const subscription = await this.subscriptionRepository.findByUserId(
      event.app_user_id,
    );

    if (!subscription) {
      this.logger.warn(
        `Subscription not found for user ${event.app_user_id}, event will be logged but not processed`,
      );
      throw new NotFoundException(
        `Subscription not found for user ${event.app_user_id}`,
      );
    }

    // Process event based on type
    await this.handleEventType(event, subscription.id);

    // Store event for audit
    await this.revenueCatEventRepository.create({
      eventType: this.mapEventType(event.type),
      userId: event.app_user_id,
      transactionId,
      productId: event.product_id ?? null,
      entitlementIds: event.entitlement_ids ?? null,
      expirationAt: event.expiration_at_ms
        ? new Date(event.expiration_at_ms)
        : null,
      store: event.store ?? null,
      rawData: payload as any,
      processedAt: new Date(),
    });

    this.logger.log(
      `Successfully processed RevenueCat event: ${event.type} for user ${event.app_user_id}`,
    );

    return {
      success: true,
      message: 'Webhook processed successfully',
    };
  }

  private async handleEventType(
    event: any,
    subscriptionId: string,
  ): Promise<void> {
    const eventType = this.mapEventType(event.type);

    switch (eventType) {
      case RevenueCatEventType.INITIAL_PURCHASE:
      case RevenueCatEventType.RENEWAL:
      case RevenueCatEventType.UNCANCELLATION:
        await this.handleSubscriptionActivation(event, subscriptionId);
        break;

      case RevenueCatEventType.CANCELLATION:
        await this.handleCancellation(event, subscriptionId);
        break;

      case RevenueCatEventType.EXPIRATION:
        await this.handleExpiration(event, subscriptionId);
        break;

      case RevenueCatEventType.BILLING_ISSUE:
        await this.handleBillingIssue(event, subscriptionId);
        break;

      case RevenueCatEventType.PRODUCT_CHANGE:
        await this.handleProductChange(event, subscriptionId);
        break;

      default:
        this.logger.warn(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleSubscriptionActivation(
    event: any,
    subscriptionId: string,
  ): Promise<void> {
    const expirationDate = event.expiration_at_ms
      ? new Date(event.expiration_at_ms)
      : null;

    await this.subscriptionRepository.update(subscriptionId, {
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      paymentProvider: PaymentProvider.REVENUECAT,
      revenuecatUserId: event.app_user_id,
      revenuecatProductId: event.product_id,
      revenuecatAutoRenew: true,
      currentPeriodEnd: expirationDate,
      // Clear other payment providers
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      paystackCustomerCode: null,
      paystackSubscriptionCode: null,
    });

    // Reset usage for renewal
    if (event.type === 'RENEWAL') {
      const renewalSubscription =
        await this.subscriptionRepository.findByUserId(event.app_user_id);
      if (renewalSubscription) {
        await this.promptUsageService.getUsage(renewalSubscription.userId);
      }
    }

    this.logger.log(`Activated PRO subscription for user ${event.app_user_id}`);
  }

  private async handleCancellation(
    event: any,
    subscriptionId: string,
  ): Promise<void> {
    await this.subscriptionRepository.update(subscriptionId, {
      revenuecatAutoRenew: false,
    });

    this.logger.log(
      `Marked subscription as non-renewing for user ${event.app_user_id}`,
    );
  }

  private async handleExpiration(
    event: any,
    subscriptionId: string,
  ): Promise<void> {
    await this.subscriptionRepository.update(subscriptionId, {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.INACTIVE,
      revenuecatAutoRenew: false,
      currentPeriodEnd: null,
    });

    this.logger.log(
      `Expired subscription for user ${event.app_user_id}, reverted to FREE`,
    );
  }

  private async handleBillingIssue(
    event: any,
    subscriptionId: string,
  ): Promise<void> {
    // Mark subscription as INACTIVE due to billing issue
    await this.subscriptionRepository.update(subscriptionId, {
      status: SubscriptionStatus.INACTIVE,
    });

    this.logger.warn(
      `Billing issue for user ${event.app_user_id}, marked as INACTIVE`,
    );
  }

  private async handleProductChange(
    event: any,
    subscriptionId: string,
  ): Promise<void> {
    await this.subscriptionRepository.update(subscriptionId, {
      revenuecatProductId: event.product_id,
    });

    this.logger.log(
      `Product changed to ${event.product_id} for user ${event.app_user_id}`,
    );
  }

  private mapEventType(type: string): RevenueCatEventType {
    switch (type) {
      case 'INITIAL_PURCHASE':
        return RevenueCatEventType.INITIAL_PURCHASE;
      case 'RENEWAL':
        return RevenueCatEventType.RENEWAL;
      case 'CANCELLATION':
        return RevenueCatEventType.CANCELLATION;
      case 'EXPIRATION':
        return RevenueCatEventType.EXPIRATION;
      case 'BILLING_ISSUE':
        return RevenueCatEventType.BILLING_ISSUE;
      case 'PRODUCT_CHANGE':
        return RevenueCatEventType.PRODUCT_CHANGE;
      case 'REFUND':
        return RevenueCatEventType.REFUND;
      case 'UNCANCELLATION':
        return RevenueCatEventType.UNCANCELLATION;
      default:
        this.logger.warn(`Unknown event type: ${type}`);
        return type as RevenueCatEventType;
    }
  }
}
