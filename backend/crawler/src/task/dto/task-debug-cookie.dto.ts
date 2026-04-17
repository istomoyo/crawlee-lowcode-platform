import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class TaskDebugCookieDto {
  @IsOptional()
  @IsBoolean()
  useCookie?: boolean;

  @IsOptional()
  @IsString()
  cookieString?: string;

  @IsOptional()
  @IsString()
  cookieDomain?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cookieCredentialId?: number;
}
