import { registerAs } from '@nestjs/config';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { OpenAiConfig } from './openai-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsNotEmpty()
  OPENAI_API_KEY: string;

  @IsOptional()
  @IsString()
  OPENAI_BASE_URL?: string;

  @IsOptional()
  @IsString()
  OPENAI_MODEL?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  OPENAI_TEMPERATURE?: number;
}

export default registerAs<OpenAiConfig>('openAi', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    apiKey: process.env.OPENAI_API_KEY as string,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: process.env.OPENAI_TEMPERATURE
      ? Number(process.env.OPENAI_TEMPERATURE)
      : 0.3,
  };
});
