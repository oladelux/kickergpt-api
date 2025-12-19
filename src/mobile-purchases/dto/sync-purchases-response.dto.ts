import { ApiProperty } from '@nestjs/swagger';

export class SyncPurchasesResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  purchasesSynced: number;

  @ApiProperty()
  creditsAdded: number;
}

