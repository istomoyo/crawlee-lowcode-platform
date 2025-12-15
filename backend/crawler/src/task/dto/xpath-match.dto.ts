// dto/xpath-match.dto.ts
import { IsString, IsUrl } from 'class-validator';

export class XpathMatchDto {
  @IsUrl()
  url: string;

  @IsString()
  xpath: string;
}
