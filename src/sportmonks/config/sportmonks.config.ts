import { registerAs } from '@nestjs/config';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { SportmonksConfig } from './sportmonks-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsNotEmpty()
  SPORTMONKS_API_TOKEN: string;

  @IsOptional()
  @IsString()
  SPORTMONKS_BASE_URL?: string;
}

export default registerAs<SportmonksConfig>('sportmonks', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    apiToken: process.env.SPORTMONKS_API_TOKEN as string,
    baseUrl:
      process.env.SPORTMONKS_BASE_URL ??
      'https://api.sportmonks.com/v3/football',
  };
});
