import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { FilesModule } from './files/files.module';
import { AuthModule } from './auth/auth.module';
import databaseConfig from './database/config/database.config';
import authConfig from './auth/config/auth.config';
import appConfig from './config/app.config';
import mailConfig from './mail/config/mail.config';
import fileConfig from './files/config/file.config';
import path from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HeaderResolver, I18nModule } from 'nestjs-i18n';
import { TypeOrmConfigService } from './database/typeorm-config.service';
import { MailModule } from './mail/mail.module';
import { HomeModule } from './home/home.module';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AllConfigType } from './config/config.type';
import { SessionModule } from './session/session.module';
import { MailerModule } from './mailer/mailer.module';
import sportmonksConfig from './sportmonks/config/sportmonks.config';
import { SportmonksModule } from './sportmonks/sportmonks.module';
import apiFootballConfig from './fixtures/config/api-football.config';
import { FixturesModule } from './fixtures/fixtures.module';
import openAiConfig from './openai/config/openai.config';
import stripeConfig from './stripe/config/stripe.config';
import paystackConfig from './paystack/config/paystack.config';
import weatherConfig from './weather/config/weather.config';
import redisConfig from './redis/config/redis.config';
import adsConfig from './ads/config/ads.config';
import googlePlayConfig from './mobile-purchases/config/google-play.config';
import revenuecatConfig from './revenuecat/config/revenuecat.config';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PromptUsageModule } from './prompt-usage/prompt-usage.module';
import { AdminModule } from './admin/admin.module';
import { AdsModule } from './ads/ads.module';
import { MobilePurchasesModule } from './mobile-purchases/mobile-purchases.module';
import { RevenueCatModule } from './revenuecat/revenuecat.module';

const infrastructureDatabaseModule = TypeOrmModule.forRootAsync({
  useClass: TypeOrmConfigService,
  dataSourceFactory: async (options: DataSourceOptions) => {
    return new DataSource(options).initialize();
  },
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        authConfig,
        appConfig,
        mailConfig,
        fileConfig,
        sportmonksConfig,
        apiFootballConfig,
        openAiConfig,
        stripeConfig,
        paystackConfig,
        weatherConfig,
        redisConfig,
        adsConfig,
        googlePlayConfig,
        revenuecatConfig,
      ],
      envFilePath: ['.env'],
    }),
    ScheduleModule.forRoot(),
    infrastructureDatabaseModule,
    I18nModule.forRootAsync({
      useFactory: (configService: ConfigService<AllConfigType>) => ({
        fallbackLanguage: configService.getOrThrow('app.fallbackLanguage', {
          infer: true,
        }),
        loaderOptions: { path: path.join(__dirname, '/i18n/'), watch: true },
      }),
      resolvers: [
        {
          use: HeaderResolver,
          useFactory: (configService: ConfigService<AllConfigType>) => {
            return [
              configService.get('app.headerLanguage', {
                infer: true,
              }),
            ];
          },
          inject: [ConfigService],
        },
      ],
      imports: [ConfigModule],
      inject: [ConfigService],
    }),
    UsersModule,
    FilesModule,
    AuthModule,
    SessionModule,
    MailModule,
    MailerModule,
    HomeModule,
    SportmonksModule,
    FixturesModule,
    SubscriptionsModule,
    PromptUsageModule,
    AdminModule,
    AdsModule,
    MobilePurchasesModule,
    RevenueCatModule,
  ],
})
export class AppModule {}
