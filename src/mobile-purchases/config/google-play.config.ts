import { registerAs } from '@nestjs/config';
import { IsString, IsOptional } from 'class-validator';
import { GooglePlayConfig } from './google-play-config.type';
import validateConfig from '../../utils/validate-config';

class EnvironmentVariablesValidator {
  @IsOptional()
  @IsString()
  GOOGLE_PLAY_SERVICE_ACCOUNT_KEY?: string;

  @IsOptional()
  @IsString()
  GOOGLE_PLAY_PACKAGE_NAME?: string;
}

export default registerAs<GooglePlayConfig>('googlePlay', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    serviceAccountKey:
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY || 'service-account.json',
    packageName:
      process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.bootroombot.app',
  };
});

