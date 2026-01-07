import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetTasksDto {
  @IsOptional()
  @IsString()
  status?: string;

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
  limit?: number = 10;
}

export class TaskMonitoringResponseDto {
  id: number;
  name: string;
  url: string;
  status: string;
  progress?: number;
  createdAt: Date;
  lastExecutionTime?: Date;
  user?: {
    id: number;
    username: string;
  } | null;
  executions?: Array<{
    id: number;
    status: string;
    startTime: Date;
    endTime?: Date;
    log: string;
  }>;
}

export class TaskStatsDto {
  totalTasks: number;
  runningTasks: number;
  successTasks: number;
  failedTasks: number;
}

export class TaskMonitoringListResponseDto {
  items: TaskMonitoringResponseDto[];
  stats: TaskStatsDto;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
