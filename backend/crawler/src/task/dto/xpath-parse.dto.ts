// dto/xpath-parse.dto.ts
import { IsString, IsUrl, IsEnum, IsOptional } from 'class-validator';
import { TaskDebugCookieDto } from './task-debug-cookie.dto';

export class XpathParseDto extends TaskDebugCookieDto {
  @IsUrl()
  url: string;

  @IsString()
  xpath: string;

  @IsOptional()
  @IsEnum(['text', 'html', 'markdown', 'smart'])
  contentFormat?: 'text' | 'html' | 'markdown' | 'smart' = 'text';

  @IsOptional()
  includeShadow?: boolean;
}
