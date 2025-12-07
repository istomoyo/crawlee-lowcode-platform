import { IsEmail, MinLength } from 'class-validator';

/**
 * 登录 DTO
 */
export class LoginUserDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @MinLength(6, { message: '密码至少需要 6 位' })
  password: string;
}
