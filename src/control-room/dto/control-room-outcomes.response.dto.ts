import { ApiProperty } from '@nestjs/swagger';

export class ControlRoomOutcomeDto {
  @ApiProperty({ example: 123456 })
  fixtureId: number;

  @ApiProperty({ example: 'Team A' })
  homeTeam: string;

  @ApiProperty({ example: 'Team B' })
  awayTeam: string;

  @ApiProperty({
    example: { home: 2, away: 1, winner: 'home' },
    nullable: true,
  })
  finalScore: {
    home: number;
    away: number;
    winner: 'home' | 'away' | 'draw';
  } | null;

  @ApiProperty({ example: 'Team A edged it because...' })
  analysis: string;

  @ApiProperty({
    example: 'conv_abc123',
    description: 'Use this ID for follow-up questions',
  })
  conversationId: string;
}
