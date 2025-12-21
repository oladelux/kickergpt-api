import { ApiProperty } from '@nestjs/swagger';

export class AdRewardBalanceDto {
  @ApiProperty()
  adCreditsRemaining: number;

  @ApiProperty()
  totalCreditsRemaining: number;
}

export class AdRewardResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  creditsGranted: number;

  @ApiProperty({ type: AdRewardBalanceDto })
  newBalance: AdRewardBalanceDto;

  @ApiProperty()
  nextAdAvailable: string | null;
}
