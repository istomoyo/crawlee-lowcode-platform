import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '../admin/logger.service';
import {
  listUnsafeCustomJsFeatures,
  sanitizeTaskConfig,
} from './task-config.utils';
import {
  CreateTaskTemplateDto,
  CreateTaskTemplateFromTaskDto,
  TaskTemplateAuditDto,
  UpdateTaskTemplateDto,
} from './dto/task-template.dto';
import { CrawleeTaskConfig } from './dto/execute-task.dto';
import { Task } from './entities/task.entity';
import { TaskTemplate } from './entities/task-template.entity';
import { isUnsafeCustomJsEnabled } from '../config/runtime-security';

@Injectable()
export class TaskTemplateService {
  constructor(
    @InjectRepository(TaskTemplate)
    private readonly taskTemplateRepository: Repository<TaskTemplate>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly loggerService: LoggerService,
  ) {}

  async getTemplates(userId: number, search?: string, category?: string) {
    const normalizedSearch = search?.trim();
    const normalizedCategory = this.normalizeCategory(category);
    const queryBuilder = this.taskTemplateRepository
      .createQueryBuilder('template')
      .where('template.userId = :userId', { userId });

    if (normalizedCategory) {
      queryBuilder.andWhere('template.category = :category', {
        category: normalizedCategory,
      });
    }

    if (normalizedSearch) {
      queryBuilder.andWhere(
        `(
          template.name LIKE :search
          OR template.description LIKE :search
          OR template.sourceTaskName LIKE :search
          OR template.category LIKE :search
        )`,
        {
          search: `%${normalizedSearch}%`,
        },
      );
    }

    const templates = await queryBuilder
      .orderBy('template.updatedAt', 'DESC')
      .addOrderBy('template.createdAt', 'DESC')
      .getMany();

    return templates.map((template) => this.toTemplateSummary(template));
  }

  async getTemplateCategories(userId: number) {
    const rows = await this.taskTemplateRepository
      .createQueryBuilder('template')
      .select('template.category', 'category')
      .where('template.userId = :userId', { userId })
      .andWhere('template.category IS NOT NULL')
      .andWhere(`template.category != ''`)
      .groupBy('template.category')
      .orderBy('template.category', 'ASC')
      .getRawMany<{ category: string }>();

    return rows
      .map((row) => String(row.category || '').trim())
      .filter(Boolean);
  }

  async getTemplateDetail(id: number, userId: number) {
    const template = await this.taskTemplateRepository.findOne({
      where: { id, userId },
    });

    if (!template) {
      throw new NotFoundException('任务模板不存在');
    }

    return this.toTemplateDetail(template);
  }

  async createTemplate(
    userId: number,
    payload: CreateTaskTemplateDto,
    audit?: TaskTemplateAuditDto,
  ) {
    await this.ensureTemplateNameAvailable(userId, payload.name);

    const normalizedConfig = sanitizeTaskConfig(payload.config || {}, {
      allowInlineCookieString: false,
    });
    this.ensureUnsafeCustomJsAllowed(normalizedConfig, '模板配置');

    const template = this.taskTemplateRepository.create({
      userId,
      name: payload.name.trim(),
      description: payload.description?.trim() || undefined,
      category: this.normalizeCategory(payload.category),
      sourceTaskName: payload.taskName?.trim() || undefined,
      url: payload.url.trim(),
      config: JSON.stringify(normalizedConfig),
      script: payload.script?.trim() || undefined,
    });

    const savedTemplate = await this.taskTemplateRepository.save(template);

    await this.loggerService.info(
      'task-template',
      `创建任务模板: ${savedTemplate.name}`,
      {
        templateId: savedTemplate.id,
        templateName: savedTemplate.name,
        category: savedTemplate.category,
        sourceTaskName: savedTemplate.sourceTaskName,
        userId,
      },
      audit?.user,
      audit?.ip,
      audit?.userAgent,
    );

    return this.toTemplateSummary(savedTemplate);
  }

  async createTemplateFromTask(
    userId: number,
    payload: CreateTaskTemplateFromTaskDto,
    audit?: TaskTemplateAuditDto,
  ) {
    const task = await this.taskRepository.findOne({
      where: { id: payload.taskId, userId },
    });

    if (!task) {
      throw new NotFoundException('来源任务不存在');
    }

    const templateName = payload.name?.trim() || `${task.name} 模板`;
    await this.ensureTemplateNameAvailable(userId, templateName);
    this.ensureUnsafeCustomJsAllowed(this.parseTaskConfig(task.config), '任务配置');

    const template = this.taskTemplateRepository.create({
      userId,
      name: templateName,
      description: payload.description?.trim() || undefined,
      category: this.normalizeCategory(payload.category),
      sourceTaskId: task.id,
      sourceTaskName: task.name,
      url: task.url,
      config: JSON.stringify(
        sanitizeTaskConfig(this.parseTaskConfig(task.config), {
          allowInlineCookieString: false,
        }),
      ),
      script: task.script || undefined,
    });

    const savedTemplate = await this.taskTemplateRepository.save(template);

    await this.loggerService.info(
      'task-template',
      `从任务创建模板: ${savedTemplate.name}`,
      {
        templateId: savedTemplate.id,
        templateName: savedTemplate.name,
        category: savedTemplate.category,
        sourceTaskId: task.id,
        sourceTaskName: task.name,
        userId,
      },
      audit?.user,
      audit?.ip,
      audit?.userAgent,
    );

    return this.toTemplateSummary(savedTemplate);
  }

