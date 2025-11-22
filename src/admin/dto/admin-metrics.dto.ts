import { ApiProperty } from '@nestjs/swagger';

export class AdminMetricsDto {
  @ApiProperty({ example: 1234 })
  userCount: number;

  @ApiProperty({ example: 5678 })
  fixtureChatCount: number;

  @ApiProperty({ example: 3.4, description: 'Average prompts used per user' })
  avgPromptUsagePerUser: number;

  @ApiProperty({ example: 120 })
  paidUserCount: number;

  @ApiProperty({ example: 42 })
  exhaustedPromptUserCount: number;
}
