import { registerAs } from '@nestjs/config';
import { IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { RevenueCatConfig } from './revenuecat-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  REVENUECAT_WEBHOOK_SECRET: string;

  @IsString()
  REVENUECAT_API_KEY: string;
}

export default registerAs<RevenueCatConfig>('revenuecat', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    webhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET as string,
    apiKey: process.env.REVENUECAT_API_KEY as string,
  };
});
