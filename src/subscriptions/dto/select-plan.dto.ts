import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { SubscriptionPlan } from '../domain/subscription-plan.enum';

export class SelectPlanDto {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @ApiPropertyOptional({
    description:
      'ISO 3166-1 alpha-2 country code (e.g., US, NG, DE). Used to determine the appropriate currency for the subscription.',
    example: 'US',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;
}
