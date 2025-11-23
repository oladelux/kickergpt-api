import { ApiProperty } from '@nestjs/swagger';

export class AdminMetricsDto {
  @ApiProperty({ example: 1234 })
  userCount: number;

  @ApiProperty({ example: 120 })
  newUsers7d: number;

  @ApiProperty({ example: 95 })
  newUsersPrev7d: number;

  @ApiProperty({
    example: 26,
    description: 'Percent change vs previous 7 days (positive = uptick)',
  })
  newUsers7dChangePct: number;

  @ApiProperty({ example: 5678 })
  fixtureChatCount: number;

  @ApiProperty({ example: 320 })
  fixtureChats7d: number;

  @ApiProperty({ example: 280 })
  fixtureChatsPrev7d: number;

  @ApiProperty({
    example: 14,
    description: 'Percent change vs previous 7 days (positive = uptick)',
  })
  fixtureChats7dChangePct: number;

  @ApiProperty({ example: 210 })
  activeUsers7d: number;

  @ApiProperty({ example: 190 })
  activeUsersPrev7d: number;

  @ApiProperty({
    example: 10,
    description: 'Percent change vs previous 7 days (positive = uptick)',
  })
  activeUsers7dChangePct: number;

  @ApiProperty({ example: 3.4, description: 'Average prompts used per user' })
  avgPromptUsagePerUser: number;

  @ApiProperty({ example: 120 })
  paidUserCount: number;

  @ApiProperty({ example: 42 })
  exhaustedPromptUserCount: number;
}
