import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private readonly client?: Redis;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const redisConfig = this.configService.get('redis', {
      infer: true,
    });

    if (redisConfig) {
      this.client = new Redis({
        url: redisConfig.restUrl,
        token: redisConfig.restToken,
      });
      this.logger.log('Redis client initialized via Upstash REST API');
    } else {
      this.logger.warn('Redis config not found. Redis features are disabled.');
    }
  }

  pipeline() {
    if (!this.client) {
      return null;
    }
    return this.client.pipeline();
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }
    return this.client.get<T>(key);
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<T | 'OK' | null> {
    if (!this.client) {
      return null;
    }
    return this.client.set(
      key,
      value,
      ttlSeconds ? { ex: ttlSeconds } : undefined,
    );
  }

  async delete(key: string): Promise<number | null> {
    if (!this.client) {
      return null;
    }
    return this.client.del(key);
  }
}
