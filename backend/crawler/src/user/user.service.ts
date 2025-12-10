import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Repository, Like } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from './dto/user-response.dto';
import { MailService } from '../mail/mail.service'; // 导入 MailService
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserRole } from './entities/user-role.enum';
import * as svgCaptcha from 'svg-captcha';
import { Response } from 'express'; // 导入 Response 类型

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    private jwt: JwtService,

    private mailService: MailService, // 注入 MailService

    @Inject('REDIS_CLIENT')
    private redis: Redis,
  ) {}

  /**
   * 注册
   */
  // 注册
  async register(dto: CreateUserDto & { code: string }) {
    const exist = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exist) throw new BadRequestException('邮箱已被注册');

    // 校验验证码
    const redisCode = await this.redis.get(`user:verify:${dto.email}`);
    if (!redisCode) throw new BadRequestException('验证码已过期');
    if (redisCode !== dto.code) throw new BadRequestException('验证码错误');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = this.userRepo.create({
      email: dto.email,
      username: dto.username,
      avatar: dto.avatar ?? undefined,
      password: hashed,
      role: UserRole.USER,
    });

    const savedUser = await this.userRepo.save(user);

    // 删除 Redis 验证码
    await this.redis.del(`user:verify:${dto.email}`);

    // 返回脱敏用户
    return plainToInstance(UserResponseDto, savedUser, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * 登录（生成 JWT + 单设备登录）
   */
  async login(dto: LoginUserDto, res: Response) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('邮箱或密码错误');

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('邮箱或密码错误');

    const loginToken = this.generateToken();

    // Redis 单设备登录
    await this.redis.set(
      `user:token:${user.id}`,
      loginToken,
      'EX',
      24 * 60 * 60,
    );

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      loginToken,
    };
    const token = this.jwt.sign(payload);

    // 写入 HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 1 天
      sameSite: 'lax', // 可按需修改
    });

    const userDto = plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });

    return { user: userDto }; // ✅ 不返回 token
  }

  async logout(userId: number) {
    await this.redis.del(`user:token:${userId}`);
    return true;
  }

  private generateToken() {
    return Math.random().toString(36).slice(2) + Date.now();
  }

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  async updateProfile(userId: number, dto: UpdateUserDto) {
    await this.userRepo.update(userId, dto);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  // user.service.ts
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');

    const ok = await bcrypt.compare(dto.oldPassword, user.password);
    if (!ok) throw new UnauthorizedException('旧密码错误');

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    user.password = hashed;
    await this.userRepo.save(user);

    return { message: '密码修改成功' };
  }

  async updateAvatar(userId: number, filename: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('用户不存在');

    user.avatar = `/uploads/avatars/${filename}`;
    const savedUser = await this.userRepo.save(user);

    return plainToInstance(UserResponseDto, savedUser, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * 获取用户列表（管理员可用）
   */
  async getAllUsers(params: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = params;

    const [users, total] = await this.userRepo.findAndCount({
      where: search
        ? [{ username: Like(`%${search}%`) }, { email: Like(`%${search}%`) }]
        : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      total,
      page,
      limit,
      users,
    };
  }

  /**
   * 生成图片验证码
   */
  async createCaptcha() {
    const captcha = svgCaptcha.create({
      size: 4,
      fontSize: 46,
      width: 120,
      height: 40,
      background: '#f2f3f5',
    });

    const captchaId = `captcha:${Date.now()}`;

    // 存 Redis，3 分钟有效
    await this.redis.set(captchaId, captcha.text.toLowerCase(), 'EX', 180);

    return {
      captchaId,
      svg: captcha.data,
    };
  }

  async sendVerifyCode(email: string, captchaId: string, captchaText: string) {
    // 校验图片验证码
    const savedCaptcha = await this.redis.get(captchaId);
    if (!savedCaptcha) throw new BadRequestException('图片验证码已过期');

    if (savedCaptcha !== captchaText.toLowerCase()) {
      throw new BadRequestException('图片验证码错误');
    }

    // 图片验证码验证通过，删除
    await this.redis.del(captchaId);

    // 生成6位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await this.redis.set(`user:verify:${email}`, code, 'EX', 5 * 60);

    await this.mailService.sendMail(
      email,
      '注册验证码',
      `您的验证码是：${code}，5分钟内有效`,
    );

    return true;
  }
}
