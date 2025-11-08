import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { StatusEnum } from '../statuses.enum';

export class StatusDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    enum: StatusEnum,
  })
  @IsOptional()
  @IsString()
  @IsEnum(StatusEnum)
  name?: StatusEnum;
}
