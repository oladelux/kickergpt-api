import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '../../subscriptions/domain/subscription-plan.enum';

export class RevenueByPlanDto {
  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

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

  @ApiProperty({ example: 25, description: 'Number of active subscriptions' })
  activeSubscriptions: number;
}

export class RevenueByCountryDto {
  @ApiProperty({ example: 'US', nullable: true })
  countryCode: string | null;

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

  @ApiProperty({ example: 25, description: 'Number of active subscriptions' })
  activeSubscriptions: number;

  @ApiProperty({
    type: [RevenueByPlanDto],
    description: 'Revenue breakdown by plan',
  })
  byPlan: RevenueByPlanDto[];
}

export class FinancialMetricsDto {
  @ApiProperty({
    example: 10000.0,
    description: 'Total Monthly Recurring Revenue in base currency',
  })
  totalMrr: number;

  @ApiProperty({
    example: 120000.0,
    description: 'Total Annual Recurring Revenue in base currency',
  })
  totalArr: number;

  @ApiProperty({
    example: 150,
    description: 'Total number of active paid subscriptions',
  })
  totalActiveSubscriptions: number;

  @ApiProperty({
    type: [RevenueByCountryDto],
    description: 'Revenue grouped by country',
  })
  byCountry: RevenueByCountryDto[];

  @ApiProperty({
    type: [RevenueByPlanDto],
    description: 'Revenue grouped by plan',
  })
  byPlan: RevenueByPlanDto[];
}

export class NigerianFinancialMetricsDto {
  @ApiProperty({
    example: 5000.0,
    description: 'Nigerian Monthly Recurring Revenue in NGN',
  })
  mrr: number;

  @ApiProperty({
    example: 60000.0,
    description: 'Nigerian Annual Recurring Revenue in NGN',
  })
  arr: number;

  @ApiProperty({
    example: 50,
    description: 'Number of active Nigerian subscriptions',
  })
  activeSubscriptions: number;

  @ApiProperty({
    type: [RevenueByPlanDto],
    description: 'Revenue breakdown by plan for Nigerian users',
  })
  byPlan: RevenueByPlanDto[];
}

export class NonNigerianFinancialMetricsDto {
  @ApiProperty({
    example: 5000.0,
    description: 'Non-Nigerian Monthly Recurring Revenue in base currency',
  })
  mrr: number;

  @ApiProperty({
    example: 60000.0,
    description: 'Non-Nigerian Annual Recurring Revenue in base currency',
  })
  arr: number;

  @ApiProperty({
    example: 100,
    description: 'Number of active non-Nigerian subscriptions',
  })
  activeSubscriptions: number;

  @ApiProperty({
    type: [RevenueByCountryDto],
    description: 'Revenue breakdown by country (excluding Nigeria)',
  })
  byCountry: RevenueByCountryDto[];

  @ApiProperty({
    type: [RevenueByPlanDto],
    description: 'Revenue breakdown by plan for non-Nigerian users',
  })
  byPlan: RevenueByPlanDto[];
}
