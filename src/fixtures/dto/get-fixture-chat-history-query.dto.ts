import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetFixtureChatHistoryQueryDto {
  @ApiProperty({
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiProperty({
    required: false,
    default: 0,
    minimum: 0,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  offset = 0;
}
