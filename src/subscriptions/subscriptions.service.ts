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
import { PaymentProvider } from './domain/payment-provider.enum';
import { StripeClientService } from '../stripe/stripe-client.service';
import { PaystackClientService } from '../paystack/paystack-client.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly usersService: UsersService,
    private readonly stripeClient: StripeClientService,
    private readonly paystackClient: PaystackClientService,
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
        paymentProvider: PaymentProvider.STRIPE,
      });
    }

    const domain = new Subscription();
    domain.user = user;
    domain.userId = user.id;
    domain.plan = SubscriptionPlan.FREE;
    domain.status = SubscriptionStatus.ACTIVE;
    domain.paymentProvider = PaymentProvider.STRIPE;
    domain.stripeCustomerId = customer.id;
    domain.stripeSubscriptionId = null;
    domain.paystackCustomerCode = null;
    domain.paystackSubscriptionCode = null;
    domain.currentPeriodEnd = null;

    return this.subscriptionRepository.create(domain);
  }

  async ensurePaystackCustomerForUser(user: User): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findByUserId(
      user.id,
    );

    if (subscription?.paystackCustomerCode) {
      return subscription;
    }

    const customerResponse = await this.paystackClient.createCustomer({
      email: user.email ?? '',
      first_name: user.firstName ?? undefined,
      last_name: user.lastName ?? undefined,
      metadata: {
        user_id: user.id,
      },
    });

    if (subscription) {
      return this.subscriptionRepository.update(subscription.id, {
        paystackCustomerCode: customerResponse.data.customer_code,
        paymentProvider: PaymentProvider.PAYSTACK,
      });
    }

    const domain = new Subscription();
    domain.user = user;
    domain.userId = user.id;
    domain.plan = SubscriptionPlan.FREE;
    domain.status = SubscriptionStatus.ACTIVE;
    domain.paymentProvider = PaymentProvider.PAYSTACK;
    domain.stripeCustomerId = null;
    domain.stripeSubscriptionId = null;
    domain.paystackCustomerCode = customerResponse.data.customer_code;
    domain.paystackSubscriptionCode = null;
    domain.currentPeriodEnd = null;

    return this.subscriptionRepository.create(domain);
  }

  async getSubscriptionForUser(userId: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findByUserId(userId);

    if (subscription?.stripeCustomerId || subscription?.paystackCustomerCode) {
      return subscription;
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // For new users without a subscription, we'll create one when they select a plan
    // For now, return a default subscription
    if (subscription) {
      return subscription;
    }

    // Create a default free subscription without payment provider
    const domain = new Subscription();
    domain.user = user;
    domain.userId = user.id;
    domain.plan = SubscriptionPlan.FREE;
    domain.status = SubscriptionStatus.ACTIVE;
    domain.paymentProvider = PaymentProvider.STRIPE; // Default, will be updated on plan selection
    domain.stripeCustomerId = null;
    domain.stripeSubscriptionId = null;
    domain.paystackCustomerCode = null;
    domain.paystackSubscriptionCode = null;
    domain.currentPeriodEnd = null;

    return this.subscriptionRepository.create(domain);
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
      (subscription.stripeSubscriptionId ||
        subscription.paystackSubscriptionCode)
    ) {
      throw new BadRequestException('Subscription already active');
    }

    // Determine payment provider based on country
    const paymentProvider = this.determinePaymentProvider(countryCode);
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Route to appropriate payment provider
    if (paymentProvider === PaymentProvider.PAYSTACK) {
      return this.handlePaystackPlanSelection(user, subscription, countryCode);
    } else {
      return this.handleStripePlanSelection(user, subscription, countryCode);
    }
  }

  private async handleStripePlanSelection(
    user: User,
    subscription: Subscription,
    countryCode?: string,
  ): Promise<string> {
    // Ensure Stripe customer exists
    if (!subscription.stripeCustomerId) {
      subscription = await this.ensureStripeCustomerForUser(user);
    }

    const priceId = this.getPriceIdByCountry(countryCode);
    const successUrl = this.configService.getOrThrow('stripe.successUrl', {
      infer: true,
    });
    const cancelUrl = this.configService.getOrThrow('stripe.cancelUrl', {
      infer: true,
    });

    const session = await this.stripeClient.createCheckoutSession({
      customer: subscription.stripeCustomerId!,
      mode: 'subscription',
      payment_method_types: ['card'],
      metadata: {
        user_id: user.id,
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

  private async handlePaystackPlanSelection(
    user: User,
    subscription: Subscription,
    countryCode?: string,
  ): Promise<string> {
    // Ensure Paystack customer exists
    if (!subscription.paystackCustomerCode) {
      subscription = await this.ensurePaystackCustomerForUser(user);
    }

    const planCode = this.getPaystackPlanCodeByCountry(countryCode);
    const successUrl = this.configService.getOrThrow('paystack.successUrl', {
      infer: true,
    });

    const transactionResponse = await this.paystackClient.initializeTransaction(
      {
        email: user.email ?? '',
        amount: 0, // Amount is determined by the plan
        plan: planCode,
        customer: subscription.paystackCustomerCode!,
        metadata: {
          user_id: user.id,
        },
        callback_url: successUrl,
      },
    );

    if (!transactionResponse.data.authorization_url) {
      throw new InternalServerErrorException(
        'Paystack authorization url missing',
      );
    }

    return transactionResponse.data.authorization_url;
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

  async handlePaystackSubscriptionEvent(eventData: any): Promise<void> {
    const customerCode = eventData.customer?.customer_code;
    const subscriptionCode = eventData.subscription_code;

    if (!customerCode) {
      this.logger.warn('Unable to resolve paystack customer code from event');
      return;
    }

    const subscription =
      await this.subscriptionRepository.findByPaystackCustomerCode(
        customerCode,
      );

    if (!subscription) {
      this.logger.warn(
        `Subscription not found for paystack customer ${customerCode}`,
      );
      return;
    }

    const status = eventData.status;
    const isActive = status === 'active' || status === 'complete';

    await this.subscriptionRepository.update(subscription.id, {
      plan: isActive ? SubscriptionPlan.PRO : SubscriptionPlan.FREE,
      status: isActive
        ? SubscriptionStatus.ACTIVE
        : SubscriptionStatus.INACTIVE,
      paystackSubscriptionCode: isActive ? subscriptionCode : null,
      currentPeriodEnd:
        isActive && eventData.next_payment_date
          ? new Date(eventData.next_payment_date)
          : null,
    });
  }

  async handlePaystackChargeSuccessEvent(eventData: any): Promise<void> {
    const customerCode = eventData.customer?.customer_code;

    if (!customerCode) {
      this.logger.warn(
        'Unable to resolve paystack customer code from charge event',
      );
      return;
    }

    // If this is a subscription charge, the subscription webhook will handle it
    // This handler is for one-time payments or initial subscription setup
    const subscription =
      await this.subscriptionRepository.findByPaystackCustomerCode(
        customerCode,
      );

    if (!subscription) {
      this.logger.warn(
        `Subscription not found for paystack customer ${customerCode}`,
      );
      return;
    }

    // Check if this charge is for a subscription
    if (eventData.plan) {
      // Create subscription after successful payment
      try {
        const subscriptionResponse =
          await this.paystackClient.createSubscription({
            customer: customerCode,
            plan: eventData.plan.plan_code,
            authorization: eventData.authorization?.authorization_code,
          });

        await this.subscriptionRepository.update(subscription.id, {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
          paystackSubscriptionCode: subscriptionResponse.data.subscription_code,
          currentPeriodEnd: new Date(
            subscriptionResponse.data.next_payment_date,
          ),
        });
      } catch (error) {
        this.logger.error(
          'Failed to create Paystack subscription after charge',
          error,
        );
      }
    }
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
   * Determine payment provider based on country code.
   * Nigeria (NG), Ghana (GH), South Africa (ZA), Kenya (KE) -> Paystack
   * All others -> Stripe
   */
  private determinePaymentProvider(countryCode?: string): PaymentProvider {
    if (!countryCode) {
      return PaymentProvider.STRIPE;
    }

    const normalizedCountry = countryCode.toUpperCase();
    const paystackCountries = ['NG', 'GH', 'ZA', 'KE'];

    if (paystackCountries.includes(normalizedCountry)) {
      return PaymentProvider.PAYSTACK;
    }

    return PaymentProvider.STRIPE;
  }

  /**
   * Get Paystack plan code based on country.
   */
  private getPaystackPlanCodeByCountry(countryCode?: string): string {
    if (!countryCode) {
      return this.configService.getOrThrow('paystack.proPlanCodeNgn', {
        infer: true,
      });
    }

    const normalizedCountry = countryCode.toUpperCase();

    switch (normalizedCountry) {
      case 'NG':
        return this.configService.getOrThrow('paystack.proPlanCodeNgn', {
          infer: true,
        });
      case 'GH':
        return this.configService.getOrThrow('paystack.proPlanCodeGhs', {
          infer: true,
        });
      case 'ZA':
        return this.configService.getOrThrow('paystack.proPlanCodeZar', {
          infer: true,
        });
      case 'KE':
        return this.configService.getOrThrow('paystack.proPlanCodeKes', {
          infer: true,
        });
      default:
        return this.configService.getOrThrow('paystack.proPlanCodeNgn', {
          infer: true,
        });
    }
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
