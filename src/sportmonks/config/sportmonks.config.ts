import { registerAs } from '@nestjs/config';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { SportmonksConfig } from './sportmonks-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsNotEmpty()
  SPORTMONKS_API_TOKEN: string;

  @IsOptional()
  @IsString()
  SPORTMONKS_BASE_URL?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  API_FOOTBALL_MIN_INTERVAL_MS?: number;
}

export default registerAs<SportmonksConfig>('sportmonks', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    apiToken: process.env.SPORTMONKS_API_TOKEN as string,
    baseUrl: process.env.SPORTMONKS_BASE_URL as string,
    minRequestIntervalMs: process.env.API_FOOTBALL_MIN_INTERVAL_MS
      ? parseInt(process.env.API_FOOTBALL_MIN_INTERVAL_MS, 10)
      : 1000,
  };
});
