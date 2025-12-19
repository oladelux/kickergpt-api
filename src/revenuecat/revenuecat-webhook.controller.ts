import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Headers,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import {
  RevenueCatWebhookRequestDto,
  RevenueCatWebhookResponseDto,
} from './dto/revenuecat-webhook-event.dto';

@ApiTags('RevenueCat Webhook')
@Controller({
  path: 'revenuecat',
  version: '1',
})
export class RevenueCatWebhookController {
  private readonly logger = new Logger(RevenueCatWebhookController.name);

  constructor(
    private readonly revenueCatWebhookService: RevenueCatWebhookService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RevenueCatWebhookResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid webhook signature' })
  async handleWebhook(
    @Headers('authorization') authorization: string,
    @Body() payload: RevenueCatWebhookRequestDto,
  ): Promise<RevenueCatWebhookResponseDto> {
    // Verify webhook signature
    const isValid =
      this.revenueCatWebhookService.verifyWebhookSignature(authorization);

    if (!isValid) {
      this.logger.warn('Invalid RevenueCat webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log(
      `Received RevenueCat webhook: ${payload.event.type} for user ${payload.event.app_user_id}`,
    );

    // Process the webhook event
    return this.revenueCatWebhookService.processWebhookEvent(payload);
  }
}
