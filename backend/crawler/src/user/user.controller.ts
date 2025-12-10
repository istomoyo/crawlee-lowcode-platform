import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  UseGuards,
  Patch,
  UseInterceptors,
  UploadedFile,
  Query,
  Res,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
// import { Controller, Get, Req, UseGuards } from '@nestjs/common';
// import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { Express } from 'express';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from './entities/user-role.enum';
import { SuccessMessage } from '../common/decorators/success-message.decorator';
// import { Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  // 发送验证码
  @SuccessMessage('发送邮件成功')
  @Post('send-code')
  sendCode(
    @Body('email') email: string,
    @Body('captchaId') captchaId: string,
    @Body('captchaText') captchaText: string,
  ) {
    return this.userService.sendVerifyCode(email, captchaId, captchaText);
  }

  // user.controller.ts
  @SuccessMessage('注册成功')
  @Post('register')
  register(@Body() dto: CreateUserDto & { code: string }) {
    return this.userService.register(dto);
  }

  // 登录
  @SuccessMessage('登录成功')
  @Post('login')
  login(@Body() dto: LoginUserDto, @Res({ passthrough: true }) res: Response) {
    return this.userService.login(dto, res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @SuccessMessage('获取用户信息成功')
  getProfile(@Req() req) {
    return this.userService.getProfile(req.user!.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Req() req, @Body() dto: UpdateUserDto) {
    return this.userService.updateProfile(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password')
  changePassword(@Req() req, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, cb) => {
          const uniqueSuffix = `${req.user!.id}-${Date.now()}${extname(file.originalname)}`;
          cb(null, uniqueSuffix);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
          return cb(new Error('只允许上传图片文件!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.userService.updateAvatar(req.user!.id, file.filename);
  }

  @UseGuards(JwtAuthGuard)
  @Get('test')
  test(@Req() req) {
    return req.user;
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminOnly(@Req() req) {
    console.log(req.user);
    return { msg: '管理员可见' };
  }

  @Get('normal')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
  normalUser() {
    return { msg: '普通用户和管理员可见' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('all')
  getAllUsers(@Query() query) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const search = query.search || '';
    return this.userService.getAllUsers({ page, limit, search });
  }

  @Get('captcha')
  @SuccessMessage('获取验证码成功')
  async getCaptcha() {
    const { svg, captchaId } = await this.userService.createCaptcha();
    return {
      captchaId,
      svg,
    };
  }
}
