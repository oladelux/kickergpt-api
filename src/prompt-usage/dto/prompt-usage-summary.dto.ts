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
  adCreditsRemaining: number;

  @ApiProperty()
  purchasedCreditsRemaining: number;

  @ApiProperty()
  addonCreditsRemaining: number;

  @ApiProperty()
  totalCreditsRemaining: number;

  @ApiProperty({
    description:
      'Indicates if user has unlimited prompts (Nigerian PRO users). When true, ignore monthlyAllowance/monthlyRemaining values.',
  })
  isUnlimited: boolean;
}
