import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';

export class SelectedMatchesQueryDto {
  @ApiProperty({ example: 123456 })
  @Type(() => Number)
  @IsInt()
  league: number;

  @ApiProperty({ example: 2024 })
  @Type(() => Number)
  @IsInt()
  season: number;

  @ApiProperty({ example: '2024-08-04' })
  @IsISO8601()
  date: string;
}
