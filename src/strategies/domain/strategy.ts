import { ApiProperty } from '@nestjs/swagger';
import { StrategyCondition } from './strategy-condition';

export class Strategy {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description?: string;

  @ApiProperty({ type: 'array' })
  conditions: StrategyCondition[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

