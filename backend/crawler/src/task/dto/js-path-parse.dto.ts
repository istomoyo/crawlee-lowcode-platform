import { IsUrl, IsString, IsOptional, IsBoolean } from 'class-validator';

export class JsPathParseDto {
  @IsUrl()
  @IsString()
  url: string;

  @IsString()
  jsPath: string;

  @IsOptional()
  @IsBoolean()
  parseHtml?: boolean = true;

  @IsOptional()
  @IsString()
  waitSelector?: string;
}
