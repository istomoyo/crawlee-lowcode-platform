// dto/selector-preview.dto.ts
import { IsString } from 'class-validator';

export class SelectorPreviewDto {
  @IsString()
  url: string;

  @IsString()
  selector: string;
}
