import { registerAs } from '@nestjs/config';

import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsBoolean,
  IsEmail,
} from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { MailConfig } from './mail-config.type';

class EnvironmentVariablesValidator {
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  MAIL_PORT: number;

  @IsString()
  MAIL_HOST: string;

  @IsString()
  @IsOptional()
  MAIL_USER: string;

  @IsString()
  @IsOptional()
  MAIL_PASSWORD: string;

  @IsEmail()
  MAIL_DEFAULT_EMAIL: string;

  @IsString()
  MAIL_DEFAULT_NAME: string;

  @IsBoolean()
  MAIL_IGNORE_TLS: boolean;

  @IsBoolean()
  MAIL_SECURE: boolean;

  @IsBoolean()
  MAIL_REQUIRE_TLS: boolean;

  @IsBoolean()
  @IsOptional()
  MAIL_ENABLED: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  MAIL_RATE_LIMIT_PER_SECOND: number;

  @IsBoolean()
  @IsOptional()
  MAIL_RATE_LIMIT_ENABLED: boolean;
}

export default registerAs<MailConfig>('mail', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    port: process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT, 10) : 587,
    host: process.env.MAIL_HOST,
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    defaultEmail: process.env.MAIL_DEFAULT_EMAIL,
    defaultName: process.env.MAIL_DEFAULT_NAME,
    ignoreTLS: process.env.MAIL_IGNORE_TLS === 'true',
    secure: process.env.MAIL_SECURE === 'true',
    requireTLS: process.env.MAIL_REQUIRE_TLS === 'true',
    enabled:
      process.env.MAIL_ENABLED !== undefined
        ? process.env.MAIL_ENABLED === 'true'
        : true,
    rateLimitPerSecond: process.env.MAIL_RATE_LIMIT_PER_SECOND
      ? parseInt(process.env.MAIL_RATE_LIMIT_PER_SECOND, 10)
      : 2,
    rateLimitEnabled:
      process.env.MAIL_RATE_LIMIT_ENABLED !== undefined
        ? process.env.MAIL_RATE_LIMIT_ENABLED === 'true'
        : true,
  };
});
