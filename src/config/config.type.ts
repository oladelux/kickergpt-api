import { AppConfig } from './app-config.type';
import { AuthConfig } from '../auth/config/auth-config.type';
import { DatabaseConfig } from '../database/config/database-config.type';
import { FileConfig } from '../files/config/file-config.type';
import { MailConfig } from '../mail/config/mail-config.type';
import { SportmonksConfig } from '../sportmonks/config/sportmonks-config.type';
import { ApiFootballConfig } from '../fixtures/config/api-football-config.type';
import { OpenAiConfig } from '../openai/config/openai-config.type';
import { StripeConfig } from '../stripe/config/stripe-config.type';
import { WeatherConfig } from '../weather/config/weather-config.type';

export type AllConfigType = {
  app: AppConfig;
  auth: AuthConfig;
  database: DatabaseConfig;
  file: FileConfig;
  mail: MailConfig;
  sportmonks: SportmonksConfig;
  apiFootball: ApiFootballConfig;
  openAi: OpenAiConfig;
  stripe: StripeConfig;
  weather?: WeatherConfig;
};
