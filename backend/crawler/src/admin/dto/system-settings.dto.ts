import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  IsIn,
  Matches,
} from 'class-validator';

export const CLEANUP_MODES = ['safe', 'standard', 'deep'] as const;
export type CleanupMode = (typeof CLEANUP_MODES)[number];
export const ANNOUNCEMENT_VARIANTS = ['info', 'success', 'warning'] as const;
export type AnnouncementVariant = (typeof ANNOUNCEMENT_VARIANTS)[number];
export const MAINTENANCE_VARIANTS = [
  'info',
  'success',
  'warning',
  'error',
] as const;
export type MaintenanceVariant = (typeof MAINTENANCE_VARIANTS)[number];

export class BasicSettingsDto {
  @IsString()
  systemName: string;

  @IsString()
  systemDescription: string;

  @IsString()
  adminEmail: string;

  @IsString()
  language: string;

  @IsBoolean()
  announcementEnabled: boolean;

  @IsOptional()
  @IsString()
  announcementTitle?: string;

  @IsOptional()
  @IsString()
  announcementContent?: string;

  @IsString()
  @IsIn(ANNOUNCEMENT_VARIANTS)
  announcementVariant: AnnouncementVariant;

  @IsBoolean()
  maintenanceEnabled: boolean;

  @IsOptional()
  @IsString()
  maintenanceTitle?: string;

  @IsOptional()
  @IsString()
  maintenanceContent?: string;

  @IsString()
  @IsIn(MAINTENANCE_VARIANTS)
  maintenanceVariant: MaintenanceVariant;

  @IsOptional()
  @IsString()
  maintenanceStartAt?: string;

  @IsOptional()
  @IsString()
  maintenanceEndAt?: string;
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
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  cleanupTime: string;

  @IsString()
  @IsIn(CLEANUP_MODES)
  cleanupMode: CleanupMode;
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

export class PlatformAnnouncementDto {
  enabled: boolean;
  title: string;
  content: string;
  variant: AnnouncementVariant;
}

export class PlatformInfoDto {
  systemName: string;
  systemDescription: string;
  announcement: PlatformAnnouncementDto;
  capabilities: {
    unsafeCustomJsEnabled: boolean;
  };
  maintenance?: {
    enabled: boolean;
    title: string;
    content: string;
    variant: MaintenanceVariant;
    startAt?: string;
    endAt?: string;
  };
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
