import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AllConfigType } from '../config/config.type';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';
import { PaymentProvider } from '../subscriptions/domain/payment-provider.enum';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { Subscription } from '../subscriptions/domain/subscription';
import { SubscriptionRepository } from '../subscriptions/infrastructure/persistence/subscription.repository';
import { MailService } from '../mail/mail.service';
import { Logger } from '@nestjs/common';

@Injectable()
export class StripeClientService {
  private readonly logger = new Logger(StripeClientService.name);
  private readonly client: Stripe;

  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usersService: UsersService,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly mailService: MailService,
  ) {
    this.client = new Stripe(
      this.configService.getOrThrow('stripe.secret', { infer: true }),
      {
        apiVersion: '2025-01-27.acacia',
      },
    );
  }

  createCustomer(params: Stripe.CustomerCreateParams) {
    return this.client.customers.create(params);
  }

  createCheckoutSession(params: Stripe.Checkout.SessionCreateParams) {
    return this.client.checkout.sessions.create(params);
  }

  getCustomerById(
    customerId: string,
  ): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return this.client.customers.retrieve(customerId);
  }

  constructWebhookEvent(
    payload: Buffer,
    signature: string | string[] | undefined,
  ) {
    if (!signature) {
      throw new Error('Missing stripe signature header');
    }
    return this.client.webhooks.constructEvent(
      payload,
      signature,
      this.configService.getOrThrow('stripe.webhookSecret', { infer: true }),
    );
  }

  retrieveSubscription(subscriptionId: string) {
    return this.client.subscriptions.retrieve(subscriptionId);
  }

  cancelSubscription(subscriptionId: string) {
    return this.client.subscriptions.cancel(subscriptionId);
  }

  cancelUserSubscription(userId: string) {
    return this.subscriptionsService.cancelSubscription(userId);
  }

  public async getUserId(
    metaUserId: string | null | undefined,
    stripeCustomerId: string,
  ): Promise<string | undefined> {
    if (metaUserId) {
      return metaUserId;
    }
    const activeSubscription =
      await this.subscriptionsService.getActiveSubscriptionByStripeCustomerId(
        stripeCustomerId,
      );

    if (activeSubscription) {
      return activeSubscription.userId;
    }

    const stripeCustomer = await this.getCustomerById(stripeCustomerId);
    if (!stripeCustomer.deleted) {
      const createdCustomer = stripeCustomer as Stripe.Customer;
      const metaUserId = createdCustomer.metadata.user_id;
      if (metaUserId) {
        return metaUserId;
      }
    }
    return undefined;
  }

  public async createStripeSubscription(
    userId: string,
    subscription: Stripe.Subscription,
    created: boolean,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
    if (subscription.status === 'canceled') {
      status = SubscriptionStatus.INACTIVE;
    }
    const userSubscription =
      await this.subscriptionsService.findByUserId(userId);
    if (!userSubscription) {
      const domain = new Subscription();
      domain.user = user;
      domain.userId = user.id;
      domain.plan = SubscriptionPlan.FREE;
      domain.status = status;
      domain.paymentProvider = PaymentProvider.STRIPE;
      domain.stripeCustomerId = subscription.customer as string;
      domain.stripeSubscriptionId = subscription.id;
      domain.paystackCustomerCode = null;
      domain.paystackSubscriptionCode = null;
      domain.currentPeriodEnd = null;

      await this.subscriptionRepository.create(domain);
      return;
    } else {
      if (
        userSubscription.stripeSubscriptionId &&
        userSubscription.stripeSubscriptionId !== subscription.id &&
        created
      ) {
        await this.cancelSubscription(userSubscription.stripeSubscriptionId);
      }
      const payload: Partial<Omit<Subscription, 'id'>> = {
        status,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        plan:
          status === SubscriptionStatus.ACTIVE
            ? SubscriptionPlan.PRO
            : SubscriptionPlan.FREE,
        paymentProvider: PaymentProvider.STRIPE,
      };

      await this.subscriptionsService.updateUserSubscription(userId, payload);

      // Send PRO welcome email if subscription is now PRO and ACTIVE
      if (
        payload.plan === SubscriptionPlan.PRO &&
        payload.status === SubscriptionStatus.ACTIVE &&
        user.email
      ) {
        try {
          const userName =
            user.firstName?.trim() || user.lastName?.trim() || 'there';
          await this.mailService.sendProWelcomeEmail({
            to: user.email,
            name: userName,
          });
          this.logger.log(`PRO welcome email sent to ${user.email}`);
        } catch (error) {
          this.logger.warn(
            `Failed to send PRO welcome email to ${user.email}: ${error}`,
          );
          // Don't throw - email failure shouldn't break subscription flow
        }
      }
    }
  }
}
