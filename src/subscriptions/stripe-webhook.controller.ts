import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import Stripe from 'stripe';
import { StripeClientService } from '../stripe/stripe-client.service';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Stripe Webhook')
@Controller({
  path: 'stripe',
  version: '1',
})
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeClient: StripeClientService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get('webhook')
  public health(): string {
    return 'Stripe webhook ready';
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  public async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
  ): Promise<void> {
    const signature = request.headers['stripe-signature'];
    let event: Stripe.Event;

    try {
      event = this.stripeClient.constructWebhookEvent(
        (request.rawBody ?? request.body) as Buffer,
        signature,
      );
    } catch (error) {
      this.logger.error('Stripe webhook signature verification failed', error);
      throw new BadRequestException('Invalid stripe webhook signature');
    }

    this.logger.log(`Received stripe event ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        this.logger.log(
          `handling checkout session completed event for session ${event.data.object.id}`,
        );
        return await this.handleCheckoutSessionCompleted(
          event as Stripe.CheckoutSessionCompletedEvent,
        );
      case 'customer.subscription.created':
        this.logger.log(
          `handling subscription created event for subscription ${event.data.object.id}`,
        );
        return await this.handleCustomerSubscriptionCreated(
          event as Stripe.CustomerSubscriptionCreatedEvent,
        );
      case 'customer.subscription.updated':
        this.logger.log(
          `handling subscription updated event for subscription ${event.data.object.id}`,
        );
        return await this.handleCustomerSubscriptionUpdated(
          event as Stripe.CustomerSubscriptionUpdatedEvent,
        );
      case 'customer.subscription.deleted':
        this.logger.log(
          `handling subscription deleted event for subscription ${event.data.object.id}`,
        );
        return await this.handleCustomerSubscriptionDeleted(
          event as Stripe.CustomerSubscriptionDeletedEvent,
        );
      default:
        return;
    }
  }

  private async handleCheckoutSessionCompleted(
    event: Stripe.CheckoutSessionCompletedEvent,
  ): Promise<void> {
    const session = event.data.object;

    // Only handle payment mode sessions (addon purchases)
    // Subscription mode sessions are handled by subscription events
    if (session.mode === 'payment') {
      // Check if this is an addon purchase by looking for addon_type in metadata
      if (session.metadata?.addon_type) {
        this.logger.log(`Processing addon purchase for session ${session.id}`);
        await this.subscriptionsService.processStripeAddonPurchaseWebhook(
          session.id,
        );
      } else {
        this.logger.log(
          `Skipping payment session ${session.id} - no addon_type in metadata`,
        );
      }
    } else {
      this.logger.log(
        `Skipping checkout session ${session.id} - mode is ${session.mode}`,
      );
    }
  }

  private async handleCustomerSubscriptionCreated(
    event: Stripe.CustomerSubscriptionCreatedEvent,
  ): Promise<void> {
    const subscription = event.data.object;
    Logger.log(
      `handling subscription created event for subscription ${subscription.id}`,
    );
    const userId = await this.stripeClient.getUserId(
      event.data.object.metadata.user_id,
      event.data.object.customer as string,
    );

    if (!userId) {
      Logger.error(`User not found for subscription ${subscription.id}`);
      return;
    }

    await this.stripeClient.createStripeSubscription(
      userId,
      event.data.object,
      true,
    );
  }

  private async handleCustomerSubscriptionUpdated(
    event: Stripe.CustomerSubscriptionUpdatedEvent,
  ): Promise<void> {
    const subscription = event.data.object;
    Logger.log(
      `handling subscription updated event for subscription ${subscription.id}`,
    );
    const userId = await this.stripeClient.getUserId(
      event.data.object.metadata.user_id,
      event.data.object.customer as string,
    );

    if (!userId) {
      Logger.error(`User not found for subscription ${subscription.id}`);
      return;
    }

    await this.stripeClient.createStripeSubscription(
      userId,
      event.data.object,
      false,
    );
  }

  private async handleCustomerSubscriptionDeleted(
    event: Stripe.CustomerSubscriptionDeletedEvent,
  ): Promise<void> {
    const subscription = event.data.object;
    Logger.log(
      `handling subscription deleted event for subscription ${subscription.id}`,
    );

    const userId = await this.stripeClient.getUserId(
      event.data.object.metadata.user_id,
      event.data.object.customer as string,
    );

    if (!userId) {
      Logger.error(`User not found for subscription ${subscription.id}`);
      return;
    }

    await this.stripeClient.cancelUserSubscription(userId);
  }
}
