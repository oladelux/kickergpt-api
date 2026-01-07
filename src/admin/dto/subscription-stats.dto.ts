import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '../../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../../subscriptions/domain/subscription-status.enum';

export class SubscriptionListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ nullable: true })
  countryCode: string | null;

  @ApiProperty({ nullable: true })
  userEmail: string | null;

  @ApiProperty({ nullable: true })
  userFirstName: string | null;

  @ApiProperty({ nullable: true })
  userLastName: string | null;

  @ApiProperty({ nullable: true })
  currentPeriodEnd: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class SubscriptionCountByPlanDto {
  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ example: 50 })
  count: number;
}

export class SubscriptionCountByStatusDto {
  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ example: 100 })
  count: number;
}

export class SubscriptionStatsDto {
  @ApiProperty({ example: 200, description: 'Total number of subscriptions' })
  total: number;

  @ApiProperty({
    type: [SubscriptionCountByPlanDto],
    description: 'Subscription counts grouped by plan',
  })
  byPlan: SubscriptionCountByPlanDto[];

  @ApiProperty({
    type: [SubscriptionCountByStatusDto],
    description: 'Subscription counts grouped by status',
  })
  byStatus: SubscriptionCountByStatusDto[];

  @ApiProperty({ example: 150, description: 'Number of active subscriptions' })
  activeCount: number;

  @ApiProperty({ example: 50, description: 'Number of inactive subscriptions' })
  inactiveCount: number;

  @ApiProperty({
    example: 25,
    description: 'New subscriptions in last 30 days',
  })
  newLast30Days: number;

  @ApiProperty({ example: 5, description: 'Churn rate percentage (0-100)' })
  churnRate: number;
}

export class SubscriptionByPlanDto {
  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ example: 50, description: 'Number of subscriptions' })
  count: number;

  @ApiProperty({
    example: 5000.0,
    description: 'Monthly Recurring Revenue in base currency',
  })
  mrr: number;

  @ApiProperty({
    example: 60000.0,
    description: 'Annual Recurring Revenue in base currency',
  })
  arr: number;
}
