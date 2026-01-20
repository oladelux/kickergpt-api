import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class NaturalQueryRequestDto {
  @ApiProperty({
    description: 'Natural language query for searching football matches',
    example:
      'Give me matches that will get over 1.5 goals from England this week',
    minLength: 2,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: 'Query cannot be empty' })
  @MinLength(2, { message: 'Query must be at least 2 characters long' })
  @MaxLength(500, { message: 'Query cannot exceed 500 characters' })
  query: string;

  @ApiPropertyOptional({
    description: 'Include detailed factors in the response',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeFactors?: boolean;

  @ApiPropertyOptional({
    description: 'Include suggestions in the response',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeSuggestions?: boolean;
}

/**
 * Example queries for documentation and testing
 */
export const EXAMPLE_QUERIES = [
  // Basic prediction type queries
  'Over 1.5 goals from England',
  'BTTS from La Liga',
  'Over 2.5 goals matches',
  'High-scoring fixtures from Germany',

  // With country filters
  'Give me matches that will get over 1.5 goals from England this week',
  'Which matches have BTTS potential from La Liga?',
  'Find me high-scoring fixtures from Germany tomorrow',
  'Show me confident predictions from Spain',

  // With confidence filters
  'Top 5 confident over 2.5 predictions',
  'Safest BTTS bets today',
  'Very confident home wins',

  // Result predictions
  'Home wins from Italy',
  'Away wins from France today',
  'Draws from England this week',

  // Short/casual queries
  'England matches',
  'BTTS',
  'Goals tomorrow',
  'Spain today',

  // Complex queries
  'Top 10 high-confidence BTTS from Premier League',
  'Over 2.5 goals from Germany with high confidence tomorrow',
];
