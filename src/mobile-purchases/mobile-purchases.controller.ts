import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { MobilePurchasesService } from './mobile-purchases.service';
import { VerifyMobilePurchaseRequestDto } from './dto/verify-mobile-purchase-request.dto';
import { VerifyMobilePurchaseResponseDto } from './dto/verify-mobile-purchase-response.dto';
import { SyncPurchasesResponseDto } from './dto/sync-purchases-response.dto';

@ApiTags('Mobile Purchases')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'purchases',
  version: '1',
})
export class MobilePurchasesController {
  constructor(
    private readonly mobilePurchasesService: MobilePurchasesService,
  ) {}

  /**
   * @deprecated One-time IAP purchases have been replaced with RevenueCat subscriptions.
   * This endpoint is kept for backward compatibility but should no longer be used.
   */
  @Post('verify-mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VerifyMobilePurchaseResponseDto })
  async verifyMobilePurchase(
    @Request() request,
    @Body() dto: VerifyMobilePurchaseRequestDto,
  ): Promise<VerifyMobilePurchaseResponseDto> {
    return this.mobilePurchasesService.verifyAndGrantPurchase(
      request.user.id,
      dto.productId,
      dto.transactionId,
      dto.platform,
    );
  }

  /**
   * @deprecated Purchase syncing is now handled by RevenueCat webhooks.
   * This endpoint is kept for backward compatibility but should no longer be used.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SyncPurchasesResponseDto })
  async syncPurchases(@Request() request): Promise<SyncPurchasesResponseDto> {
    return this.mobilePurchasesService.syncPurchases(request.user.id);
  }
}
