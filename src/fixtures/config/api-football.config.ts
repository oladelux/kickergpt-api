import { registerAs } from '@nestjs/config';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { ApiFootballConfig } from './api-football-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsNotEmpty()
  API_FOOTBALL_TOKEN: string;

  @IsOptional()
  @IsString()
  API_FOOTBALL_BASE_URL?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  API_FOOTBALL_MIN_INTERVAL_MS?: number;
}

export default registerAs<ApiFootballConfig>('apiFootball', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    apiToken: process.env.API_FOOTBALL_TOKEN as string,
    baseUrl:
      process.env.API_FOOTBALL_BASE_URL ?? 'https://v3.football.api-sports.io',
    minRequestIntervalMs: process.env.API_FOOTBALL_MIN_INTERVAL_MS
      ? parseInt(process.env.API_FOOTBALL_MIN_INTERVAL_MS, 10)
      : 1000,
  };
});
