import { ApiProperty } from '@nestjs/swagger';

export class MobilePurchase {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  transactionId: string;

  @ApiProperty()
  platform: 'android' | 'ios';

  @ApiProperty()
  creditsGranted: number;

  @ApiProperty()
  purchaseDate: Date;

  @ApiProperty()
  verifiedAt: Date;

  @ApiProperty()
  rawReceipt: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

