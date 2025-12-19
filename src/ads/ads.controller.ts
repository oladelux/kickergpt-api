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
import { AdsService } from './ads.service';
import { AdRewardRequestDto } from './dto/ad-reward-request.dto';
import { AdRewardResponseDto } from './dto/ad-reward-response.dto';

@ApiTags('Ads')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'ads',
  version: '1',
})
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  @Post('reward')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdRewardResponseDto })
  async grantReward(
    @Request() request,
    @Body() dto: AdRewardRequestDto,
  ): Promise<AdRewardResponseDto> {
    return this.adsService.grantAdReward(request.user.id, dto.creditsEarned);
  }
}
