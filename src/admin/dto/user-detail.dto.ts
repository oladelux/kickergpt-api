import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '../../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../../subscriptions/domain/subscription-status.enum';
import { PaymentProvider } from '../../subscriptions/domain/payment-provider.enum';

export class UserSubscriptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ enum: PaymentProvider })
  paymentProvider: PaymentProvider;

  @ApiProperty({ nullable: true })
  stripeCustomerId: string | null;

  @ApiProperty({ nullable: true })
  stripeSubscriptionId: string | null;

  @ApiProperty({ nullable: true })
  paystackCustomerCode: string | null;

  @ApiProperty({ nullable: true })
  paystackSubscriptionCode: string | null;

  @ApiProperty({ nullable: true })
  currentPeriodEnd: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class UserPromptUsageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  promptsUsed: number;

  @ApiProperty()
  addonCredits: number;

  @ApiProperty()
  adCredits: number;

  @ApiProperty()
  purchasedCredits: number;

  @ApiProperty({ nullable: true })
  lastAdWatchedAt: Date | null;

  @ApiProperty()
  adsWatchedToday: number;

  @ApiProperty({ nullable: true })
  adsWatchDate: Date | null;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class UserDetailDto {
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

  @ApiProperty({ example: 'email' })
  provider: string;

  @ApiProperty({ nullable: true })
  socialId: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: UserSubscriptionDto, nullable: true })
  subscription: UserSubscriptionDto | null;

  @ApiProperty({ type: UserPromptUsageDto, nullable: true })
  promptUsage: UserPromptUsageDto | null;

  @ApiProperty({ example: 5, description: 'Number of strategies created' })
  strategyCount: number;

  @ApiProperty({ example: 42, description: 'Number of fixture chats' })
  fixtureChatCount: number;
}
