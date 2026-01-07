import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '../../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../../subscriptions/domain/subscription-status.enum';

export class UserListItemDto {
  @ApiProperty({ example: 'uuid-user' })
  id: string;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: 'John', nullable: true })
  firstName: string | null;

  @ApiProperty({ example: 'Doe', nullable: true })
  lastName: string | null;

  @ApiProperty({ example: 'US', nullable: true })
  countryCode: string | null;

  @ApiProperty({ enum: SubscriptionPlan, nullable: true })
  subscriptionPlan: SubscriptionPlan | null;

  @ApiProperty({ enum: SubscriptionStatus, nullable: true })
  subscriptionStatus: SubscriptionStatus | null;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}
