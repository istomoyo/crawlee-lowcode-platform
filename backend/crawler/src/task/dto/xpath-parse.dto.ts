// dto/xpath-parse.dto.ts
import { IsString, IsUrl } from 'class-validator';

export class XpathParseDto {
  @IsUrl()
  url: string;

  @IsString()
  xpath: string;
}
