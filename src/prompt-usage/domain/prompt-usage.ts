import { ApiProperty } from '@nestjs/swagger';

export class PromptUsage {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  promptsUsed: number;

  @ApiProperty()
  addonCredits: number;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
