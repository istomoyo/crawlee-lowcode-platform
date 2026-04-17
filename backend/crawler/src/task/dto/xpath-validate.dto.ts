import { IsOptional, IsString, IsUrl } from 'class-validator';
import { TaskDebugCookieDto } from './task-debug-cookie.dto';

export class XpathValidateDto extends TaskDebugCookieDto {
  @IsUrl()
  url: string;

  @IsString()
  xpath: string;

  @IsOptional()
  @IsString()
  baseXpath?: string;

  @IsOptional()
  @IsString()
  sampleMode?: 'list' | 'example';
}
