import { Injectable, UnauthorizedException, Inject, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import Redis from 'ioredis';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    this.logger.debug(`Validating token for user: ${payload.id}`);

    const { id, loginToken } = payload;
    const latest = await this.redis.get(`user:token:${id}`);

    // 如果 Redis 中没有 token，说明用户已登出
    if (latest === null) {
      throw new UnauthorizedException('未授权，请登录');
    }

    // 如果 token 不匹配，说明用户在另一设备登录
    if (latest !== loginToken) {
      throw new UnauthorizedException('你的账号已在另一设备登录');
    }

    return {
      id: payload.id,
      email: payload.email,
      role: payload.role, // 一定要返回
    };
  }
}
