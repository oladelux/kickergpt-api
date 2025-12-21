import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/domain/user';
import { SubscriptionPlan } from './subscription-plan.enum';
import { SubscriptionStatus } from './subscription-status.enum';
import { PaymentProvider } from './payment-provider.enum';

export class Subscription {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ enum: PaymentProvider })
  paymentProvider: PaymentProvider;

  @ApiProperty({ nullable: true })
  stripeSubscriptionId: string | null;

  @ApiProperty({ nullable: true })
  stripeCustomerId: string | null;

  @ApiProperty({ nullable: true })
  paystackCustomerCode: string | null;

  @ApiProperty({ nullable: true })
  paystackSubscriptionCode: string | null;

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
