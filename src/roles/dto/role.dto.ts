import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { RoleEnum } from '../roles.enum';

export class RoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    enum: RoleEnum,
  })
  @IsOptional()
  @IsString()
  @IsEnum(RoleEnum)
  name?: RoleEnum;
}
