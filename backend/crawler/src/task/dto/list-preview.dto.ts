import { IsUrl, IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { TaskDebugCookieDto } from './task-debug-cookie.dto';

export class ListPreviewDto extends TaskDebugCookieDto {
  @IsUrl()
  @IsString()
  url: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetAspectRatio?: number; // 新增

  @IsOptional()
  @IsNumber()
  @Min(0)
  tolerance?: number; // 新增
}
