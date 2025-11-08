import { ApiProperty } from '@nestjs/swagger';
import { FixtureAnalysisMetadata } from '../types/fixture-analysis.type';

export class FixtureChatMessageDto {
  @ApiProperty({ example: '8d5c2f62-8b9d-446e-882f-c1f35c3ad087' })
  id: string;

  @ApiProperty({ example: 123456 })
  fixtureId: number;

  @ApiProperty({
    example: 'Give me the analysis of this match.',
  })
  message: string;

  @ApiProperty({
    example: 'concise',
    required: false,
    nullable: true,
  })
  tone?: string | null;

  @ApiProperty({
    example:
      'Elche rarely beats Sociedad when the Basques close below 1.80, but head-to-head underdog wins have happened.',
  })
  summary: string;

  @ApiProperty({
    required: false,
    type: () => Object,
  })
  metadata?: FixtureAnalysisMetadata;

  @ApiProperty()
  createdAt: Date;
}
