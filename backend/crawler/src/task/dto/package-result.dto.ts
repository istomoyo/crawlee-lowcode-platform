import { IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class StructureConfig {
  @IsOptional()
  images?: string;

  @IsOptional()
  files?: string;

  @IsOptional()
  texts?: string;

  @IsOptional()
  data?: string;
}

class DownloadConfig {
  @IsOptional()
  images?: boolean;

  @IsOptional()
  files?: boolean;

  @IsOptional()
  texts?: boolean;

  @IsOptional()
  maxFileSize?: number;

  @IsOptional()
  timeout?: number;
}

class FieldMappingConfig {
  @IsOptional()
  imageFields?: string[];

  @IsOptional()
  fileFields?: string[];

  @IsOptional()
  textFields?: string[];
}

class PackageConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => StructureConfig)
  structure?: StructureConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => DownloadConfig)
  download?: DownloadConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldMappingConfig)
  fieldMapping?: FieldMappingConfig;
}

export class PackageResultDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PackageConfigDto)
  packageConfig: PackageConfigDto;
}

