import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  canActivate(context: ExecutionContext): boolean {
    const adminKey = this.configService.get<string>('app.adminApiKey', {
      infer: true,
    });

    if (!adminKey) {
      throw new UnauthorizedException('Admin API key is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const providedKey =
      request.headers['x-admin-key'] ||
      request.headers['x-adminapi-key'] ||
      request.headers['x-api-key'];

    if (typeof providedKey !== 'string') {
      throw new UnauthorizedException('Admin API key header missing');
    }

    if (providedKey !== adminKey) {
      throw new UnauthorizedException('Invalid admin API key');
    }

    return true;
  }
}
