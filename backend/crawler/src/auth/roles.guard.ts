// auth/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../user/entities/user-role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<UserRole[]>('roles', context.getHandler());
    if (!roles) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.role) {
      this.logger.warn(`Access denied: User ${user?.id || 'unknown'} missing role`);
      return false;
    }

    const hasRole = roles.includes(user.role);
    if (!hasRole) {
      this.logger.warn(`Access denied: User ${user.id} role ${user.role} not in required roles [${roles.join(', ')}]`);
    }

    return hasRole;
  }
}
