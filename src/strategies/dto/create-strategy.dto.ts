import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StrategyConditionDto } from './strategy-condition.dto';

export class CreateStrategyDto {
  @ApiProperty({ description: 'Name of the strategy', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Description of the strategy' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    type: [StrategyConditionDto],
    description: 'Array of conditions for the strategy',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one condition is required' })
  @ValidateNested({ each: true })
  @Type(() => StrategyConditionDto)
  conditions: StrategyConditionDto[];

  @ApiPropertyOptional({
    description: 'Whether the strategy is active',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
