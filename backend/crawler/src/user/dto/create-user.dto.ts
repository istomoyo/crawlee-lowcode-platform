import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

/**
 * 创建用户 DTO（注册）
 */
export class CreateUserDto {
  /** 邮箱（必须合法） */
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  /** 密码（至少 6 位） */
  @MinLength(6, { message: '密码至少需要 6 位' })
  password: string;

  /** 用户名（显示名称） */
  @IsString({ message: '用户名必须是字符串' })
  username: string;

  /** 头像，可选 */
  @IsOptional()
  @IsString()
  avatar?: string;
}
