import { ApiProperty } from '@nestjs/swagger';

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
