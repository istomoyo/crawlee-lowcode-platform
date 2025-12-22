// dto/xpath-parse.dto.ts
import { IsString, IsUrl, IsBoolean, IsOptional } from 'class-validator';

export class XpathParseDto {
  @IsUrl()
  url: string;

  @IsString()
  xpath: string;

  @IsOptional()
  includeShadow?: boolean;
}
