import { ApiProperty } from '@nestjs/swagger';

export class PurchaseBalanceDto {
  @ApiProperty()
  purchasedCreditsRemaining: number;

  @ApiProperty()
  totalCreditsRemaining: number;
}

export class VerifyMobilePurchaseResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  creditsGranted: number;

  @ApiProperty()
  transactionId: string;

  @ApiProperty({ type: PurchaseBalanceDto })
  newBalance: PurchaseBalanceDto;
}

