import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTaskOrganizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => {
    if (value === null) {
      return null;
    }

    const normalized = String(value ?? '').trim();
    return normalized || null;
  })
  folder?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .slice(0, 12);
  })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}
