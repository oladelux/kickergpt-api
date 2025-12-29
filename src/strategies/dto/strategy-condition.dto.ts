import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsNumber,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { StrategyConditionType } from '../domain/strategy-condition-type.enum';
import { StrategyOperator } from '../domain/strategy-operator.enum';
import { StrategyTarget } from '../domain/strategy-target.enum';

export class StrategyConditionDto {
  @ApiProperty({ description: 'Unique identifier for the condition' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;

  @ApiProperty({
    enum: StrategyConditionType,
    description: 'Type of condition to evaluate',
  })
  @IsEnum(StrategyConditionType)
  type: StrategyConditionType;

  @ApiProperty({
    enum: StrategyOperator,
    description: 'Comparison operator',
  })
  @IsEnum(StrategyOperator)
  operator: StrategyOperator;

  @ApiProperty({ description: 'Value to compare against' })
  @IsNumber()
  value: number;

  @ApiProperty({
    enum: StrategyTarget,
    description: 'Target team(s) for the condition',
  })
  @IsEnum(StrategyTarget)
  target: StrategyTarget;

  @ApiPropertyOptional({
    description: 'Number of recent matches to consider (default: 5)',
    minimum: 1,
    maximum: 20,
    default: 5,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  lastMatches?: number;
}
