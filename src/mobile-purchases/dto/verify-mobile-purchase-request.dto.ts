import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export class VerifyMobilePurchaseRequestDto {
  @ApiProperty({
    example: 'credits_50',
    description: 'The product ID purchased',
  })
  @IsString()
  productId: string;

  @ApiProperty({
    example: 'GPA.1234-5678-9012-34567',
    description: 'The transaction ID from the platform',
  })
  @IsString()
  transactionId: string;

  @ApiProperty({
    example: 'android',
    description: 'The platform (android or ios)',
    enum: ['android', 'ios'],
  })
  @IsEnum(['android', 'ios'])
  platform: 'android' | 'ios';
}

