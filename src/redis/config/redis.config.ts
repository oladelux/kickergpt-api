import { registerAs } from '@nestjs/config';
import { IsNotEmpty, IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { RedisConfig } from './redis-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsNotEmpty()
  UPSTASH_REDIS_REST_URL: string;

  @IsString()
  @IsNotEmpty()
  UPSTASH_REDIS_REST_TOKEN: string;
}

export default registerAs<RedisConfig>('redis', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    restUrl: process.env.UPSTASH_REDIS_REST_URL as string,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  };
});
