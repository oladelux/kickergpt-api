import { ApiProperty } from '@nestjs/swagger';

class FixtureAnalysisMetadataDto {
  @ApiProperty({ example: 'gpt-4o-mini' })
  model: string;

  @ApiProperty({ example: 512, required: false })
  promptTokens?: number;

  @ApiProperty({ example: 423, required: false })
  completionTokens?: number;

  @ApiProperty({ example: 935, required: false })
  totalTokens?: number;
}

export class FixtureAnalysisResponseDto {
  @ApiProperty({ example: 123456 })
  fixtureId: number;

  @ApiProperty({
    example:
      'Arsenal will lean on their high press to disrupt City, but the visitors hold a fitness edge.',
  })
  summary: string;

  @ApiProperty({ type: FixtureAnalysisMetadataDto })
  metadata: FixtureAnalysisMetadataDto;
}
