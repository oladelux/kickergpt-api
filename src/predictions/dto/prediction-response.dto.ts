import { ApiProperty } from '@nestjs/swagger';

class PredictionTeamDto {
  @ApiProperty({ example: 123 })
  id: number;

  @ApiProperty({ example: 'Manchester United' })
  name: string;

  @ApiProperty({ example: 'https://example.com/logo.png', nullable: true })
  logo: string | null;
}

class PredictionLeagueDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 'Premier League' })
  name: string;

  @ApiProperty({ example: 'England' })
  country: string;
}

class PredictionDto {
  @ApiProperty({
    example: 'result',
    description: 'Type of prediction. Currently supports "result" for match outcome.',
  })
  type: 'result';

  @ApiProperty({
    example: 'home',
    enum: ['home', 'away'],
    description: 'Predicted winner of the match',
  })
  result: 'home' | 'away';

  @ApiProperty({
    example: 92.5,
    description: 'Probability percentage (0-100)',
  })
  probability: number;

  @ApiProperty({
    example: 'high',
    enum: ['high', 'very_high'],
    description: 'Confidence level: high (90-95%), very_high (95%+)',
  })
  confidence: 'high' | 'very_high';
}

export class FixturePredictionDto {
  @ApiProperty({ example: 18535517 })
  fixtureId: number;

  @ApiProperty({ type: PredictionTeamDto })
  homeTeam: PredictionTeamDto;

  @ApiProperty({ type: PredictionTeamDto })
  awayTeam: PredictionTeamDto;

  @ApiProperty({ example: '2024-12-23T15:00:00Z' })
  startingAt: string;

  @ApiProperty({ type: PredictionLeagueDto })
  league: PredictionLeagueDto;

  @ApiProperty({ type: [PredictionDto] })
  predictions: PredictionDto[];

  @ApiProperty({ example: '2024-12-23T00:00:00Z' })
  generatedAt: string;
}

export class TodayPredictionsResponseDto {
  @ApiProperty({
    example: '2024-12-23',
    description: 'The date these predictions are for',
  })
  date: string;

  @ApiProperty({
    type: [FixturePredictionDto],
    description: 'Array of high-confidence predictions',
  })
  predictions: FixturePredictionDto[];

  @ApiProperty({
    example: 150,
    description: 'Total number of fixtures analyzed to generate predictions',
  })
  totalFixturesAnalyzed: number;

  @ApiProperty({
    example: '2024-12-23T00:00:00Z',
    description: 'When these predictions were generated',
  })
  generatedAt: string;
}

