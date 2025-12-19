import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class AdRewardRequestDto {
  @ApiProperty({
    example: 5,
    description: 'Number of credits earned from watching the ad',
  })
  @IsInt()
  @IsPositive()
  creditsEarned: number;
}

