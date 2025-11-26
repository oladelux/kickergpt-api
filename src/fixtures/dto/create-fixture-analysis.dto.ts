import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFixtureAnalysisDto {
  @ApiProperty({
    description:
      'Instruction or question for the AI about the selected fixture.',
    example: 'Give me a tactical preview for this match.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  message: string;

  @ApiProperty({
    description:
      'Optional tone or style hint for the response (e.g. concise, playful).',
    example: 'concise',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  tone?: string;

  @ApiProperty({
    description: 'Optional conversation ID for follow-up questions.',
    example: 'conv_abc123',
    required: false,
  })
  @IsString()
  @IsOptional()
  conversationId?: string;
}
