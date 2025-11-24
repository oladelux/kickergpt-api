import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class ControlRoomGuard implements CanActivate {
  private readonly allowedEmail = 'deluxscript@gmail.com';

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email: string | undefined = request.user?.email;

    if (email && email.toLowerCase() === this.allowedEmail.toLowerCase()) {
      return true;
    }

    throw new UnauthorizedException('Control room access denied');
  }
}
