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
import { AddonType } from '../prompt-usage/domain/addon-type.enum';
import { PromptUsageService } from '../prompt-usage/prompt-usage.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly usersService: UsersService,
    private readonly stripeClient: StripeClientService,
    private readonly paystackClient: PaystackClientService,
    private readonly promptUsageService: PromptUsageService,
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

    const customerResponse = await this.paystackClient.createCustomer(
      user.email!,
      user.firstName!,
      user.lastName!,
    );

    const customerCode = customerResponse.data?.customer_code;
    if (!customerCode) {
      throw new Error('Customer code not found');
    }

    if (subscription) {
      return this.subscriptionRepository.update(subscription.id, {
        paystackCustomerCode: customerCode,
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
    domain.paystackCustomerCode = customerCode;
    domain.paystackSubscriptionCode = null;
    domain.currentPeriodEnd = null;

    return this.subscriptionRepository.create(domain);
  }

  async getSubscriptionForUser(userId: string): Promise<Subscription> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const subscription = await this.subscriptionRepository.findByUserId(userId);
    const paymentProvider = this.determinePaymentProvider(user?.countryCode);

    if (subscription?.stripeCustomerId || subscription?.paystackCustomerCode) {
      return subscription;
    }

    if (paymentProvider === PaymentProvider.PAYSTACK) {
      return this.ensurePaystackCustomerForUser(user);
    } else {
      return this.ensureStripeCustomerForUser(user);
    }
  }

  async purchaseAddon(addonType: AddonType, user: User): Promise<string> {
    const subscription = await this.getSubscriptionForUser(user.id);
    return this.handlePaystackAddonPurchase(addonType, subscription, user);
  }

  async handlePlanSelection(
    userId: string,
    plan: SubscriptionPlan,
    countryCode?: string,
  ): Promise<string | null> {
    const subscription = await this.getSubscriptionForUser(userId);
    const paymentProvider = this.determinePaymentProvider(countryCode);

    if (plan === SubscriptionPlan.FREE) {
      await this.subscriptionRepository.updatePlanAndStatus(subscription.id, {
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        paystackCustomerCode: null,
        stripeCustomerId: null,
        paymentProvider: paymentProvider,
        stripeSubscriptionId: null,
        paystackSubscriptionCode: null,
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
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Route to appropriate payment provider
    if (paymentProvider === PaymentProvider.PAYSTACK) {
      return this.handlePaystackPlanSelection(user, subscription);
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

  private async handlePaystackAddonPurchase(
    addonType: AddonType,
    subscription: Subscription,
    user: User,
  ): Promise<string> {
    // Ensure Paystack customer exists
    if (!subscription.paystackCustomerCode) {
      subscription = await this.ensurePaystackCustomerForUser(user);
    }
    const amount = this.getAddonAmount(addonType);
    const transactionResponse = await this.paystackClient.initializeTransaction(
      {
        email: user.email ?? '',
        amount: amount.toString(),
      },
      'addon_purchase',
    );
    if (!transactionResponse.status) {
      throw new Error('Transaction initialization failed');
    }
    if (transactionResponse.data === null) {
      throw new Error('Transaction data is null');
    }
    if (!transactionResponse.data.authorization_url) {
      throw new InternalServerErrorException(
        'Paystack authorization url missing',
      );
    }
    return transactionResponse.data.authorization_url;
  }
  private getAddonAmount(addonType: AddonType): number {
    switch (addonType) {
      case AddonType.TEN_PROMPT_CREDITS:
        return 150000;
      case AddonType.TWENTY_FIVE_PROMPT_CREDITS:
        return 300000;
      case AddonType.FIFTY_PROMPT_CREDITS:
        return 500000;
      default:
        throw new BadRequestException('Invalid addon type');
    }
  }

  private getAddonPurchaseByAmount(amount: number): AddonType {
    switch (amount) {
      case 150000:
        return AddonType.TEN_PROMPT_CREDITS;
      case 300000:
        return AddonType.TWENTY_FIVE_PROMPT_CREDITS;
      case 500000:
        return AddonType.FIFTY_PROMPT_CREDITS;
      default:
        throw new BadRequestException('Invalid amount');
    }
  }

  private getAddonCreditsByType(addonType: AddonType): number {
    switch (addonType) {
      case AddonType.TEN_PROMPT_CREDITS:
        return 10;
      case AddonType.TWENTY_FIVE_PROMPT_CREDITS:
        return 25;
      case AddonType.FIFTY_PROMPT_CREDITS:
        return 50;
    }
  }

  private async handlePaystackPlanSelection(
    user: User,
    subscription: Subscription,
  ): Promise<string> {
    // Ensure Paystack customer exists
    if (!subscription.paystackCustomerCode) {
      subscription = await this.ensurePaystackCustomerForUser(user);
    }

    const planCode = this.getPaystackPlanCodeByCountry();
    const transactionResponse = await this.paystackClient.initializeTransaction(
      {
        email: user.email ?? '',
        amount: '1000',
        plan: planCode,
      },
      'plan_purchase',
    );

    if (!transactionResponse.status) {
      throw new Error('Transaction initialization failed');
    }

    if (transactionResponse.data === null) {
      throw new Error('Transaction data is null');
    }

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
      paystackSubscriptionCode: null,
      paystackCustomerCode: null,
      stripeCustomerId: null,
      paymentProvider: PaymentProvider.STRIPE,
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
   * Determine payment provider based on country code.
   * Nigeria (NG), Ghana (GH), South Africa (ZA), Kenya (KE) -> Paystack
   * All others -> Stripe
   */
  private determinePaymentProvider(
    countryCode?: string | null,
  ): PaymentProvider {
    if (!countryCode) {
      return PaymentProvider.STRIPE;
    }

    const normalizedCountry = countryCode.toUpperCase();

    // Only Nigeria uses Paystack, all other countries use Stripe
    if (normalizedCountry === 'NG') {
      return PaymentProvider.PAYSTACK;
    }

    return PaymentProvider.STRIPE;
  }

  /**
   * Get Paystack plan code based on country.
   */
  private getPaystackPlanCodeByCountry(): string {
    // Paystack is only used for Nigeria, so always return NGN plan code
    return this.configService.getOrThrow('paystack.proPlanCodeNgn', {
      infer: true,
    });
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

  public async verifyPaystackAddonPurchase(reference: string, user: User) {
    const transaction = await this.paystackClient.verifyTransaction(reference);
    if (!transaction.status) {
      throw new Error('Transaction verification failed');
    }

    if (transaction.data === null) {
      throw new Error('Transaction data is null');
    }
    const customerCode = transaction.data.customer.customer_code;
    const paystackCustomerId = customerCode;
    const existingSubscription = await this.subscriptionRepository.findByUserId(
      user.id,
    );

    if (!existingSubscription) {
      throw new NotFoundException(`Subscription not found for user ${user.id}`);
    }

    const addonType = this.getAddonPurchaseByAmount(transaction.data.amount);

    if (!addonType) {
      throw new BadRequestException('Invalid amount');
    }
    const addonCredits = this.getAddonCreditsByType(addonType);
    if (!addonCredits) {
      throw new BadRequestException('Invalid addon type');
    }

    // We bump the addon credits in the prompt usage table
    await this.promptUsageService.addAddonCredits(user.id, addonCredits);

    const updatedSubscription = await this.subscriptionRepository.update(
      existingSubscription.id,
      {
        paystackCustomerCode: paystackCustomerId,
      },
    );

    return updatedSubscription;
  }

  public async verifyPayment(reference: string, user: User) {
    const transaction = await this.paystackClient.verifyTransaction(reference);
    if (!transaction.status) {
      throw new Error('Transaction verification failed');
    }

    if (transaction.data === null) {
      throw new Error('Transaction data is null');
    }
    const customerCode = transaction.data.customer.customer_code;
    const paystackCustomerId = customerCode;
    const paystackSubscriptionCode = transaction.data.subscription_code;

    const existingSubscription = await this.subscriptionRepository.findByUserId(
      user.id,
    );

    if (!existingSubscription) {
      throw new NotFoundException(`Subscription not found for user ${user.id}`);
    }

    const isActive = existingSubscription.status === SubscriptionStatus.ACTIVE;

    const updatedSubscription =
      await this.subscriptionRepository.updatePlanAndStatus(
        existingSubscription.id,
        {
          plan: isActive ? SubscriptionPlan.PRO : SubscriptionPlan.FREE,
          status: isActive
            ? SubscriptionStatus.ACTIVE
            : SubscriptionStatus.INACTIVE,
          paystackSubscriptionCode: paystackSubscriptionCode ?? null,
          paystackCustomerCode: paystackCustomerId,
          stripeCustomerId: null,
          paymentProvider: PaymentProvider.PAYSTACK,
          stripeSubscriptionId: null,
          currentPeriodEnd:
            isActive && transaction.data.paidAt
              ? new Date(
                  new Date(transaction.data.paidAt).setMonth(
                    new Date(transaction.data.paidAt).getMonth() + 1,
                  ),
                )
              : null,
        },
      );

    return updatedSubscription;
  }
}
