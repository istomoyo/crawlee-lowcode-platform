import { IsString, IsNumber, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class BasicSettingsDto {
  @IsString()
  systemName: string;

  @IsString()
  systemDescription: string;

  @IsString()
  adminEmail: string;

  @IsString()
  language: string;
}

export class CrawlerSettingsDto {
  @IsNumber()
  @Min(1)
  @Max(20)
  defaultConcurrency: number;

  @IsNumber()
  @Min(1)
  @Max(1000)
  maxRequestsPerCrawl: number;

  @IsNumber()
  @Min(5)
  @Max(300)
  requestTimeout: number;

  @IsNumber()
  @Min(1000)
  @Max(60000)
  waitForTimeout: number;

  @IsBoolean()
  enableProxy: boolean;

  @IsOptional()
  @IsString()
  proxyUrl?: string;
}

export class StorageSettingsDto {
  @IsNumber()
  @Min(1)
  @Max(365)
  datasetRetentionDays: number;

  @IsNumber()
  @Min(1)
  @Max(365)
  screenshotRetentionDays: number;

  @IsNumber()
  @Min(7)
  @Max(365)
  logRetentionDays: number;

  @IsBoolean()
  autoCleanup: boolean;

  @IsString()
  cleanupTime: string;
}

export class SecuritySettingsDto {
  @IsNumber()
  @Min(6)
  @Max(32)
  minPasswordLength: number;

  @IsNumber()
  @Min(3)
  @Max(10)
  loginFailLockCount: number;

  @IsNumber()
  @Min(5)
  @Max(1440)
  lockDurationMinutes: number;

  @IsBoolean()
  enableTwoFactor: boolean;

  @IsNumber()
  @Min(15)
  @Max(480)
  sessionTimeoutMinutes: number;
}

export class EmailSettingsDto {
  @IsBoolean()
  enableEmail: boolean;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsString()
  smtpUsername?: string;

  @IsOptional()
  @IsString()
  smtpPassword?: string;

  @IsOptional()
  @IsBoolean()
  smtpSSL?: boolean;

  @IsOptional()
  @IsString()
  fromEmail?: string;

  @IsOptional()
  @IsString()
  fromName?: string;
}

export class SystemInfoDto {
  startTime: string;
  version: string;
  status: string;
  uptime: number;
}

export class SystemSettingsDto {
  @IsOptional()
  basic?: BasicSettingsDto;

  @IsOptional()
  crawler?: CrawlerSettingsDto;

  @IsOptional()
  storage?: StorageSettingsDto;

  @IsOptional()
  security?: SecuritySettingsDto;

  @IsOptional()
  email?: EmailSettingsDto;
}
