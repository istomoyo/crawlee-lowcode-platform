// auth/jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    // 从 cookie 获取 token
    const token = request.cookies?.token;
    if (token) {
      request.headers['authorization'] = `Bearer ${token}`;
    }

    console.log('JwtAuthGuard ==> 被触发了, token from cookie:', token);

    return super.canActivate(context);
  }
}
