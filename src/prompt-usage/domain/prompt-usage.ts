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
  adCredits: number;

  @ApiProperty()
  purchasedCredits: number;

  @ApiProperty()
  lastAdWatchedAt: Date | null;

  @ApiProperty()
  adsWatchedToday: number;

  @ApiProperty()
  adsWatchDate: Date | null;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
