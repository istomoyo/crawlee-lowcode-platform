import { IsOptional, IsString, IsEmail, IsEnum, IsBoolean, MinLength, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../../user/entities/user-role.enum';

export class GetUsersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  limit?: number = 10;
}

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  status: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UserResponseDto {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  status: string;
  avatar?: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

export class UserListResponseDto {
  items: UserResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
