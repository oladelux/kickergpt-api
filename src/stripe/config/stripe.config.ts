import { registerAs } from '@nestjs/config';
import { IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { StripeConfig } from './stripe-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  STRIPE_SECRET_KEY: string;

  @IsString()
  STRIPE_WEBHOOK_SECRET: string;

  @IsString()
  STRIPE_PRO_USD_PRICE_ID: string;

  @IsString()
  STRIPE_PRO_EUR_PRICE_ID: string;

  @IsString()
  STRIPE_PRO_NGN_PRICE_ID: string;

  @IsString()
  STRIPE_PRO_GBP_PRICE_ID: string;

  @IsString()
  STRIPE_SUCCESS_URL: string;

  @IsString()
  STRIPE_CANCEL_URL: string;
}

export default registerAs<StripeConfig>('stripe', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    secret: process.env.STRIPE_SECRET_KEY as string,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET as string,
    proPriceIdUsd: process.env.STRIPE_PRO_USD_PRICE_ID as string,
    proPriceIdEur: process.env.STRIPE_PRO_EUR_PRICE_ID as string,
    proPriceIdNgn: process.env.STRIPE_PRO_NGN_PRICE_ID as string,
    proPriceIdGbp: process.env.STRIPE_PRO_GBP_PRICE_ID as string,
    successUrl: process.env.STRIPE_SUCCESS_URL as string,
    cancelUrl: process.env.STRIPE_CANCEL_URL as string,
  };
});
