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

class OutcomeProbabilitiesDto {
  @ApiProperty({
    example: 45.5,
    description: 'Home win probability (0-100)',
  })
  homeWin: number;

  @ApiProperty({
    example: 25.0,
    description: 'Draw probability (0-100)',
  })
  draw: number;

  @ApiProperty({
    example: 29.5,
    description: 'Away win probability (0-100)',
  })
  awayWin: number;
}

class PredictionFactorDto {
  @ApiProperty({
    example: 'Bookmaker Odds',
    description: 'Name of the factor',
  })
  name: string;

  @ApiProperty({
    example: 'Bookmakers favor Arsenal',
    description: 'Description of the factor influence',
  })
  description: string;

  @ApiProperty({
    example: 'home',
    enum: ['home', 'away', 'neutral'],
    description: 'Which team this factor favors',
  })
  impact: 'home' | 'away' | 'neutral';

  @ApiProperty({
    example: 0.4,
    description: 'Weight of this factor (0-1)',
  })
  weight: number;
}

class FavoredTeamDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ example: 'Arsenal' })
  name: string;
}

class GoalProbabilitiesDto {
  @ApiProperty({
    example: 62.5,
    description: 'Probability of goals being over threshold (0-100)',
  })
  over: number;

  @ApiProperty({
    example: 37.5,
    description: 'Probability of goals being under threshold (0-100)',
  })
  under: number;
}

class ResultPredictionDto {
  @ApiProperty({
    example: 'result',
    description: 'Type of prediction: result for match outcome',
  })
  type: 'result';

  // --- Old fields (backward compatibility) ---
  @ApiProperty({
    example: 'home',
    enum: ['home', 'away', 'draw'],
    description: 'Predicted winner of the match (legacy field)',
  })
  result: 'home' | 'away' | 'draw';

  @ApiProperty({
    example: 45.5,
    description: 'Probability percentage (0-100)',
  })
  probability: number;

  @ApiProperty({
    example: 'medium',
    enum: ['very high', 'high', 'medium', 'low'],
    description:
      'Confidence level: very high (>=90%), high (>=70% and <90%), medium (>=50% and <70%), low (<50%)',
  })
  confidence: 'very high' | 'high' | 'medium' | 'low';

  // --- New fields ---
  @ApiProperty({
    type: OutcomeProbabilitiesDto,
    description: 'Probabilities for all three outcomes',
  })
  probabilities: OutcomeProbabilitiesDto;

  @ApiProperty({
    example: 'home',
    enum: ['home', 'away', 'draw'],
    description: 'The predicted outcome',
  })
  predictedOutcome: 'home' | 'away' | 'draw';

  @ApiProperty({
    type: FavoredTeamDto,
    nullable: true,
    description: 'The favored team (null for draw prediction)',
  })
  favoredTeam: FavoredTeamDto | null;

  @ApiProperty({
    type: [PredictionFactorDto],
    description: 'Key factors that influenced this prediction (top 3)',
  })
  keyFactors: PredictionFactorDto[];

  @ApiProperty({
    example: 'Arsenal are favorites to win (medium confidence)',
    description: 'Human-readable summary for UI display',
  })
  summary: string;
}

class GoalPredictionDto {
  @ApiProperty({
    example: 'over_2_5_goals',
    enum: ['over_1_5_goals', 'over_2_5_goals'],
    description: 'Type of prediction: over_1_5_goals or over_2_5_goals',
  })
  type: 'over_1_5_goals' | 'over_2_5_goals';

  @ApiProperty({
    example: 'over',
    enum: ['over', 'under'],
    description: 'The predicted outcome: over or under',
  })
  predictedOutcome: 'over' | 'under';

  @ApiProperty({
    example: 72.5,
    description: 'Probability of the predicted outcome (0-100)',
  })
  probability: number;

  @ApiProperty({
    example: 'high',
    enum: ['very high', 'high', 'medium', 'low'],
    description:
      'Confidence level: very high (>=90%), high (>=70% and <90%), medium (>=50% and <70%), low (<50%)',
  })
  confidence: 'very high' | 'high' | 'medium' | 'low';

  @ApiProperty({
    type: GoalProbabilitiesDto,
    description: 'Probabilities for both outcomes',
  })
  probabilities: GoalProbabilitiesDto;

  @ApiProperty({
    example: 2.5,
    description: 'Goal threshold (1.5 or 2.5)',
  })
  threshold: number;

  @ApiProperty({
    type: [PredictionFactorDto],
    description: 'Key factors that influenced this prediction (top 3)',
  })
  keyFactors: PredictionFactorDto[];

  @ApiProperty({
    example: 'Over 2.5 goals predicted (high confidence, ~3.2 expected goals)',
    description: 'Human-readable summary for UI display',
  })
  summary: string;
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

  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: '#/components/schemas/ResultPredictionDto' },
        { $ref: '#/components/schemas/GoalPredictionDto' },
      ],
    },
    description:
      'Array of predictions for this fixture (result, over 1.5 goals, over 2.5 goals)',
  })
  predictions: (ResultPredictionDto | GoalPredictionDto)[];

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
