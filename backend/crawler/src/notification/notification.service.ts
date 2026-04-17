import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Notification, NotificationLevel } from './entities/notification.entity';
import { GetNotificationsDto, NotificationStatus } from './dto/notification.dto';

type CreateNotificationInput = {
  userId: number;
  type: string;
  level: NotificationLevel;
  title: string;
  content: string;
  link?: string;
  metadata?: Record<string, any>;
};

type CreateSystemNotificationInput = Omit<CreateNotificationInput, 'userId'>;

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getNotifications(userId: number, query: GetNotificationsDto) {
    const { status = 'all', page = 1, limit = 20 } = query;
    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId });

    this.applyStatusFilter(queryBuilder, status);

    const skip = (page - 1) * limit;
    const [items, total, unreadCount] = await Promise.all([
      queryBuilder
        .clone()
        .orderBy('notification.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getMany(),
      queryBuilder.clone().getCount(),
      this.notificationRepository.count({
        where: { userId, isRead: false },
      }),
    ]);

    return {
      items: items.map((item) => this.toNotificationDto(item)),
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getPendingExceptions(userId: number, limit = 5) {
    const items = await this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.isRead = :isRead', { isRead: false })
      .andWhere(
        `(notification.level IN (:...levels) OR notification.type IN (:...types))`,
        {
          levels: ['warning', 'error'],
          types: ['task-failure', 'maintenance'],
        },
      )
      .orderBy('notification.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return items.map((item) => this.toNotificationDto(item));
  }

  async markAsRead(userId: number, notificationId: number) {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('通知不存在');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notificationRepository.save(notification);
    }

    return this.toNotificationDto(notification);
  }

  async markAllAsRead(userId: number) {
    await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where('userId = :userId', { userId })
      .andWhere('isRead = :isRead', { isRead: false })
      .execute();

    return {
      success: true,
    };
  }

  async createUserNotification(input: CreateNotificationInput) {
    const entity = this.notificationRepository.create({
      userId: input.userId,
      type: input.type,
      level: input.level,
      title: input.title,
      content: input.content,
      link: input.link,
      metadata: input.metadata,
      isRead: false,
    });

    const saved = await this.notificationRepository.save(entity);
    return this.toNotificationDto(saved);
  }

  async createSystemNotificationForActiveUsers(input: CreateSystemNotificationInput) {
    const users = await this.userRepository.find({
      where: { status: 'active' },
      select: ['id'],
    });

    if (users.length === 0) {
      return 0;
    }

    const entities = users.map((user) =>
      this.notificationRepository.create({
        userId: user.id,
        type: input.type,
        level: input.level,
        title: input.title,
        content: input.content,
        link: input.link,
        metadata: input.metadata,
        isRead: false,
      }),
    );

    await this.notificationRepository.save(entities);
    return entities.length;
  }

  async createTaskExecutionNotification(options: {
    userId?: number;
    taskId: number;
    taskName?: string;
    executionId: number;
    status: 'success' | 'failed';
    log?: string;
    itemCount?: number;
  }) {
    if (!options.userId) {
      return null;
    }

    const isSuccess = options.status === 'success';
    const taskLabel = options.taskName || `任务 #${options.taskId}`;

    return this.createUserNotification({
      userId: options.userId,
      type: isSuccess ? 'task-success' : 'task-failure',
      level: isSuccess ? 'success' : 'error',
      title: isSuccess ? `任务执行成功: ${taskLabel}` : `任务执行失败: ${taskLabel}`,
      content: isSuccess
        ? `任务已执行完成，本次共产出 ${options.itemCount ?? 0} 条结果。`
        : `任务执行失败，${String(options.log || '请检查执行日志').slice(0, 160)}`,
      link: '/crawleer/task-list',
      metadata: {
        taskId: options.taskId,
        executionId: options.executionId,
        status: options.status,
      },
    });
  }

  private applyStatusFilter(
    queryBuilder: ReturnType<Repository<Notification>['createQueryBuilder']>,
    status: NotificationStatus,
  ) {
    if (status === 'unread') {
      queryBuilder.andWhere('notification.isRead = :isRead', {
        isRead: false,
      });
    }

    if (status === 'read') {
      queryBuilder.andWhere('notification.isRead = :isRead', {
        isRead: true,
      });
    }
  }

  private toNotificationDto(notification: Notification) {
    return {
      id: notification.id,
      type: notification.type,
      level: notification.level,
      title: notification.title,
      content: notification.content,
      link: notification.link,
      metadata: notification.metadata,
      isRead: notification.isRead,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}