  async updateTemplate(
    id: number,
    userId: number,
    payload: UpdateTaskTemplateDto,
    audit?: TaskTemplateAuditDto,
  ) {
    const template = await this.taskTemplateRepository.findOne({
      where: { id, userId },
    });

    if (!template) {
      throw new NotFoundException('任务模板不存在');
    }

    const nextName =
      payload.name !== undefined ? payload.name.trim() : template.name;

    if (payload.name !== undefined && nextName !== template.name) {
      await this.ensureTemplateNameAvailable(userId, nextName, template.id);
      template.name = nextName;
    }

    if (payload.description !== undefined) {
      template.description = payload.description.trim() || undefined;
    }

    if (payload.category !== undefined) {
      template.category = this.normalizeCategory(payload.category);
    }

    if (payload.url !== undefined) {
      const nextUrl = payload.url.trim();
      if (!nextUrl) {
        throw new BadRequestException('模板 URL 不能为空');
      }
      template.url = nextUrl;
    }

    if (payload.taskName !== undefined) {
      template.sourceTaskName = payload.taskName.trim() || undefined;
    }

    if (payload.config !== undefined) {
      const normalizedConfig = sanitizeTaskConfig(payload.config || {}, {
        allowInlineCookieString: false,
      });
      this.ensureUnsafeCustomJsAllowed(normalizedConfig, '模板配置');
      template.config = JSON.stringify(normalizedConfig);
    }

    if (payload.script !== undefined) {
      template.script = payload.script.trim() || undefined;
    }

    const savedTemplate = await this.taskTemplateRepository.save(template);

    await this.loggerService.info(
      'task-template',
      `更新任务模板: ${savedTemplate.name}`,
      {
        templateId: savedTemplate.id,
        templateName: savedTemplate.name,
        category: savedTemplate.category,
        sourceTaskName: savedTemplate.sourceTaskName,
        userId,
      },
      audit?.user,
      audit?.ip,
      audit?.userAgent,
    );

    return this.toTemplateSummary(savedTemplate);
  }

  async deleteTemplate(
    id: number,
    userId: number,
    audit?: TaskTemplateAuditDto,
  ) {
    const template = await this.taskTemplateRepository.findOne({
      where: { id, userId },
    });

    if (!template) {
      throw new NotFoundException('任务模板不存在');
    }

    await this.taskTemplateRepository.delete({ id, userId });

    await this.loggerService.warn(
      'task-template',
      `删除任务模板: ${template.name}`,
      {
        templateId: template.id,
        templateName: template.name,
        category: template.category,
        sourceTaskId: template.sourceTaskId,
        sourceTaskName: template.sourceTaskName,
        userId,
      },
      audit?.user,
      audit?.ip,
      audit?.userAgent,
    );

    return {
      id: template.id,
      name: template.name,
    };
  }

  private async ensureTemplateNameAvailable(
    userId: number,
    name: string,
    excludeId?: number,
  ) {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new BadRequestException('模板名称不能为空');
    }

    const existing = await this.taskTemplateRepository.findOne({
      where: {
        userId,
        name: normalizedName,
      },
    });

    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('模板名称已存在，请更换后重试');
    }
  }

  private normalizeCategory(category?: string | null) {
    const normalizedCategory = String(category || '').trim();
    return normalizedCategory || undefined;
  }

  private toTemplateSummary(template: TaskTemplate) {
    return {
      id: template.id,
      name: template.name,
      description: template.description || '',
      category: template.category || '',
      sourceTaskId: template.sourceTaskId || null,
      sourceTaskName: template.sourceTaskName || '',
      url: template.url,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private toTemplateDetail(template: TaskTemplate) {
    return {
      ...this.toTemplateSummary(template),
      script: template.script || '',
      config: this.parseTemplateConfig(template.config),
    };
  }

  private parseTemplateConfig(rawConfig: string) {
    try {
      const parsed = JSON.parse(rawConfig || '{}');
      if (parsed?.config && typeof parsed.config === 'object') {
        return sanitizeTaskConfig(parsed.config, {
          allowInlineCookieString: false,
        });
      }
      return sanitizeTaskConfig(parsed, {
        allowInlineCookieString: false,
      });
    } catch {
      return {};
    }
  }

  private parseTaskConfig(rawConfig?: string | null) {
    if (!rawConfig) {
      return {};
    }

    try {
      return JSON.parse(rawConfig);
    } catch {
      return {};
    }
  }

  private ensureUnsafeCustomJsAllowed(
    config:
      | Partial<CrawleeTaskConfig>
      | Record<string, unknown>
      | null
      | undefined,
    sourceLabel: string,
  ) {
    const unsafeFeatures = listUnsafeCustomJsFeatures(config);
    if (unsafeFeatures.length === 0 || isUnsafeCustomJsEnabled()) {
      return;
    }

    throw new BadRequestException(
      `${sourceLabel}包含 ${unsafeFeatures.join('、')}，当前服务器已禁用自定义 JS。若确认部署环境可信，请显式设置 ALLOW_UNSAFE_CUSTOM_JS=true。`,
    );
  }
}
