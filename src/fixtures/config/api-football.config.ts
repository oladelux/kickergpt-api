import { registerAs } from '@nestjs/config';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { ApiFootballConfig } from './api-football-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsNotEmpty()
  API_FOOTBALL_TOKEN: string;

  @IsOptional()
  @IsString()
  API_FOOTBALL_BASE_URL?: string;
}

export default registerAs<ApiFootballConfig>('apiFootball', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    apiToken: process.env.API_FOOTBALL_TOKEN as string,
    baseUrl:
      process.env.API_FOOTBALL_BASE_URL ?? 'https://v3.football.api-sports.io',
  };
});
