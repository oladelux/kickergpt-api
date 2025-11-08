import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<(number | string)[]>(
      'roles',
      [context.getClass(), context.getHandler()],
    );
    if (!roles?.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest();

    const userRoleName = request.user?.role?.name;

    if (!userRoleName) {
      return false;
    }

    return roles.map(String).includes(String(userRoleName));
  }
}
