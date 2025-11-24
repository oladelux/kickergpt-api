import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class ControlRoomOutcomesRequestDto {
  @ApiProperty({
    example: 123456,
    description: 'Fixture identifier to explain the outcome for.',
  })
  @IsNumber()
  fixtureId: number;

  @ApiProperty({
    example: '2025-11-24',
    description: 'Date in YYYY-MM-DD format.',
  })
  @IsString()
  date: string;
}
