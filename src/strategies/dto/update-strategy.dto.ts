import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StrategyConditionDto } from './strategy-condition.dto';

export class UpdateStrategyDto {
  @ApiPropertyOptional({ description: 'Name of the strategy', maxLength: 255 })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Description of the strategy' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    type: [StrategyConditionDto],
    description: 'Array of conditions for the strategy',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one condition is required' })
  @ValidateNested({ each: true })
  @Type(() => StrategyConditionDto)
  @IsOptional()
  conditions?: StrategyConditionDto[];

  @ApiPropertyOptional({ description: 'Whether the strategy is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

