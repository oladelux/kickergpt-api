import { registerAs } from '@nestjs/config';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { WeatherConfig } from './weather-config.type';

class EnvironmentVariablesValidator {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  WEATHER_API_KEY?: string;

  @IsOptional()
  @IsString()
  WEATHER_BASE_URL?: string;

  @IsOptional()
  @IsString()
  @IsIn(['us', 'uk', 'metric', 'base'])
  WEATHER_UNIT_GROUP?: WeatherConfig['unitGroup'];
}

export default registerAs<WeatherConfig>('weather', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    apiKey: process.env.WEATHER_API_KEY as string,
    baseUrl:
      process.env.WEATHER_BASE_URL ??
      'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline',
    unitGroup:
      (process.env.WEATHER_UNIT_GROUP as WeatherConfig['unitGroup']) ??
      'metric',
  };
});
