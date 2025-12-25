import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 更新用户 DTO（资料修改）
 * 继承 CreateUserDto，但所有字段变成可选
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  /** 用户名（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  username?: string;
}
