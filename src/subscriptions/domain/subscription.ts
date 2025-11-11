import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/domain/user';
import { SubscriptionPlan } from './subscription-plan.enum';
import { SubscriptionStatus } from './subscription-status.enum';

export class Subscription {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ nullable: true })
  stripeSubscriptionId: string | null;

  @ApiProperty()
  stripeCustomerId: string;

  @ApiProperty({ nullable: true })
  currentPeriodEnd: Date | null;

  @ApiProperty({ type: () => User, required: false })
  user?: User;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ nullable: true })
  deletedAt: Date | null;
}
