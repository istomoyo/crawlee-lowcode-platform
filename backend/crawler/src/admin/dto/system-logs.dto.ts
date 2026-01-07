import { IsOptional, IsString, IsNumber, IsDateString, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export class GetLogsDto {
  @IsOptional()
  @IsEnum(LogLevel)
  level?: LogLevel;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  limit?: number = 50;
}

export class LogEntryDto {
  id: number;
  timestamp: Date;
  level: LogLevel;
  module: string;
  user?: string;
  message: string;
  details?: any;
}

export class LogStatsDto {
  total: number;
  error: number;
  warn: number;
  info: number;
  debug: number;
}

export class LogListResponseDto {
  items: LogEntryDto[];
  stats: LogStatsDto;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
