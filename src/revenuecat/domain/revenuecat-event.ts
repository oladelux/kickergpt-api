import { ApiProperty } from '@nestjs/swagger';
import { RevenueCatEventType } from './revenuecat-event-type.enum';

export class RevenueCatEvent {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: RevenueCatEventType })
  eventType: RevenueCatEventType;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  transactionId: string;

  @ApiProperty({ nullable: true })
  productId: string | null;

  @ApiProperty({ nullable: true, type: [String] })
  entitlementIds: string[] | null;

  @ApiProperty({ nullable: true })
  expirationAt: Date | null;

  @ApiProperty({ nullable: true })
  store: string | null;

  @ApiProperty()
  rawData: Record<string, any>;

  @ApiProperty()
  processedAt: Date;

  @ApiProperty()
  createdAt: Date;
}

