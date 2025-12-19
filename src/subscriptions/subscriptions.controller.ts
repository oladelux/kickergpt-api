import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Subscription } from './domain/subscription';
import { CheckoutResponseDto } from './dto/checkout-response.dto';
import { SelectPlanDto } from './dto/select-plan.dto';
import { SubscriptionsService } from './subscriptions.service';
import { PromptUsageService } from '../prompt-usage/prompt-usage.service';
import { PromptUsageSummaryDto } from '../prompt-usage/dto/prompt-usage-summary.dto';
import { UsersService } from '../users/users.service';
import { AddonType } from '../prompt-usage/domain/addon-type.enum';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'subscriptions',
  version: '1',
})
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly promptUsageService: PromptUsageService,
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  @ApiOkResponse({ type: Subscription })
  async getMySubscription(@Request() request): Promise<Subscription> {
    return this.subscriptionsService.getSubscriptionForUser(request.user.id);
  }

  @Post('select-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CheckoutResponseDto })
  async selectPlan(
    @Request() request,
    @Body() dto: SelectPlanDto,
  ): Promise<CheckoutResponseDto> {
    const checkoutUrl = await this.subscriptionsService.handlePlanSelection(
      request.user.id,
      dto.plan,
      dto.countryCode,
    );

    return { checkoutUrl };
  }

  @Get('usage')
  @ApiOkResponse({ type: PromptUsageSummaryDto })
  async getUsage(@Request() request): Promise<PromptUsageSummaryDto> {
    const subscription = await this.subscriptionsService.getSubscriptionForUser(
      request.user.id,
    );

    return this.promptUsageService.getUsageSummary({
      userId: request.user.id,
      plan: subscription.plan,
      status: subscription.status,
    });
  }

  @Post('verify')
  @ApiOkResponse({
    type: Subscription,
  })
  async verify(
    @Request() request,
    @Body() data: { reference: string },
  ): Promise<Subscription> {
    const userId = request.user.id;
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.subscriptionsService.verifyPayment(data.reference, user);
  }

  /**
   * @deprecated Addon purchases have been removed in favor of subscription-only model.
   * This endpoint is kept for backward compatibility but should no longer be used.
   */
  @Post('addon-purchase')
  @ApiOkResponse({
    type: Subscription,
  })
  async addonPurchase(
    @Request() request,
    @Body() data: { addonType: AddonType },
  ): Promise<CheckoutResponseDto> {
    const userId = request.user.id;
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const checkoutUrl = await this.subscriptionsService.purchaseAddon(
      data.addonType,
      user,
    );
    return { checkoutUrl };
  }

  /**
   * @deprecated Addon purchases have been removed in favor of subscription-only model.
   * This endpoint is kept for backward compatibility but should no longer be used.
   */
  @Post('addon-purchase-verify')
  @ApiOkResponse({
    type: Subscription,
  })
  async addonPurchaseVerify(
    @Request() request,
    @Body() data: { reference: string },
  ): Promise<Subscription> {
    const userId = request.user.id;
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.subscriptionsService.verifyPaystackAddonPurchase(
      data.reference,
      user,
    );
  }
}
