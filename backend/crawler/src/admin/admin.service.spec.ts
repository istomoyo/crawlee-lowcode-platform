import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Repository } from 'typeorm';
import { AdminService } from './admin.service';
import { Task } from '../task/entities/task.entity';
import { User } from '../user/entities/user.entity';
import { LoggerService } from './logger.service';
import { SystemSettingsService } from './system-settings.service';
import { NotificationService } from '../notification/notification.service';

describe('AdminService', () => {
  let service: AdminService;
  let taskRepository: jest.Mocked<Pick<Repository<Task>, 'findOne' | 'save'>>;
  let loggerService: jest.Mocked<Pick<LoggerService, 'warn' | 'info'>>;
  let moduleRef: jest.Mocked<Pick<ModuleRef, 'get'>>;
  let notificationService: jest.Mocked<Pick<NotificationService, 'createSystemNotificationForActiveUsers'>>;
  let crawlerEngine: {
    requestTaskStop: jest.Mock<Promise<'running' | 'queued' | 'not_found'>, [number, string]>;
  };

  const createTask = (overrides: Partial<Task> = {}): Task =>
    ({
      id: 1,
      name: '示例任务',
      url: 'https://example.com',
      status: 'running',
      user: { id: 99 } as User,
      createdAt: new Date('2026-04-08T00:00:00.000Z'),
      endTime: null,
      ...overrides,
    }) as Task;

  beforeEach(() => {
    taskRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    loggerService = {
      warn: jest.fn().mockResolvedValue(undefined),
      info: jest.fn().mockResolvedValue(undefined),
    };

    crawlerEngine = {
      requestTaskStop: jest.fn(),
    };

    moduleRef = {
      get: jest.fn().mockReturnValue(crawlerEngine),
    };

    notificationService = {
      createSystemNotificationForActiveUsers: jest.fn().mockResolvedValue(0),
    };

    service = new AdminService(
      {} as Repository<User>,
      taskRepository as unknown as Repository<Task>,
      {} as Repository<any>,
      {} as Repository<any>,
      loggerService as LoggerService,
      {} as SystemSettingsService,
      notificationService as NotificationService,
      moduleRef as ModuleRef,
    );
  });

  describe('stopTask', () => {
    it('marks a running task as stopping when the engine accepts the stop request', async () => {
      const task = createTask();
      taskRepository.findOne.mockResolvedValue(task);
      taskRepository.save.mockImplementation(async (savedTask) => savedTask as Task);
      crawlerEngine.requestTaskStop.mockResolvedValue('running');

      await service.stopTask(task.id);

      expect(crawlerEngine.requestTaskStop).toHaveBeenCalledWith(
        task.id,
        '任务已由管理员停止',
      );
      expect(task.status).toBe('stopping');
      expect(taskRepository.save).toHaveBeenCalledWith(task);
      expect(loggerService.warn).toHaveBeenCalledWith(
        'admin',
        `管理员停止了任务: ${task.name}`,
        expect.objectContaining({
          taskId: task.id,
          taskName: task.name,
          userId: task.user?.id,
        }),
      );
    });

    it('falls back to failed when the engine instance cannot be resolved', async () => {
      const task = createTask();
      taskRepository.findOne.mockResolvedValue(task);
      taskRepository.save.mockImplementation(async (savedTask) => savedTask as Task);
      moduleRef.get.mockImplementation(() => {
        throw new Error('service missing');
      });

      await service.stopTask(task.id);

      expect(task.status).toBe('failed');
      expect(task.endTime).toBeInstanceOf(Date);
      expect(taskRepository.save).toHaveBeenCalledWith(task);
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('rejects stop requests for tasks that are not running', async () => {
      taskRepository.findOne.mockResolvedValue(createTask({ status: 'success' }));

      await expect(service.stopTask(1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(moduleRef.get).not.toHaveBeenCalled();
      expect(taskRepository.save).not.toHaveBeenCalled();
    });

    it('throws when the task does not exist', async () => {
      taskRepository.findOne.mockResolvedValue(null);

      await expect(service.stopTask(404)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(moduleRef.get).not.toHaveBeenCalled();
      expect(loggerService.warn).not.toHaveBeenCalled();
    });
  });
});
