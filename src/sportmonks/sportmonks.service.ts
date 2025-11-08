import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { AllConfigType } from '../config/config.type';
import { SportmonksConfig } from './config/sportmonks-config.type';
import {
  SportmonksFixturesRequestOptions,
  SportmonksFixturesResponse,
} from './types/fixture';

@Injectable()
export class SportmonksService {
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const sportmonksConfig = this.configService.getOrThrow<SportmonksConfig>(
      'sportmonks',
      {
        infer: true,
      },
    );

    this.apiToken = sportmonksConfig.apiToken;
    this.baseUrl = sportmonksConfig.baseUrl.replace(/\/$/, '');
  }

  async getFixturesByDate(
    date: string,
    options: SportmonksFixturesRequestOptions = {},
  ): Promise<SportmonksFixturesResponse> {
    return this.get<SportmonksFixturesResponse>(
      `/fixtures/date/${date}`,
      options,
    );
  }

  private async get<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const sanitizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${sanitizedPath}`);

    url.searchParams.set('api_token', this.apiToken);

    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === 'undefined') {
        return;
      }
      url.searchParams.set(key, String(value));
    });

    return new Promise<T>((resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        },
        (response) => {
          const chunks: Uint8Array[] = [];

          response.on('data', (chunk) => {
            chunks.push(chunk);
          });

          response.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            let parsedBody: unknown = rawBody;

            if (rawBody.length > 0) {
              try {
                parsedBody = JSON.parse(rawBody);
              } catch {
                reject(
                  new InternalServerErrorException(
                    'Failed to parse Sportmonks API response.',
                  ),
                );
                return;
              }
            } else {
              parsedBody = undefined;
            }

            const statusCode = response.statusCode ?? HttpStatus.BAD_GATEWAY;

            if (statusCode >= 200 && statusCode < 300) {
              resolve(parsedBody as T);
              return;
            }

            reject(
              new HttpException(
                {
                  message: 'Sportmonks API request failed.',
                  statusCode,
                  error: parsedBody,
                },
                HttpStatus.BAD_GATEWAY,
              ),
            );
          });
        },
      );

      request.on('error', (error) => {
        reject(
          new InternalServerErrorException(
            `Unable to reach Sportmonks API. ${error.message}`,
          ),
        );
      });

      request.end();
    });
  }
}
