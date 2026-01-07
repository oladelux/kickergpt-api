import { ApiProperty } from '@nestjs/swagger';

export class TopPromptUserDto {
  @ApiProperty({ example: 'uuid-user' })
  userId: string;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: 'John', nullable: true })
  firstName: string | null;

  @ApiProperty({ example: 'Doe', nullable: true })
  lastName: string | null;

  @ApiProperty({ example: 150, description: 'Total prompts used' })
  promptsUsed: number;

  @ApiProperty({ example: 10, description: 'Addon credits remaining' })
  addonCredits: number;

  @ApiProperty({ example: 5, description: 'Ad credits remaining' })
  adCredits: number;

  @ApiProperty({ example: 0, description: 'Purchased credits remaining' })
  purchasedCredits: number;
}

export class ExhaustedUserDto {
  @ApiProperty({ example: 'uuid-user' })
  userId: string;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: 'John', nullable: true })
  firstName: string | null;

  @ApiProperty({ example: 'Doe', nullable: true })
  lastName: string | null;

  @ApiProperty({ example: 10, description: 'Prompts used' })
  promptsUsed: number;

  @ApiProperty({ example: 0, description: 'Addon credits remaining' })
  addonCredits: number;

  @ApiProperty({ example: 0, description: 'Ad credits remaining' })
  adCredits: number;

  @ApiProperty({ example: 0, description: 'Purchased credits remaining' })
  purchasedCredits: number;
}

export class PromptUsageByCountryDto {
  @ApiProperty({ example: 'US', nullable: true })
  countryCode: string | null;

  @ApiProperty({ example: 1000, description: 'Total prompts used' })
  totalPromptsUsed: number;

  @ApiProperty({ example: 50, description: 'Number of users' })
  userCount: number;

  @ApiProperty({ example: 20.0, description: 'Average prompts per user' })
  avgPromptsPerUser: number;
}

export class PromptUsageStatsDto {
  @ApiProperty({
    example: 50000,
    description: 'Total prompts used across all users',
  })
  totalPromptsUsed: number;

  @ApiProperty({
    example: 1000,
    description: 'Total number of users with prompt usage',
  })
  totalUsers: number;

  @ApiProperty({ example: 50.0, description: 'Average prompts used per user' })
  avgPromptsPerUser: number;

  @ApiProperty({
    example: 42,
    description: 'Number of users who exhausted their prompts',
  })
  exhaustedUsersCount: number;

  @ApiProperty({
    example: 1000,
    description: 'Total addon credits across all users',
  })
  totalAddonCredits: number;

  @ApiProperty({
    example: 500,
    description: 'Total ad credits across all users',
  })
  totalAdCredits: number;

  @ApiProperty({
    example: 200,
    description: 'Total purchased credits across all users',
  })
  totalPurchasedCredits: number;
}
