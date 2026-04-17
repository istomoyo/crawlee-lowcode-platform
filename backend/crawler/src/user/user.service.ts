import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { Response } from 'express';
import * as fs from 'fs';
import { Repository, Like } from 'typeorm';
import * as path from 'path';
import { randomBytes, randomInt } from 'crypto';
import * as svgCaptcha from 'svg-captcha';
import { resolveAuthCookieConfig } from '../config/runtime-security';
import { MailService } from '../mail/mail.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './entities/user.entity';
import { UserRole } from './entities/user-role.enum';

@Injectable()
export class UserService {
  private static readonly LEGACY_AUTH_COOKIE_PATH = '/api';
  private readonly authCookieConfig = resolveAuthCookieConfig();

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwt: JwtService,
    private mailService: MailService,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
  ) {}

  async register(dto: CreateUserDto & { code: string }) {
    const exist = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exist) throw new BadRequestException('邮箱已被注册');

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
    await this.redis.del(`user:verify:${dto.email}`);

    return plainToInstance(UserResponseDto, savedUser, {
      excludeExtraneousValues: true,
    });
  }

  async login(dto: LoginUserDto, res: Response) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('邮箱或密码错误');

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('邮箱或密码错误');

    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const loginToken = this.generateToken();
    const expiresInSeconds = Math.max(
      60,
      Number(process.env.JWT_EXPIRES_IN ?? 86400) || 86400,
    );

    await this.redis.set(
      `user:token:${user.id}`,
      loginToken,
      'EX',
      expiresInSeconds,
    );

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      loginToken,
    };
    const token = this.jwt.sign(payload);

    this.clearLegacyAuthCookie(res);
    res.cookie(this.authCookieConfig.name, token, {
      httpOnly: true,
      secure: this.authCookieConfig.secure,
      sameSite: this.authCookieConfig.sameSite,
      path: this.authCookieConfig.path,
      domain: this.authCookieConfig.domain,
      maxAge: expiresInSeconds * 1000,
    });

    const userDto = plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });

    return { user: userDto };
  }

  async logout(userId: number, res: Response) {
    await this.redis.del(`user:token:${userId}`);
    res.clearCookie(this.authCookieConfig.name, {
      httpOnly: true,
      secure: this.authCookieConfig.secure,
      sameSite: this.authCookieConfig.sameSite,
      path: this.authCookieConfig.path,
      domain: this.authCookieConfig.domain,
    });
    this.clearLegacyAuthCookie(res);
    return true;
  }

  private generateToken() {
    return randomBytes(32).toString('hex');
  }

  private clearLegacyAuthCookie(res: Response) {
    if (this.authCookieConfig.path === UserService.LEGACY_AUTH_COOKIE_PATH) {
      return;
    }

    res.clearCookie(this.authCookieConfig.name, {
      httpOnly: true,
      secure: this.authCookieConfig.secure,
      sameSite: this.authCookieConfig.sameSite,
      path: UserService.LEGACY_AUTH_COOKIE_PATH,
      domain: this.authCookieConfig.domain,
    });
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

    if (user.avatar && !user.avatar.includes('default')) {
      const oldFilename = user.avatar.split('/').pop();

      if (oldFilename) {
        const oldFilePath = path.join(
          process.cwd(),
          'uploads',
          'avatars',
          oldFilename,
        );

        if (fs.existsSync(oldFilePath)) {
          await fs.promises.unlink(oldFilePath);
        }
      }
    }

    user.avatar = `/uploads/avatars/${filename}`;
    const savedUser = await this.userRepo.save(user);

    return plainToInstance(UserResponseDto, savedUser, {
      excludeExtraneousValues: true,
    });
  }

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

  async createCaptcha() {
    const captcha = svgCaptcha.create({
      size: 4,
      fontSize: 46,
      width: 120,
      height: 40,
      background: '#f2f3f5',
    });

    const captchaId = `captcha:${Date.now()}`;
    await this.redis.set(captchaId, captcha.text.toLowerCase(), 'EX', 180);

    return {
      captchaId,
      svg: captcha.data,
    };
  }

  async sendVerifyCode(email: string, captchaId: string, captchaText: string) {
    const savedCaptcha = await this.redis.get(captchaId);
    if (!savedCaptcha) throw new BadRequestException('图片验证码已过期');

    if (savedCaptcha !== captchaText.toLowerCase()) {
      throw new BadRequestException('图片验证码错误');
    }

    await this.redis.del(captchaId);

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.set(`user:verify:${email}`, code, 'EX', 5 * 60);

    await this.mailService.sendMail(
      email,
      '注册验证码',
      `您的验证码是：${code}，5 分钟内有效。`,
    );

    return true;
  }
}
