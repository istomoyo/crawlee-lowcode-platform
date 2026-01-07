// auth/jwt-auth.guard.ts
import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    // 从 cookie 获取 token
    const token = request.cookies?.token;
    if (token) {
      request.headers['authorization'] = `Bearer ${token}`;
    }

    return super.canActivate(context);
  }
}
