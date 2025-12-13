import { registerAs } from '@nestjs/config';
import { IsString } from 'class-validator';
import { PaystackConfig } from './paystack-config.type';
import validateConfig from '../../utils/validate-config';

class EnvironmentVariablesValidator {
  @IsString()
  PAYSTACK_SECRET_KEY: string;

  @IsString()
  PAYSTACK_PUBLIC_KEY: string;

  @IsString()
  PAYSTACK_WEBHOOK_SECRET: string;

  @IsString()
  PAYSTACK_PRO_NGN_PLAN_CODE: string;

  @IsString()
  PAYSTACK_SUCCESS_URL: string;

  @IsString()
  PAYSTACK_CANCEL_URL: string;
}

export default registerAs<PaystackConfig>('paystack', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    secretKey: process.env.PAYSTACK_SECRET_KEY as string,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY as string,
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET as string,
    proPlanCodeNgn: process.env.PAYSTACK_PRO_NGN_PLAN_CODE as string,
    successUrl: process.env.PAYSTACK_SUCCESS_URL as string,
    cancelUrl: process.env.PAYSTACK_CANCEL_URL as string,
  };
});

