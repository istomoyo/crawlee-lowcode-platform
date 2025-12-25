import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsUrl()
  url: string;

  @IsOptional()
  @IsString()
  config?: string; // JSON 字符串

  @IsOptional()
  @IsString()
  script?: string;
}
