import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AllConfigType } from '../config/config.type';

export interface PaystackCustomer {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  metadata?: Record<string, any>;
}

export interface PaystackCustomerResponse {
  status: boolean;
  message: string;
  data: {
    customer_code: string;
    email: string;
    id: number;
    integration: number;
    domain: string;
    customer_id: number;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    metadata: Record<string, any> | null;
    risk_action: string;
    created_at: string;
    updated_at: string;
  };
}

export interface PaystackTransactionInitializeParams {
  email: string;
  amount: number;
  currency?: string;
  plan?: string;
  customer?: string;
  metadata?: Record<string, any>;
  callback_url?: string;
}

export interface PaystackTransactionInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackSubscriptionCreateParams {
  customer: string;
  plan: string;
  authorization?: string;
  start_date?: string;
}

export interface PaystackSubscriptionResponse {
  status: boolean;
  message: string;
  data: {
    customer: number;
    plan: number;
    integration: number;
    domain: string;
    start: number;
    status: string;
    quantity: number;
    amount: number;
    subscription_code: string;
    email_token: string;
    authorization: {
      authorization_code: string;
      bin: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      channel: string;
      card_type: string;
      bank: string;
      country_code: string;
      brand: string;
      reusable: boolean;
      signature: string;
      account_name: string | null;
    };
    easy_cron_id: string | null;
    cron_expression: string;
    next_payment_date: string;
    open_invoice: string | null;
    id: number;
    created_at: string;
    updated_at: string;
  };
}

export interface PaystackWebhookEvent {
  event: string;
  data: any;
}

@Injectable()
export class PaystackClientService {
  private readonly logger = new Logger(PaystackClientService.name);
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    this.secretKey = this.configService.getOrThrow('paystack.secretKey', {
      infer: true,
    });
    this.webhookSecret = this.configService.getOrThrow(
      'paystack.webhookSecret',
      {
        infer: true,
      },
    );
  }

  async createCustomer(
    params: PaystackCustomer,
  ): Promise<PaystackCustomerResponse> {
    return this.makeRequest<PaystackCustomerResponse>(
      'POST',
      '/customer',
      params,
    );
  }

  async initializeTransaction(
    params: PaystackTransactionInitializeParams,
  ): Promise<PaystackTransactionInitializeResponse> {
    return this.makeRequest<PaystackTransactionInitializeResponse>(
      'POST',
      '/transaction/initialize',
      params,
    );
  }

  async verifyTransaction(reference: string): Promise<any> {
    return this.makeRequest('GET', `/transaction/verify/${reference}`);
  }

  async createSubscription(
    params: PaystackSubscriptionCreateParams,
  ): Promise<PaystackSubscriptionResponse> {
    return this.makeRequest<PaystackSubscriptionResponse>(
      'POST',
      '/subscription',
      params,
    );
  }

  async disableSubscription(
    subscriptionCode: string,
    emailToken: string,
  ): Promise<any> {
    return this.makeRequest('POST', '/subscription/disable', {
      code: subscriptionCode,
      token: emailToken,
    });
  }

  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string | undefined,
  ): boolean {
    if (!signature) {
      return false;
    }

    const hash = crypto
      .createHmac('sha512', this.webhookSecret)
      .update(payload.toString())
      .digest('hex');

    return hash === signature;
  }

  constructWebhookEvent(
    payload: string | Buffer,
    signature: string | undefined,
  ): PaystackWebhookEvent {
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    return JSON.parse(payload.toString());
  }

  private async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(
          `Paystack API error: ${data.message || response.statusText}`,
          data,
        );
        throw new Error(
          data.message || `Paystack API request failed: ${response.statusText}`,
        );
      }

      if (!data.status) {
        this.logger.error(`Paystack request failed: ${data.message}`, data);
        throw new Error(data.message || 'Paystack request failed');
      }

      return data;
    } catch (error) {
      this.logger.error(`Paystack API request failed: ${error.message}`, error);
      throw error;
    }
  }
}

