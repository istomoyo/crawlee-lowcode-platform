import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTaskCookieCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  cookieString: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  cookieDomain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class UpdateTaskCookieCredentialDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cookieString?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  cookieDomain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class TaskCookieCredentialAuditDto {
  user?: string;
  ip?: string;
  userAgent?: string;
}

export class TaskCookieCredentialIdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  credentialId: number;
}
