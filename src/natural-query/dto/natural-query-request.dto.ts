import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class NaturalQueryRequestDto {
  @ApiProperty({
    example: 'Give me matches that will get over 1.5 goals from England',
    description: 'Natural language query for searching football matches',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  query: string;
}
