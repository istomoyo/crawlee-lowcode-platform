import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuccessMessage } from '../common/decorators/success-message.decorator';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { ListPreviewDto } from './dto/list-preview.dto';
import { PackageResultDto } from './dto/package-result.dto';
import { PreviewScreenshotDto } from './dto/preview-screenshot.dto';
import {
  CreateTaskCookieCredentialDto,
  UpdateTaskCookieCredentialDto,
} from './dto/task-cookie-credential.dto';
import { GetTaskListDto } from './dto/task-list.dto';
import {
  CreateTaskTemplateDto,
  CreateTaskTemplateFromTaskDto,
  GetTaskTemplatesDto,
  UpdateTaskTemplateDto,
} from './dto/task-template.dto';
import { UpdateTaskOrganizationDto } from './dto/task-organization.dto';
import { XpathMatchDto } from './dto/xpath-match.dto';
import { XpathParseDto } from './dto/xpath-parse.dto';
import { XpathValidateDto } from './dto/xpath-validate.dto';
import { TaskCookieCredentialService } from './task-cookie-credential.service';
import { TaskTemplateService } from './task-template.service';
import { TaskService } from './task.service';

@UseGuards(JwtAuthGuard)
@Controller('task')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly taskCookieCredentialService: TaskCookieCredentialService,
    private readonly taskTemplateService: TaskTemplateService,
  ) {}

  @SuccessMessage('截图成功')
  @Post('preview-screenshot')
  async previewScreenshot(@Body() body: PreviewScreenshotDto, @Req() req: Request) {
    const user = req.user as { id: number };
    const base64 = await this.taskService.capturePreviewScreenshot(
      body.url,
      body,
      user.id,
    );
    return { screenshotBase64: `data:image/jpeg;base64,${base64}` };
  }

  @Post('list-preview')
  async listPreview(@Body() body: ListPreviewDto, @Req() req: Request): Promise<any> {
    const {
      url,
      targetAspectRatio = 1,
      tolerance = 0.3,
      useCookie,
      cookieString,
      cookieDomain,
      cookieCredentialId,
    } = body;

    return this.taskService.captureListItemsByXpath(
      url,
      3,
      1000,
      500000,
      targetAspectRatio,
      tolerance,
      {
        useCookie,
        cookieString,
        cookieDomain,
        cookieCredentialId,
      },
      (req.user as { id: number }).id,
    );
  }

  @Post('xpath-parse')
  async parseByXpath(@Body() body: XpathParseDto, @Req() req: Request) {
    const {
      url,
      xpath,
      contentFormat,
      useCookie,
      cookieString,
      cookieDomain,
      cookieCredentialId,
    } = body;

    return this.taskService.parseByXpath(
      url,
      xpath,
      undefined,
      contentFormat,
      {
        useCookie,
        cookieString,
        cookieDomain,
        cookieCredentialId,
      },
      (req.user as { id: number }).id,
    );
  }

  @Post('xpath-match')
  async matchByXpath(@Body() body: XpathMatchDto, @Req() req: Request) {
    const { url, xpath, useCookie, cookieString, cookieDomain, cookieCredentialId } = body;
    return this.taskService.matchByXpath(
      url,
      xpath,
      {
        useCookie,
        cookieString,
        cookieDomain,
        cookieCredentialId,
      },
      (req.user as { id: number }).id,
    );
  }

  @Post('xpath-validate')
  async validateXpath(@Body() body: XpathValidateDto, @Req() req: Request) {
    const {
      url,
      xpath,
      baseXpath,
      sampleMode,
      useCookie,
      cookieString,
      cookieDomain,
      cookieCredentialId,
    } = body;
    return this.taskService.validateXpath(
      url,
      xpath,
      baseXpath,
      sampleMode ?? 'list',
      {
        useCookie,
        cookieString,
        cookieDomain,
        cookieCredentialId,
      },
      (req.user as { id: number }).id,
    );
  }

  @Post('xpath-parse-all')
  async parseByXpathAll(@Body() body: XpathParseDto, @Req() req: Request) {
    const { url, xpath, useCookie, cookieString, cookieDomain, cookieCredentialId } = body;
    return this.taskService.parseByXpathAll(
      url,
      xpath,
      {
        useCookie,
        cookieString,
        cookieDomain,
        cookieCredentialId,
      },
      (req.user as { id: number }).id,
    );
  }

  @Get('cookie-credentials')
  async getCookieCredentials(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.taskCookieCredentialService.listCredentials(user.id);
  }

  @Get('cookie-credentials/:credentialId')
  async getCookieCredentialDetail(
    @Param('credentialId') credentialId: string,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.taskCookieCredentialService.getCredentialDetail(
      Number(credentialId),
      user.id,
    );
  }

  @SuccessMessage('Cookie 凭证创建成功')
  @Post('cookie-credentials')
  async createCookieCredential(
    @Body() body: CreateTaskCookieCredentialDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number; email?: string };
    return this.taskCookieCredentialService.createCredential(user.id, body, {
      user: user.email || `user:${user.id}`,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    });
  }

  @SuccessMessage('Cookie 凭证更新成功')
  @Put('cookie-credentials/:credentialId')
  async updateCookieCredential(
    @Param('credentialId') credentialId: string,
    @Body() body: UpdateTaskCookieCredentialDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number; email?: string };
    return this.taskCookieCredentialService.updateCredential(
      Number(credentialId),
      user.id,
      body,
      {
        user: user.email || `user:${user.id}`,
        ip: req.ip,
        userAgent: req.get('user-agent') || undefined,
      },
    );
  }

  @SuccessMessage('Cookie 凭证删除成功')
  @Delete('cookie-credentials/:credentialId')
  async deleteCookieCredential(
    @Param('credentialId') credentialId: string,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number; email?: string };
    return this.taskCookieCredentialService.deleteCredential(
      Number(credentialId),
      user.id,
      {
        user: user.email || `user:${user.id}`,
        ip: req.ip,
        userAgent: req.get('user-agent') || undefined,
      },
    );
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

  @Get('templates')
  async getTemplates(@Req() req: Request, @Query() query: GetTaskTemplatesDto) {
    const user = req.user as { id: number };
    return this.taskTemplateService.getTemplates(
      user.id,
      query.search,
      query.category,
    );
  }

  @Get('template-categories')
  async getTemplateCategories(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.taskTemplateService.getTemplateCategories(user.id);
  }

  @Get('templates/:templateId')
  async getTemplateDetail(
    @Param('templateId') templateId: string,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.taskTemplateService.getTemplateDetail(
      Number(templateId),
      user.id,
    );
  }

  @SuccessMessage('任务模板创建成功')
  @Post('templates')
  async createTemplate(@Body() body: CreateTaskTemplateDto, @Req() req: Request) {
    const user = req.user as { id: number; email?: string };
    return this.taskTemplateService.createTemplate(user.id, body, {
      user: user.email || `user:${user.id}`,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    });
  }

  @SuccessMessage('任务模板保存成功')
  @Post('templates/from-task')
  async createTemplateFromTask(
    @Body() body: CreateTaskTemplateFromTaskDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number; email?: string };
    return this.taskTemplateService.createTemplateFromTask(user.id, body, {
      user: user.email || `user:${user.id}`,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    });
  }

  @SuccessMessage('任务模板更新成功')
  @Put('templates/:templateId')
  async updateTemplate(
    @Param('templateId') templateId: string,
    @Body() body: UpdateTaskTemplateDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number; email?: string };
    return this.taskTemplateService.updateTemplate(
      Number(templateId),
      user.id,
      body,
      {
        user: user.email || `user:${user.id}`,
        ip: req.ip,
        userAgent: req.get('user-agent') || undefined,
      },
    );
  }

  @Get('engine-status')
  async getEngineStatus() {
    return this.taskService.getCrawlerEngineStatus();
  }

  @Get('workspace-overview')
  async getWorkspaceOverview(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.taskService.getWorkspaceOverview(user.id);
  }

  @Get('organization-options')
  async getTaskOrganizationOptions(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.taskService.getTaskOrganizationOptions(user.id);
  }

  @SuccessMessage('任务分组已更新')
  @Put(':taskId/organization')
  async updateTaskOrganization(
    @Param('taskId') taskId: string,
    @Body() body: UpdateTaskOrganizationDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.taskService.updateTaskOrganization(Number(taskId), user.id, body);
  }

  @Get('list')
  async getTaskList(@Req() req: Request, @Query() query: GetTaskListDto) {
    const user = req.user as { id: number };
    return this.taskService.getTaskList(user.id, query);
  }

  @Get('execution-result/:executionId')
  async getExecutionResult(
    @Param('executionId') executionId: string,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.taskService.getExecutionResult(parseInt(executionId, 10), user.id);
  }

  @Delete(':taskId')
  async deleteTaskById(@Param('taskId') taskId: string, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.taskService.deleteTask(Number(taskId), user.id);
  }

  @Delete()
  async deleteTask(
    @Body() body: { id?: number; name?: string; url?: string },
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };

    const taskId = Number(body?.id);
    if (Number.isInteger(taskId) && taskId > 0) {
      return this.taskService.deleteTask(taskId, user.id);
    }

    return this.taskService.deleteTaskByNameAndUrl(
      String(body?.name || ''),
      String(body?.url || ''),
      user.id,
    );
  }

  @SuccessMessage('任务模板删除成功')
  @Delete('templates/:templateId')
  async deleteTemplate(@Param('templateId') templateId: string, @Req() req: Request) {
    const user = req.user as { id: number; email?: string };
    return this.taskTemplateService.deleteTemplate(Number(templateId), user.id, {
      user: user.email || `user:${user.id}`,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    });
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
      parseInt(executionId, 10),
      user.id,
      body.packageConfig,
    );
    return {
      message: '打包成功',
      packagePath,
    };
  }
}
