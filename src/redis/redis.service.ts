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

  /**
   * Get all keys matching a pattern using SCAN (cursor-based iteration)
   * This is safer than KEYS for large datasets as it doesn't block Redis
   * @param pattern - Redis key pattern (e.g., 'fixture:*')
   * @param count - Approximate number of keys to return per scan (default: 100)
   * @returns Array of matching keys
   */
  async scanKeys(pattern: string, count = 100): Promise<string[]> {
    if (!this.client) {
      return [];
    }

    const allKeys: string[] = [];
    let cursor: string | number = 0;

    do {
      const [nextCursor, keys] = (await this.client.scan(cursor, {
        match: pattern,
        count,
      })) as [string | number, string[]];

      cursor = nextCursor;
      if (Array.isArray(keys)) {
        allKeys.push(...keys);
      }
    } while (String(cursor) !== '0');

    return allKeys;
  }
}
