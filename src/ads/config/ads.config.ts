import { registerAs } from '@nestjs/config';
import { IsInt, IsPositive } from 'class-validator';
import { AdsConfig } from './ads-config.type';
import validateConfig from '../../utils/validate-config';

class EnvironmentVariablesValidator {
  @IsInt()
  @IsPositive()
  MAX_ADS_PER_DAY: number;

  @IsInt()
  @IsPositive()
  AD_COOLDOWN_MINUTES: number;

  @IsInt()
  @IsPositive()
  CREDITS_PER_AD: number;
}

export default registerAs<AdsConfig>('ads', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    maxAdsPerDay: parseInt(process.env.MAX_ADS_PER_DAY ?? '20', 10),
    adCooldownMinutes: parseInt(process.env.AD_COOLDOWN_MINUTES ?? '5', 10),
    creditsPerAd: parseInt(process.env.CREDITS_PER_AD ?? '5', 10),
  };
});

