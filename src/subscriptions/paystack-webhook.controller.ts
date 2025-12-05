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
import { PaystackClientService } from '../paystack/paystack-client.service';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Paystack Webhook')
@Controller({
  path: 'paystack',
  version: '1',
})
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    private readonly paystackClient: PaystackClientService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get('webhook')
  public health(): string {
    return 'Paystack webhook ready';
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  public async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
  ): Promise<void> {
    const signatureHeader = request.headers['x-paystack-signature'];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;
    const payload = (request.rawBody ?? request.body) as Buffer;

    let event;
    try {
      event = this.paystackClient.constructWebhookEvent(payload, signature);
    } catch (error) {
      this.logger.error(
        'Paystack webhook signature verification failed',
        error,
      );
      throw new BadRequestException('Invalid paystack webhook signature');
    }

    this.logger.log(`Received paystack event ${event.event}`);

    switch (event.event) {
      case 'subscription.create':
      case 'subscription.not_renew':
      case 'subscription.disable':
        await this.subscriptionsService.handlePaystackSubscriptionEvent(
          event.data,
        );
        break;
      case 'charge.success':
        await this.subscriptionsService.handlePaystackChargeSuccessEvent(
          event.data,
        );
        break;
      default:
        this.logger.debug(`Unhandled paystack event ${event.event}`);
    }
  }
}
