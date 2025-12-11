import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TaskService } from './task.service';
import type { Request } from 'express';
import { SuccessMessage } from '../common/decorators/success-message.decorator';
import { IsString, IsUrl } from 'class-validator';

class ListPreviewDto {
  @IsUrl()
  @IsString()
  url: string;
}

@UseGuards(JwtAuthGuard)
@Controller('task')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}
  @SuccessMessage('截图成功')
  @Post('preview-screenshot')
  async previewScreenshot(@Body('url') url: string, @Req() req: Request) {
    const user = req.user as { id: number };
    const base64 = await this.taskService.capturePreviewScreenshot(url);
    return { screenshotBase64: `data:image/png;base64,${base64}` };
  }

  @Post('list-preview')
  async listPreview(@Body() body: ListPreviewDto): Promise<any> {
    const { url } = body;
    return this.taskService.captureListItemsByCss(url);
  }
}
