import { IsIn, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

interface StructureConfigShape {
  images?: string;
  files?: string;
  texts?: string;
  data?: string;
}

interface BrowserFlowConfigShape {
  detailPageField?: string;
  detailPageWaitSelector?: string;
  detailPageWaitTimeout?: number;
}

interface DownloadConfigShape {
  images?: boolean;
  files?: boolean;
  texts?: boolean;
  maxFileSize?: number;
  timeout?: number;
  strategy?: 'direct' | 'browser' | 'auto';
  browserFlow?: BrowserFlowConfigShape;
}

interface FieldMappingConfigShape {
  imageFields?: string[];
  fileFields?: string[];
  textFields?: string[];
}

interface PackageConfigShape {
  structure?: StructureConfigShape;
  download?: DownloadConfigShape;
  fieldMapping?: FieldMappingConfigShape;
}

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

class BrowserFlowConfig {
  @IsOptional()
  detailPageField?: string;

  @IsOptional()
  detailPageWaitSelector?: string;

  @IsOptional()
  detailPageWaitTimeout?: number;
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

  @IsOptional()
  @IsIn(['direct', 'browser', 'auto'])
  strategy?: 'direct' | 'browser' | 'auto';

  @IsOptional()
  @ValidateNested()
  @Type(() => BrowserFlowConfig)
  browserFlow?: BrowserFlowConfigShape;
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
  structure?: StructureConfigShape;

  @IsOptional()
  @ValidateNested()
  @Type(() => DownloadConfig)
  download?: DownloadConfigShape;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldMappingConfig)
  fieldMapping?: FieldMappingConfigShape;
}

export class PackageResultDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PackageConfigDto)
  packageConfig: PackageConfigShape;
}

