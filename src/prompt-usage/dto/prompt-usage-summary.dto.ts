import { ApiProperty } from '@nestjs/swagger';
import { AddonType } from '../domain/addon-type.enum';

export class AddonPurchaseDto {
  @ApiProperty()
  addonType: AddonType;
}

export class PromptUsageSummaryDto {
  @ApiProperty()
  monthlyAllowance: number;

  @ApiProperty()
  monthlyUsed: number;

  @ApiProperty()
  monthlyRemaining: number;

  @ApiProperty()
  addonCreditsRemaining: number;
}
