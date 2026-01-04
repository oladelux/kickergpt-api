import {
  BadRequestException,
  Injectable,
  Inject,
  forwardRef,
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
import { MailService } from '../mail/mail.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => StripeClientService))
    private readonly stripeClient: StripeClientService,
    private readonly paystackClient: PaystackClientService,
    private readonly promptUsageService: PromptUsageService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly mailService: MailService,
  ) {}

  async getActiveSubscriptionByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<Subscription | null> {
    return this.subscriptionRepository.findByStripeCustomerId(stripeCustomerId);
  }

  async updateUserSubscription(
    userId: string,
    payload: Partial<Omit<Subscription, 'id'>>,
  ): Promise<Subscription> {
    // Check if upgrading from FREE to PRO
    if (payload.plan === SubscriptionPlan.PRO) {
      const existingSubscription =
        await this.subscriptionRepository.findByUserId(userId);

      // If user was on FREE plan and is now upgrading to PRO, reset their promptsUsed
      if (
        existingSubscription?.plan === SubscriptionPlan.FREE &&
        payload.status === SubscriptionStatus.ACTIVE
      ) {
        try {
          await this.promptUsageService.resetPromptsUsed(userId);
          this.logger.log(
            `Reset promptsUsed for user ${userId} on PRO upgrade`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to reset promptsUsed for user ${userId}: ${error}`,
          );
          // Don't throw - prompt reset failure shouldn't break subscription flow
        }
      }
    }
    return this.subscriptionRepository.updateByUserId(userId, payload);
  }

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

    // Check Stripe or Paystack
    if (subscription?.stripeCustomerId || subscription?.paystackCustomerCode) {
      return subscription;
    }

    if (paymentProvider === PaymentProvider.PAYSTACK) {
      return this.ensurePaystackCustomerForUser(user);
    } else {
      return this.ensureStripeCustomerForUser(user);
    }
  }

  async purchaseAddon(
    addonType: AddonType,
    user: User,
    isNativeUser: boolean,
    token?: string,
  ): Promise<string> {
    const subscription = await this.getSubscriptionForUser(user.id);
    const paymentProvider = this.determinePaymentProvider(user?.countryCode);

    // Route to appropriate payment provider
    if (paymentProvider === PaymentProvider.PAYSTACK) {
      return this.handlePaystackAddonPurchase(
        addonType,
        subscription,
        user,
        isNativeUser,
        token,
      );
    } else {
      return this.handleStripeAddonPurchase(
        addonType,
        subscription,
        user,
        isNativeUser,
        token,
      );
    }
  }

  async handlePlanSelection(
    userId: string,
    plan: SubscriptionPlan,
    isNativeUser: boolean,
    countryCode?: string,
    token?: string,
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
      return this.handlePaystackPlanSelection(
        user,
        subscription,
        isNativeUser,
        token,
      );
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

  private async handleStripeAddonPurchase(
    addonType: AddonType,
    subscription: Subscription,
    user: User,
    isNativeUser: boolean,
    token?: string,
  ): Promise<string> {
    // Ensure Stripe customer exists
    if (!subscription.stripeCustomerId) {
      subscription = await this.ensureStripeCustomerForUser(user);
    }

    const { amount, currency } = this.getStripeAddonAmount(
      addonType,
      user?.countryCode,
    );

    // Build success URL with query parameters for verification
    const baseSuccessUrl = this.configService.getOrThrow('stripe.successUrl', {
      infer: true,
    });
    const successUrlParams = new URLSearchParams({
      session_id: '{CHECKOUT_SESSION_ID}',
      addon_type: addonType,
    });
    if (isNativeUser) {
      successUrlParams.append('isNative', 'true');
    }
    if (token) {
      successUrlParams.append('token', token);
    }
    const successUrl = `${baseSuccessUrl}?${successUrlParams.toString()}`;
    const cancelUrl = this.configService.getOrThrow('stripe.cancelUrl', {
      infer: true,
    });

    const session = await this.stripeClient.createCheckoutSession({
      customer: subscription.stripeCustomerId!,
      mode: 'payment',
      payment_method_types: ['card'],
      metadata: {
        user_id: user.id,
        addon_type: addonType,
        is_native_user: isNativeUser.toString(),
      },
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: this.getAddonName(addonType),
              description: this.getAddonDescription(addonType),
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
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
    isNativeUser: boolean,
    token?: string,
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
      isNativeUser,
      token,
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
    // Paystack amounts in kobo (NGN)
    // Prices: 10 credits = ₦2000, 25 credits = ₦4000, 50 credits = ₦6000
    switch (addonType) {
      case AddonType.TEN_PROMPT_CREDITS:
        return 200000; // ₦2000 = 200000 kobo
      case AddonType.TWENTY_FIVE_PROMPT_CREDITS:
        return 400000; // ₦4000 = 400000 kobo
      case AddonType.FIFTY_PROMPT_CREDITS:
        return 600000; // ₦6000 = 600000 kobo
      default:
        throw new BadRequestException('Invalid addon type');
    }
  }

  /**
   * Get Stripe addon amount and currency based on addon type and country.
   * Returns amount in smallest currency unit (cents for USD/EUR/GBP, kobo for NGN).
   */
  private getStripeAddonAmount(
    addonType: AddonType,
    countryCode?: string | null,
  ): { amount: number; currency: string } {
    if (!countryCode) {
      // Default to USD
      return this.getStripeAddonAmountByCurrency(addonType, 'USD');
    }

    const normalizedCountry = countryCode.toUpperCase();

    // Nigeria uses NGN
    if (normalizedCountry === 'NG') {
      return this.getStripeAddonAmountByCurrency(addonType, 'NGN');
    }

    // United Kingdom uses GBP
    if (normalizedCountry === 'GB') {
      return this.getStripeAddonAmountByCurrency(addonType, 'GBP');
    }

    // European countries use EUR
    const europeanCountries = [
      'AT',
      'BE',
      'CY',
      'EE',
      'FI',
      'FR',
      'DE',
      'GR',
      'IE',
      'IT',
      'LV',
      'LT',
      'LU',
      'MT',
      'NL',
      'PT',
      'SK',
      'SI',
      'ES',
    ];
    if (europeanCountries.includes(normalizedCountry)) {
      return this.getStripeAddonAmountByCurrency(addonType, 'EUR');
    }

    // Default to USD for all other countries
    return this.getStripeAddonAmountByCurrency(addonType, 'USD');
  }

  /**
   * Get Stripe addon amount for a specific currency.
   * Amounts are in smallest currency unit (cents/kobo).
   * Prices: 10 credits = $2, 25 credits = $4, 50 credits = $6
   */
  private getStripeAddonAmountByCurrency(
    addonType: AddonType,
    currency: 'USD' | 'EUR' | 'GBP' | 'NGN',
  ): { amount: number; currency: string } {
    // Fixed prices in base currency (USD)
    const usdPrices = {
      [AddonType.TEN_PROMPT_CREDITS]: 2, // $2
      [AddonType.TWENTY_FIVE_PROMPT_CREDITS]: 4, // $4
      [AddonType.FIFTY_PROMPT_CREDITS]: 6, // $6
    };

    const usdPrice = usdPrices[addonType];

    // Convert to appropriate currency
    // For USD, EUR, GBP: use same numeric value (2, 4, 6)
    // For NGN: convert using approximate rate (1 USD ≈ 1000 NGN)
    if (currency === 'USD') {
      return { amount: usdPrice * 100, currency }; // Convert to cents
    } else if (currency === 'EUR') {
      return { amount: usdPrice * 100, currency }; // Same price in EUR (cents)
    } else if (currency === 'GBP') {
      return { amount: usdPrice * 100, currency }; // Same price in GBP (pence)
    } else {
      // NGN: 1 USD ≈ 1000 NGN, so multiply by 1000 and convert to kobo
      return { amount: usdPrice * 1000 * 100, currency }; // Convert to kobo
    }
  }

  private getAddonName(addonType: AddonType): string {
    switch (addonType) {
      case AddonType.TEN_PROMPT_CREDITS:
        return '10 Prompt Credits';
      case AddonType.TWENTY_FIVE_PROMPT_CREDITS:
        return '25 Prompt Credits';
      case AddonType.FIFTY_PROMPT_CREDITS:
        return '50 Prompt Credits';
      default:
        throw new BadRequestException('Invalid addon type');
    }
  }

  private getAddonDescription(addonType: AddonType): string {
    switch (addonType) {
      case AddonType.TEN_PROMPT_CREDITS:
        return 'Additional 10 prompt credits for your account';
      case AddonType.TWENTY_FIVE_PROMPT_CREDITS:
        return 'Additional 25 prompt credits for your account';
      case AddonType.FIFTY_PROMPT_CREDITS:
        return 'Additional 50 prompt credits for your account';
      default:
        throw new BadRequestException('Invalid addon type');
    }
  }

  private getAddonPurchaseByAmount(amount: number): AddonType {
    // Paystack amounts in kobo (NGN)
    switch (amount) {
      case 200000: // ₦2000
        return AddonType.TEN_PROMPT_CREDITS;
      case 400000: // ₦4000
        return AddonType.TWENTY_FIVE_PROMPT_CREDITS;
      case 600000: // ₦6000
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
    isNativeUser: boolean,
    token?: string,
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
      isNativeUser,
      token,
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

  /*   async handleStripeSubscriptionEvent(
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
    console.log('stripeSubscription', stripeSubscription);

    const isActive = this.isStripeStatusActive(stripeSubscription.status);
    console.log('isActive', isActive);
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
  } */

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

  /**
   * Handle Stripe addon purchase automatically (called from webhook).
   * This grants credits to the user after successful payment.
   */
  public async processStripeAddonPurchaseWebhook(
    sessionId: string,
  ): Promise<void> {
    const session = await this.stripeClient.retrieveCheckoutSession(sessionId);

    // Only process payment mode sessions (not subscriptions)
    if (session.mode !== 'payment') {
      this.logger.log(
        `Skipping session ${sessionId} - not a payment session (mode: ${session.mode})`,
      );
      return;
    }

    // Verify the session is completed and paid
    if (session.payment_status !== 'paid') {
      this.logger.warn(
        `Session ${sessionId} payment status is not paid: ${session.payment_status}`,
      );
      return;
    }

    // Get user ID from metadata
    const metadataUserId = session.metadata?.user_id;
    if (!metadataUserId) {
      this.logger.error(`Session ${sessionId} missing user_id in metadata`);
      return;
    }

    // Get addon type from metadata
    const addonType = session.metadata?.addon_type as AddonType;
    if (!addonType || !Object.values(AddonType).includes(addonType)) {
      this.logger.error(
        `Session ${sessionId} has invalid addon_type in metadata: ${addonType}`,
      );
      return;
    }

    const user = await this.usersService.findById(metadataUserId);
    if (!user) {
      this.logger.error(
        `User not found for session ${sessionId}: ${metadataUserId}`,
      );
      return;
    }

    const existingSubscription = await this.subscriptionRepository.findByUserId(
      user.id,
    );

    if (!existingSubscription) {
      this.logger.error(
        `Subscription not found for user ${user.id} in session ${sessionId}`,
      );
      return;
    }

    const addonCredits = this.getAddonCreditsByType(addonType);
    if (!addonCredits) {
      this.logger.error(
        `Invalid addon type for session ${sessionId}: ${addonType}`,
      );
      return;
    }

    // Grant addon credits to the user
    await this.promptUsageService.addAddonCredits(user.id, addonCredits);

    // Ensure Stripe customer is set
    await this.subscriptionRepository.update(existingSubscription.id, {
      stripeCustomerId: session.customer as string,
      paymentProvider: PaymentProvider.STRIPE,
    });

    this.logger.log(
      `Granted ${addonCredits} addon credits to user ${user.id} from Stripe session ${sessionId}`,
    );
  }

  public async verifyStripeAddonPurchase(sessionId: string, user: User) {
    const session = await this.stripeClient.retrieveCheckoutSession(sessionId);

    // Verify the session is completed and paid
    if (session.payment_status !== 'paid') {
      throw new BadRequestException('Payment not completed');
    }

    // Verify the session mode is payment (not subscription)
    if (session.mode !== 'payment') {
      throw new BadRequestException('Invalid session type');
    }

    // Verify the user matches
    const metadataUserId = session.metadata?.user_id;
    if (metadataUserId !== user.id) {
      throw new BadRequestException('User mismatch');
    }

    // Get addon type from metadata
    const addonType = session.metadata?.addon_type as AddonType;
    if (!addonType || !Object.values(AddonType).includes(addonType)) {
      throw new BadRequestException('Invalid addon type in session');
    }

    const existingSubscription = await this.subscriptionRepository.findByUserId(
      user.id,
    );

    if (!existingSubscription) {
      throw new NotFoundException(`Subscription not found for user ${user.id}`);
    }

    const addonCredits = this.getAddonCreditsByType(addonType);
    if (!addonCredits) {
      throw new BadRequestException('Invalid addon type');
    }

    // We bump the addon credits in the prompt usage table
    await this.promptUsageService.addAddonCredits(user.id, addonCredits);

    // Ensure Stripe customer is set
    const updatedSubscription = await this.subscriptionRepository.update(
      existingSubscription.id,
      {
        stripeCustomerId: session.customer as string,
        paymentProvider: PaymentProvider.STRIPE,
      },
    );

    return updatedSubscription;
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
    const isUpgradingToPro =
      existingSubscription.plan === SubscriptionPlan.FREE && isActive;

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

    // Reset promptsUsed if upgrading from FREE to PRO
    if (isUpgradingToPro && updatedSubscription.plan === SubscriptionPlan.PRO) {
      try {
        await this.promptUsageService.resetPromptsUsed(user.id);
        this.logger.log(
          `Reset promptsUsed for user ${user.id} on PRO upgrade via Paystack`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to reset promptsUsed for user ${user.id}: ${error}`,
        );
        // Don't throw - prompt reset failure shouldn't break subscription flow
      }
    }

    // Send PRO welcome email if subscription is now PRO and ACTIVE
    if (
      updatedSubscription.plan === SubscriptionPlan.PRO &&
      updatedSubscription.status === SubscriptionStatus.ACTIVE &&
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

    return updatedSubscription;
  }

  async cancelSubscription(userId: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findByUserId(userId);

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Cancel Stripe subscription if it exists
    if (subscription.stripeSubscriptionId) {
      try {
        await this.stripeClient.cancelSubscription(
          subscription.stripeSubscriptionId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to cancel Stripe subscription ${subscription.stripeSubscriptionId}: ${error.message}`,
        );
        // Continue with database update even if Stripe cancellation fails
      }
    }

    // Cancel Paystack subscription if it exists
    if (subscription.paystackSubscriptionCode) {
      try {
        await this.paystackClient.disableSubscription(
          subscription.paystackSubscriptionCode,
        );
      } catch (error) {
        this.logger.error(
          `Failed to cancel Paystack subscription ${subscription.paystackSubscriptionCode}: ${error.message}`,
        );
        // Continue with database update even if Paystack cancellation fails
      }
    }

    // Update subscription in database
    return this.subscriptionRepository.updatePlanAndStatus(subscription.id, {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.INACTIVE,
      stripeSubscriptionId: null,
      paystackSubscriptionCode: null,
      paystackCustomerCode: subscription.paystackCustomerCode,
      stripeCustomerId: subscription.stripeCustomerId,
      paymentProvider: subscription.paymentProvider,
      currentPeriodEnd: null,
    });
  }

  async cancelSubscriptionForUser(userId: string): Promise<void> {
    const subscription = await this.subscriptionRepository.findByUserId(userId);

    if (!subscription) {
      // No subscription found, nothing to cancel
      return;
    }

    // Cancel Stripe subscription if it exists
    if (subscription.stripeSubscriptionId) {
      try {
        await this.stripeClient.cancelSubscription(
          subscription.stripeSubscriptionId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to cancel Stripe subscription ${subscription.stripeSubscriptionId}: ${error.message}`,
        );
        // Continue even if cancellation fails
      }
    }

    // Cancel Paystack subscription if it exists
    if (subscription.paystackSubscriptionCode) {
      try {
        await this.paystackClient.disableSubscription(
          subscription.paystackSubscriptionCode,
        );
      } catch (error) {
        this.logger.error(
          `Failed to cancel Paystack subscription ${subscription.paystackSubscriptionCode}: ${error.message}`,
        );
        // Continue even if cancellation fails
      }
    }
  }

  findByUserId(userId: Subscription['userId']) {
    return this.subscriptionRepository.findByUserId(userId);
  }

  async deleteSubscriptionByUserId(userId: string): Promise<void> {
    await this.subscriptionRepository.deleteByUserId(userId);
  }
}
