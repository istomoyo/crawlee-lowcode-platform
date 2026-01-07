import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Get,
  Query,
  Delete,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TaskService } from './task.service';
import type { Request } from 'express';
import { SuccessMessage } from '../common/decorators/success-message.decorator';
import { XpathParseDto } from './dto/xpath-parse.dto';
import { XpathMatchDto } from './dto/xpath-match.dto';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { ListPreviewDto } from './dto/list-preview.dto';
import { PackageResultDto } from './dto/package-result.dto';

class JsPathParseDto {
  url: string;
  jsPath: string;
  waitSelector?: string;
  contentFormat?: 'text' | 'html' | 'markdown' = 'text';
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
    const { url, xpath, contentFormat } = body;
    return this.taskService.parseByXpath(url, xpath, contentFormat);
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
    const { url, jsPath, waitSelector, contentFormat } = body;
    return this.taskService.parseByJsPath(url, jsPath, waitSelector, contentFormat);
  }


  @SuccessMessage('任务执行成功')
  @Post('execute')
  async executeTask(@Body() body: ExecuteTaskDto, @Req() req: Request) {
    const { taskId, taskName, url, config, overrideConfig } = body;
    const user = req.user as { id: number };
    return this.taskService.executeTaskByCrawlee(
      taskId,
      taskName,
      url,
      config,
      overrideConfig,
      user.id,
    );
  }

  @Get('engine-status')
  async getEngineStatus() {
    return this.taskService.getCrawlerEngineStatus();
  }

  @Get('list')
  async getTaskList(
    @Req() req: Request,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    const user = req.user as { id: number };
    return this.taskService.getTaskList(user.id, {
      page: Number(page),
      limit: Number(limit),
      search,
    });
  }

  @Get('execution-result/:executionId')
  async getExecutionResult(@Param('executionId') executionId: string, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.taskService.getExecutionResult(parseInt(executionId), user.id);
  }

  @Delete()
  async deleteTask(@Body() body: { name: string; url: string }, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.taskService.deleteTaskByNameAndUrl(body.name, body.url, user.id);
  }

  @Get('statistics')
  async getStatistics(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.taskService.getStatistics(user.id);
  }

  @Post('package-result/:executionId')
  async packageResult(
    @Param('executionId') executionId: string,
    @Body() body: PackageResultDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    const packagePath = await this.taskService.packageExecutionResult(
      parseInt(executionId),
      user.id,
      body.packageConfig,
    );
    return {
      message: '打包成功',
      packagePath,
    };
  }
}
