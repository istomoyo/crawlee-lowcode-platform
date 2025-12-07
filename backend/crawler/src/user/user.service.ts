import { Injectable, BadRequestException, UnauthorizedException, Inject } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    private jwt: JwtService,

    @Inject('REDIS_CLIENT')
    private redis: Redis,
  ) {}

  /**
   * 注册
   */
  async register(dto: CreateUserDto) {
    const exist = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exist) throw new BadRequestException('邮箱已被注册');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = this.userRepo.create({
      email: dto.email,
      username: dto.username,
      avatar: dto.avatar ?? undefined,
      password: hashed,
    });

    const savedUser = await this.userRepo.save(user);

    // 转换成 UserResponseDto，自动去掉 password
    return plainToInstance(UserResponseDto, savedUser, { excludeExtraneousValues: true });
  }

  /**
   * 登录（生成 JWT + 单设备登录）
   */
async login(dto: LoginUserDto) {
  const user = await this.userRepo.findOne({ where: { email: dto.email } });
  if (!user) throw new UnauthorizedException('邮箱或密码错误');

  const ok = await bcrypt.compare(dto.password, user.password);
  if (!ok) throw new UnauthorizedException('邮箱或密码错误');

  const loginToken = this.generateToken();

  // 设置 Redis token，过期时间 24小时
  await this.redis.set(`user:token:${user.id}`, loginToken, 'EX', 24 * 60 * 60);

  const payload = { id: user.id, email: user.email, loginToken };
  const token = this.jwt.sign(payload);

  // 返回脱敏用户信息
  const userDto = plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });

  return { token, user: userDto };
}


  async logout(userId: number) {
    await this.redis.del(`user:token:${userId}`);
    return true;
  }

  private generateToken() {
    return Math.random().toString(36).slice(2) + Date.now();
  }
}
