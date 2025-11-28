import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AllConfigType } from '../config/config.type';
import { UsersService } from '../users/users.service';
import { User } from '../users/domain/user';
import { SubscriptionRepository } from './infrastructure/persistence/subscription.repository';
import { Subscription } from './domain/subscription';
import { SubscriptionPlan } from './domain/subscription-plan.enum';
import { SubscriptionStatus } from './domain/subscription-status.enum';
import { StripeClientService } from '../stripe/stripe-client.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly usersService: UsersService,
    private readonly stripeClient: StripeClientService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async ensureStripeCustomerForUser(user: User): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findByUserId(
      user.id,
    );

    if (subscription?.stripeCustomerId) {
      return subscription;
    }

    const customer = await this.stripeClient.createCustomer({
      email: user.email ?? undefined,
      name: this.buildCustomerName(user),
      metadata: {
        user_id: user.id,
      },
    });

    if (subscription) {
      return this.subscriptionRepository.update(subscription.id, {
        stripeCustomerId: customer.id,
      });
    }

    const domain = new Subscription();
    domain.user = user;
    domain.userId = user.id;
    domain.plan = SubscriptionPlan.FREE;
    domain.status = SubscriptionStatus.ACTIVE;
    domain.stripeCustomerId = customer.id;
    domain.stripeSubscriptionId = null;
    domain.currentPeriodEnd = null;

    return this.subscriptionRepository.create(domain);
  }

  async getSubscriptionForUser(userId: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findByUserId(userId);

    if (subscription?.stripeCustomerId) {
      return subscription;
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.ensureStripeCustomerForUser(user);
  }

  async handlePlanSelection(
    userId: string,
    plan: SubscriptionPlan,
    countryCode?: string,
  ): Promise<string | null> {
    const subscription = await this.getSubscriptionForUser(userId);

    if (plan === SubscriptionPlan.FREE) {
      await this.subscriptionRepository.updatePlanAndStatus(subscription.id, {
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      });
      return null;
    }

    if (
      subscription.plan === SubscriptionPlan.PRO &&
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.stripeSubscriptionId
    ) {
      throw new BadRequestException('Subscription already active');
    }

    if (!subscription.stripeCustomerId) {
      throw new InternalServerErrorException('Stripe customer missing');
    }

    const priceId = this.getPriceIdByCountry(countryCode);
    const successUrl = this.configService.getOrThrow('stripe.successUrl', {
      infer: true,
    });
    const cancelUrl = this.configService.getOrThrow('stripe.cancelUrl', {
      infer: true,
    });

    const session = await this.stripeClient.createCheckoutSession({
      customer: subscription.stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      metadata: {
        user_id: userId,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new InternalServerErrorException('Stripe session missing url');
    }

    return session.url;
  }

  async handleStripeSubscriptionEvent(
    stripeSubscription: Stripe.Subscription,
  ): Promise<void> {
    const stripeCustomerId = this.resolveStripeCustomerId(
      stripeSubscription.customer,
    );

    if (!stripeCustomerId) {
      this.logger.warn('Unable to resolve stripe customer id from event');
      return;
    }

    const subscription =
      await this.subscriptionRepository.findByStripeCustomerId(
        stripeCustomerId,
      );

    if (!subscription) {
      this.logger.warn(
        `Subscription not found for stripe customer ${stripeCustomerId}`,
      );
      return;
    }

    const isActive = this.isStripeStatusActive(stripeSubscription.status);

    await this.subscriptionRepository.updatePlanAndStatus(subscription.id, {
      plan: isActive ? SubscriptionPlan.PRO : SubscriptionPlan.FREE,
      status: isActive
        ? SubscriptionStatus.ACTIVE
        : SubscriptionStatus.INACTIVE,
      stripeSubscriptionId: isActive ? stripeSubscription.id : null,
      currentPeriodEnd:
        isActive && stripeSubscription.current_period_end
          ? new Date(stripeSubscription.current_period_end * 1000)
          : null,
    });
  }

  private buildCustomerName(user: User): string | undefined {
    const name = [user.firstName, user.lastName]
      .filter((value) => !!value)
      .join(' ')
      .trim();

    return name.length ? name : undefined;
  }

  private resolveStripeCustomerId(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): string | null {
    if (!customer) {
      return null;
    }

    if (typeof customer === 'string') {
      return customer;
    }

    if ('id' in customer) {
      return customer.id;
    }

    return null;
  }

  private isStripeStatusActive(status: Stripe.Subscription.Status): boolean {
    return status === 'active' || status === 'trialing';
  }

  /**
   * Get the appropriate Stripe price ID based on user's country code.
   * - US: USD price
   * - European countries: EUR price
   * - Nigeria: NGN price
   * - United Kingdom: GBP price
   * - Default: USD price
   */
  private getPriceIdByCountry(countryCode?: string): string {
    if (!countryCode) {
      return this.configService.getOrThrow('stripe.proPriceIdUsd', {
        infer: true,
      });
    }

    const normalizedCountry = countryCode.toUpperCase();

    // Nigeria
    if (normalizedCountry === 'NG') {
      return this.configService.getOrThrow('stripe.proPriceIdNgn', {
        infer: true,
      });
    }

    // Nigeria
    if (normalizedCountry === 'GB') {
      return this.configService.getOrThrow('stripe.proPriceIdGbp', {
        infer: true,
      });
    }

    // European countries using EUR
    const europeanCountries = [
      'AT', // Austria
      'BE', // Belgium
      'CY', // Cyprus
      'EE', // Estonia
      'FI', // Finland
      'FR', // France
      'DE', // Germany
      'GR', // Greece
      'IE', // Ireland
      'IT', // Italy
      'LV', // Latvia
      'LT', // Lithuania
      'LU', // Luxembourg
      'MT', // Malta
      'NL', // Netherlands
      'PT', // Portugal
      'SK', // Slovakia
      'SI', // Slovenia
      'ES', // Spain
    ];

    if (europeanCountries.includes(normalizedCountry)) {
      return this.configService.getOrThrow('stripe.proPriceIdEur', {
        infer: true,
      });
    }

    // United States
    if (normalizedCountry === 'US') {
      return this.configService.getOrThrow('stripe.proPriceIdUsd', {
        infer: true,
      });
    }

    // Default to USD for all other countries
    return this.configService.getOrThrow('stripe.proPriceIdUsd', {
      infer: true,
    });
  }
}
