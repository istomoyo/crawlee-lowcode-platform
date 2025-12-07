import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import Redis from 'ioredis';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'your_jwt_secret_key',
    });
  }

  async validate(payload: any) {
    const { id, loginToken } = payload;

    // 单设备登录：对比 Redis 中保存的 token
    const latest = await this.redis.get(`user:token:${id}`);

    if (latest !== loginToken) {
      throw new UnauthorizedException('你的账号已在另一设备登录');
    }

    return payload; // 返回给 request.user
  }
}
