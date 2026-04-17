import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { resolveAuthCookieConfig } from '../config/runtime-security';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly authCookieConfig = resolveAuthCookieConfig();

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.[this.authCookieConfig.name];

    if (token) {
      request.headers['authorization'] = `Bearer ${token}`;
    }

    return super.canActivate(context);
  }
}
