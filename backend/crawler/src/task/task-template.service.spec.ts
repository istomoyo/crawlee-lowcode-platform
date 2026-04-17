import { BadRequestException } from '@nestjs/common';
import { LoggerService } from '../admin/logger.service';
import { TaskTemplateService } from './task-template.service';

describe('TaskTemplateService', () => {
  const taskTemplateRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const taskRepository = {
    findOne: jest.fn(),
  };

  const loggerService = {
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as LoggerService;

  let service: TaskTemplateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TaskTemplateService(
      taskTemplateRepository as any,
      taskRepository as any,
      loggerService,
    );
  });

  it('creates a template from an existing task and records an audit log', async () => {
    const task = {
      id: 7,
      userId: 3,
      name: '资讯抓取',
      url: 'https://example.com/list',
      config: JSON.stringify({
        crawlerType: 'playwright',
        urls: ['https://example.com/list'],
        maxRequestsPerCrawl: 20,
      }),
      script: '',
    };

    const savedTemplate = {
      id: 9,
      name: '资讯模板',
      description: '常用资讯站模板',
      category: '资讯',
      sourceTaskId: task.id,
      sourceTaskName: task.name,
      url: task.url,
      config: task.config,
      createdAt: new Date('2026-04-08T10:00:00.000Z'),
      updatedAt: new Date('2026-04-08T10:05:00.000Z'),
    };

    taskRepository.findOne.mockResolvedValue(task);
    taskTemplateRepository.findOne.mockResolvedValue(null);
    taskTemplateRepository.create.mockImplementation((payload) => payload);
    taskTemplateRepository.save.mockResolvedValue(savedTemplate);

    const result = await service.createTemplateFromTask(
      3,
      {
        taskId: 7,
        name: '资讯模板',
        description: '常用资讯站模板',
        category: '资讯',
      },
      {
        user: 'user@example.com',
      },
    );

    expect(taskRepository.findOne).toHaveBeenCalledWith({
      where: { id: 7, userId: 3 },
    });
    expect(taskTemplateRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        name: '资讯模板',
        category: '资讯',
        sourceTaskId: 7,
        sourceTaskName: '资讯抓取',
      }),
    );
    expect(result).toMatchObject({
      id: 9,
      name: '资讯模板',
      category: '资讯',
      sourceTaskId: 7,
      sourceTaskName: '资讯抓取',
    });
    expect((loggerService.info as jest.Mock).mock.calls[0][0]).toBe(
      'task-template',
    );
  });

  it('redacts inline cookies when reading template detail', async () => {
    taskTemplateRepository.findOne.mockResolvedValue({
      id: 11,
      userId: 3,
      name: '详情页模板',
      description: '',
      category: '详情',
      sourceTaskId: null,
      sourceTaskName: '',
      url: 'https://example.com/article',
      config: JSON.stringify({
        crawlerType: 'playwright',
        urls: ['https://example.com/article'],
        useCookie: true,
        cookieString: ' session=abc ',
      }),
      script: '',
      createdAt: new Date('2026-04-08T10:00:00.000Z'),
      updatedAt: new Date('2026-04-08T10:05:00.000Z'),
    });

    const detail = await service.getTemplateDetail(11, 3);

    expect(detail).toMatchObject({
      id: 11,
      name: '详情页模板',
      category: '详情',
      url: 'https://example.com/article',
      config: {
        crawlerType: 'playwright',
        useCookie: false,
      },
    });
    expect(detail.config.cookieString).toBeUndefined();
  });

  it('updates template metadata and records an audit log', async () => {
    taskTemplateRepository.findOne
      .mockResolvedValueOnce({
        id: 15,
        userId: 3,
        name: '旧模板',
        description: '旧说明',
        category: '旧分类',
        sourceTaskName: '旧任务',
        url: 'https://example.com',
        config: JSON.stringify({ crawlerType: 'playwright' }),
        script: '',
        createdAt: new Date('2026-04-08T10:00:00.000Z'),
        updatedAt: new Date('2026-04-08T10:05:00.000Z'),
      })
      .mockResolvedValueOnce(null);
    taskTemplateRepository.save.mockImplementation(async (payload) => ({
      ...payload,
      updatedAt: new Date('2026-04-08T10:10:00.000Z'),
    }));

    const result = await service.updateTemplate(
      15,
      3,
      {
        name: '新模板',
        description: '新说明',
        category: '新闻',
      },
      {
        user: 'user@example.com',
      },
    );

    expect(taskTemplateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 15,
        name: '新模板',
        description: '新说明',
        category: '新闻',
      }),
    );
    expect(result).toMatchObject({
      id: 15,
      name: '新模板',
      description: '新说明',
      category: '新闻',
    });
    expect((loggerService.info as jest.Mock).mock.calls[0][1]).toContain(
      '更新任务模板',
    );
  });

  it('rejects duplicate template names for the same user', async () => {
    taskTemplateRepository.findOne.mockResolvedValue({
      id: 12,
      userId: 3,
      name: '重复模板',
    });

    await expect(
      service.createTemplate(
        3,
        {
          name: '重复模板',
          url: 'https://example.com',
          config: {},
        },
        {
          user: 'user@example.com',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
