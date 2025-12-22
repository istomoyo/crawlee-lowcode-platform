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
import { IsString, IsUrl, IsOptional, Min, IsNumber } from 'class-validator';
import { XpathParseDto } from './dto/xpath-parse.dto';
import { XpathMatchDto } from './dto/xpath-match.dto';
// import fetch from 'node-fetch'; // 或 node 18+ 内置 fetch
import {
  Response,
  Query,
  Get,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
class ListPreviewDto {
  @IsUrl()
  @IsString()
  url: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetAspectRatio?: number; // 新增

  @IsOptional()
  @IsNumber()
  @Min(0)
  tolerance?: number; // 新增
}

class JsPathParseDto {
  @IsUrl()
  @IsString()
  url: string;

  @IsString()
  jsPath: string;

  @IsOptional()
  @IsString()
  waitSelector?: string;
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
    const { url, targetAspectRatio = 1, tolerance = 0.3 } = body;
    return this.taskService.captureListItemsByXpath(
      url,
      3,
      1000,
      500000,
      targetAspectRatio,
      tolerance,
    );
  }

  // task.controller.ts
  @Post('xpath-parse')
  async parseByXpath(@Body() body: XpathParseDto) {
    const { url, xpath } = body;
    return this.taskService.parseByXpath(url, xpath);
  }

  @Post('xpath-match')
  async matchByXpath(@Body() body: XpathMatchDto) {
    const { url, xpath } = body;
    return this.taskService.matchByXpath(url, xpath);
  }
  @Post('xpath-parse-all')
  async parseByXpathAll(@Body() body: XpathParseDto) {
    const { url, xpath } = body;
    return this.taskService.parseByXpathAll(url, xpath);
  }
  @Post('jspath-parse')
  async parseByJsPath(@Body() body: JsPathParseDto) {
    const { url, jsPath, waitSelector } = body;
    return this.taskService.parseByJsPath(url, jsPath, waitSelector);
  }
}
