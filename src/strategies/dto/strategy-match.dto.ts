import { ApiProperty } from '@nestjs/swagger';

export class StrategyMatchDto {
  @ApiProperty({ description: 'Strategy ID' })
  strategyId: string;

  @ApiProperty({ description: 'Strategy name' })
  strategyName: string;

  @ApiProperty({
    type: 'array',
    description: 'Array of matching fixtures',
  })
  fixtures: Record<string, unknown>[];

  @ApiProperty({ description: 'Number of matched fixtures' })
  matchedCount: number;
}
