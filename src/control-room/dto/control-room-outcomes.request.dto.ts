import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ControlRoomOutcomesRequestDto {
  @ApiProperty({
    example: 123456,
    description: 'Fixture identifier to explain the outcome for.',
  })
  @Type(() => Number)
  @IsNumber()
  fixtureId: number;

  @ApiProperty({
    example: '2025-11-24',
    description: 'Date in YYYY-MM-DD format.',
  })
  @IsString()
  date: string;

  @ApiProperty({
    example: 'Why did Manchester United lose?',
    description: 'User question or follow-up question',
  })
  @IsString()
  @IsOptional()
  question?: string;

  @ApiProperty({
    example: 'conv_abc123',
    description: 'Conversation ID for follow-up questions',
    required: false,
  })
  @IsString()
  @IsOptional()
  conversationId?: string;
}
