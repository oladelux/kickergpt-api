import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Paystack } from 'paystack-sdk';
import { AllConfigType } from '../config/config.type';
import {
  InitializeTransaction,
  TransactionInitialized,
} from 'paystack-sdk/dist/transaction/interface';
import { BadRequest } from 'paystack-sdk/dist/interface';
import {
  CreateSubscription,
  SubscriptionCreated,
} from 'paystack-sdk/dist/subscription/interface';

@Injectable()
export class PaystackClientService {
  private readonly logger = new Logger(PaystackClientService.name);
  private readonly paystack: Paystack;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const secretKey = this.configService.getOrThrow('paystack.secretKey', {
      infer: true,
    });
    this.paystack = new Paystack(secretKey);
  }

  private buildUrl(path: string) {
    return `${this.configService.getOrThrow('app.frontendDomain', { infer: true })}${path}`;
  }

  public createCustomer(email: string, firstName: string, lastName: string) {
    return this.paystack.customer.create({
      email,
      first_name: firstName,
      last_name: lastName,
    });
  }

  public initializeTransaction(
    data: InitializeTransaction,
    transactionType: 'addon_purchase' | 'plan_purchase',
    isNativeUser: boolean,
    token?: string,
  ): Promise<TransactionInitialized | BadRequest> {
    if (transactionType === 'addon_purchase') {
      const buildUrl = isNativeUser
        ? `/verify-addon-purchase?isNative=true${token ? `&token=${token}` : ''}`
        : `/verify-addon-purchase?token=${token}`;
      data.callback_url = this.buildUrl(buildUrl);
    } else if (transactionType === 'plan_purchase') {
      const buildUrl = isNativeUser
        ? `/verify-payment?isNative=true${token ? `&token=${token}` : ''}`
        : `/verify-payment?token=${token}`;
      data.callback_url = this.buildUrl(buildUrl);
    }
    return this.paystack.transaction.initialize(data);
  }

  async verifyTransaction(reference: string): Promise<any> {
    try {
      const response = await this.paystack.transaction.verify(reference);

      if ('status' in response && response.status) {
        return response;
      }

      throw new Error(
        'message' in response
          ? response.message
          : 'Transaction verification failed',
      );
    } catch (error) {
      this.logger.error(
        `Paystack transaction verification failed: ${error.message}`,
      );
      throw error;
    }
  }

  public createSubscription(
    data: CreateSubscription,
  ): Promise<SubscriptionCreated | BadRequest> {
    return this.paystack.subscription.create(data) as Promise<
      SubscriptionCreated | BadRequest
    >;
  }

  public async disableSubscription(subscriptionCode: string): Promise<any> {
    try {
      // Paystack disable subscription API call
      // The token parameter is optional for server-side operations
      return await this.paystack.subscription.disable({
        code: subscriptionCode,
        token: '', // Empty token for server-side disable
      });
    } catch (error) {
      this.logger.error(
        `Failed to disable Paystack subscription ${subscriptionCode}: ${error.message}`,
      );
      throw error;
    }
  }
}
