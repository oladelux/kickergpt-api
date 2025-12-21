import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Subscription } from './domain/subscription';
import { CheckoutResponseDto } from './dto/checkout-response.dto';
import { SelectPlanDto } from './dto/select-plan.dto';
import { SubscriptionsService } from './subscriptions.service';
import { PromptUsageService } from '../prompt-usage/prompt-usage.service';
import { PromptUsageSummaryDto } from '../prompt-usage/dto/prompt-usage-summary.dto';
import { UsersService } from '../users/users.service';
import { AddonType } from '../prompt-usage/domain/addon-type.enum';
import { JwtPayloadType } from '../auth/strategies/types/jwt-payload.type';
import { AllConfigType } from '../config/config.type';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller({
  path: 'subscriptions',
  version: '1',
})
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly promptUsageService: PromptUsageService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({ type: Subscription })
  async getMySubscription(@Request() request): Promise<Subscription> {
    return this.subscriptionsService.getSubscriptionForUser(request.user.id);
  }

  @Post('select-plan')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CheckoutResponseDto })
  async selectPlan(
    @Request() request,
    @Body() dto: SelectPlanDto,
  ): Promise<CheckoutResponseDto> {
    const authHeader = request.headers?.authorization;
    const token = authHeader?.replace('Bearer ', '');
    const checkoutUrl = await this.subscriptionsService.handlePlanSelection(
      request.user.id,
      dto.plan,
      dto.isNativeUser ?? false,
      dto.countryCode,
      token,
    );

    return { checkoutUrl };
  }

  @Get('usage')
  @UseGuards(AuthGuard('jwt'))
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
    @Body() data: { reference: string; token: string },
  ): Promise<Subscription> {
    let payload: JwtPayloadType;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayloadType>(data.token, {
        secret: this.configService.getOrThrow('auth.secret', {
          infer: true,
        }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.id) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.usersService.findById(payload.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.subscriptionsService.verifyPayment(data.reference, user);
  }

  @Post('addon-purchase')
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({
    type: Subscription,
  })
  async addonPurchase(
    @Request() request,
    @Body() data: { addonType: AddonType; isNativeUser: boolean },
  ): Promise<CheckoutResponseDto> {
    const userId = request.user.id;
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const authHeader = request.headers?.authorization;
    const token = authHeader?.replace('Bearer ', '');
    const checkoutUrl = await this.subscriptionsService.purchaseAddon(
      data.addonType,
      user,
      data.isNativeUser,
      token,
    );
    return { checkoutUrl };
  }

  @Post('addon-purchase-verify')
  @ApiOkResponse({
    type: Subscription,
  })
  async addonPurchaseVerify(
    @Body() data: { reference: string; token: string },
  ): Promise<Subscription> {
    let payload: JwtPayloadType;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayloadType>(data.token, {
        secret: this.configService.getOrThrow('auth.secret', {
          infer: true,
        }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.id) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.usersService.findById(payload.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.subscriptionsService.verifyPaystackAddonPurchase(
      data.reference,
      user,
    );
  }

  @Post('cancel')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: Subscription })
  async cancel(@Request() request): Promise<Subscription> {
    return this.subscriptionsService.cancelSubscription(request.user.id);
  }
}
