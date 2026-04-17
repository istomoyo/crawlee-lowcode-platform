import { IsString, IsUrl } from 'class-validator';
import { TaskDebugCookieDto } from './task-debug-cookie.dto';

export class PreviewScreenshotDto extends TaskDebugCookieDto {
  @IsUrl()
  @IsString()
  url: string;
}
