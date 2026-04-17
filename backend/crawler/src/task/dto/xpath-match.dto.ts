// dto/xpath-match.dto.ts
import { IsString, IsUrl } from 'class-validator';
import { TaskDebugCookieDto } from './task-debug-cookie.dto';

export class XpathMatchDto extends TaskDebugCookieDto {
  @IsUrl()
  url: string;

  @IsString()
  xpath: string;
}
