import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class ControlRoomGuard implements CanActivate {
  private readonly allowedEmail = 'deluxscript@gmail.com';

  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const email: string | undefined = request.user?.email;

    if (email && email.toLowerCase() === this.allowedEmail.toLowerCase()) {
      return true;
    }

    const userId: string | undefined = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Control room access denied');
    }

    const user = await this.usersService.findById(userId);
    const resolvedEmail = user?.email?.toLowerCase();

    if (resolvedEmail && resolvedEmail === this.allowedEmail.toLowerCase()) {
      return true;
    }

    throw new UnauthorizedException('Control room access denied');
  }
}
