import { IsUrl, IsString, IsOptional } from 'class-validator';

export class JsPathParseDto {
  @IsUrl()
  @IsString()
  url: string;

  @IsString()
  jsPath: string;

  @IsOptional()
  @IsString()
  waitSelector?: string;
}
