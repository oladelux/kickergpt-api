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
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.subscriptionsService.handleStripeSubscriptionEvent(
          event.data.object as Stripe.Subscription,
        );
        break;
      default:
        this.logger.debug(`Unhandled stripe event ${event.type}`);
    }
  }
}
