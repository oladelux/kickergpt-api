import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
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

  @ApiPropertyOptional({
    description:
      'Indicates if the payment is initiated from a native Capacitor app. When true, the success URL will be a deep link instead of a web URL.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isNativeUser?: boolean;
}
