import { ApiProperty } from '@nestjs/swagger';
import { Allow } from 'class-validator';

export class Status {
  @Allow()
  @ApiProperty({
    type: String,
  })
  id: string;

  @Allow()
  @ApiProperty({
    type: String,
    example: 'active',
  })
  name?: string;
}
