import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class RevenueCatWebhookEventDto {
  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  app_user_id: string;

  @ApiProperty()
  @IsString()
  product_id: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  entitlement_ids: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  expiration_at_ms?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  store?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  transaction_id?: string;
}

export class RevenueCatWebhookRequestDto {
  @ApiProperty()
  event: RevenueCatWebhookEventDto;
}

export class RevenueCatWebhookResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;
}

