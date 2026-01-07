import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '../../subscriptions/domain/subscription-plan.enum';

export class RevenueByPlanDto {
  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({
    example: 5000.0,
    description: 'Monthly Recurring Revenue (recurring subscriptions only)',
  })
  mrr: number;

  @ApiProperty({
    example: 60000.0,
    description: 'Annual Recurring Revenue (recurring subscriptions only)',
  })
  arr: number;

  @ApiProperty({
    example: 5500.0,
    description:
      'Total Monthly Revenue (includes prorated time-limited passes)',
  })
  totalMonthlyRevenue: number;

  @ApiProperty({
    example: 66000.0,
    description: 'Total Annual Revenue (includes prorated time-limited passes)',
  })
  totalAnnualRevenue: number;

  @ApiProperty({ example: 25, description: 'Number of active subscriptions' })
  activeSubscriptions: number;

  @ApiProperty({
    example: 'USD',
    description: 'Currency code (USD, EUR, GBP, NGN)',
  })
  currency: string;
}

export class TimeLimitedRevenueDto {
  @ApiProperty({
    example: 500.0,
    description: 'Monthly revenue from time-limited passes (prorated)',
  })
  monthlyRevenue: number;

  @ApiProperty({
    example: 6000.0,
    description: 'Annual revenue from time-limited passes (prorated)',
  })
  annualRevenue: number;

  @ApiProperty({
    example: 10,
    description: 'Number of active time-limited passes',
  })
  activeSubscriptions: number;

  @ApiProperty({
    example: 'NGN',
    description: 'Currency code',
  })
  currency: string;
}

export class RevenueByCountryDto {
  @ApiProperty({ example: 'US', nullable: true })
  countryCode: string | null;

  @ApiProperty({
    example: 5000.0,
    description: 'Monthly Recurring Revenue (recurring subscriptions only)',
  })
  mrr: number;

  @ApiProperty({
    example: 60000.0,
    description: 'Annual Recurring Revenue (recurring subscriptions only)',
  })
  arr: number;

  @ApiProperty({
    example: 5500.0,
    description:
      'Total Monthly Revenue (includes prorated time-limited passes)',
  })
  totalMonthlyRevenue: number;

  @ApiProperty({
    example: 66000.0,
    description: 'Total Annual Revenue (includes prorated time-limited passes)',
  })
  totalAnnualRevenue: number;

  @ApiProperty({ example: 25, description: 'Number of active subscriptions' })
  activeSubscriptions: number;

  @ApiProperty({
    example: 'USD',
    description: 'Currency code (USD, EUR, GBP, NGN)',
  })
  currency: string;

  @ApiProperty({
    type: [RevenueByPlanDto],
    description: 'Revenue breakdown by plan',
  })
  byPlan: RevenueByPlanDto[];

  @ApiProperty({
    type: TimeLimitedRevenueDto,
    nullable: true,
    description: 'Time-limited passes revenue breakdown (3-day, 7-day passes)',
  })
  timeLimitedRevenue: TimeLimitedRevenueDto | null;
}

export class FinancialMetricsDto {
  @ApiProperty({
    example: 10000.0,
    description:
      'Total Monthly Recurring Revenue (recurring subscriptions only)',
  })
  totalMrr: number;

  @ApiProperty({
    example: 120000.0,
    description:
      'Total Annual Recurring Revenue (recurring subscriptions only)',
  })
  totalArr: number;

  @ApiProperty({
    example: 11000.0,
    description:
      'Total Monthly Revenue (includes prorated time-limited passes)',
  })
  totalMonthlyRevenue: number;

  @ApiProperty({
    example: 132000.0,
    description: 'Total Annual Revenue (includes prorated time-limited passes)',
  })
  totalAnnualRevenue: number;

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

  @ApiProperty({
    type: TimeLimitedRevenueDto,
    nullable: true,
    description: 'Aggregated time-limited passes revenue (3-day, 7-day passes)',
  })
  totalTimeLimitedRevenue: TimeLimitedRevenueDto | null;
}

export class NigerianFinancialMetricsDto {
  @ApiProperty({
    example: 5000.0,
    description:
      'Nigerian Monthly Recurring Revenue (recurring subscriptions only)',
  })
  mrr: number;

  @ApiProperty({
    example: 60000.0,
    description:
      'Nigerian Annual Recurring Revenue (recurring subscriptions only)',
  })
  arr: number;

  @ApiProperty({
    example: 5500.0,
    description:
      'Total Monthly Revenue (includes prorated time-limited passes)',
  })
  totalMonthlyRevenue: number;

  @ApiProperty({
    example: 66000.0,
    description: 'Total Annual Revenue (includes prorated time-limited passes)',
  })
  totalAnnualRevenue: number;

  @ApiProperty({
    example: 50,
    description: 'Number of active Nigerian subscriptions',
  })
  activeSubscriptions: number;

  @ApiProperty({
    example: 'NGN',
    description: 'Currency code (always NGN for Nigerian metrics)',
  })
  currency: string;

  @ApiProperty({
    type: [RevenueByPlanDto],
    description: 'Revenue breakdown by plan for Nigerian users',
  })
  byPlan: RevenueByPlanDto[];

  @ApiProperty({
    type: TimeLimitedRevenueDto,
    nullable: true,
    description: 'Time-limited passes revenue breakdown (3-day, 7-day passes)',
  })
  timeLimitedRevenue: TimeLimitedRevenueDto | null;
}

export class NonNigerianFinancialMetricsDto {
  @ApiProperty({
    example: 5000.0,
    description:
      'Non-Nigerian Monthly Recurring Revenue (recurring subscriptions only)',
  })
  mrr: number;

  @ApiProperty({
    example: 60000.0,
    description:
      'Non-Nigerian Annual Recurring Revenue (recurring subscriptions only)',
  })
  arr: number;

  @ApiProperty({
    example: 5000.0,
    description:
      'Total Monthly Revenue (includes prorated time-limited passes)',
  })
  totalMonthlyRevenue: number;

  @ApiProperty({
    example: 60000.0,
    description: 'Total Annual Revenue (includes prorated time-limited passes)',
  })
  totalAnnualRevenue: number;

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

  @ApiProperty({
    type: TimeLimitedRevenueDto,
    nullable: true,
    description: 'Time-limited passes revenue breakdown (3-day, 7-day passes)',
  })
  timeLimitedRevenue: TimeLimitedRevenueDto | null;
}
