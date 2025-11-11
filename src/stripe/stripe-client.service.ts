import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class StripeClientService {
  private readonly client: Stripe;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
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
}
