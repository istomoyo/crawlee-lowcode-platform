import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Task } from '../task/entities/task.entity';
import { Execution } from '../execution/entities/execution.entity';
import { SystemLog, LogLevel } from './entities/system-log.entity';
import { LoggerService } from './logger.service';
import { SystemSettingsService } from './system-settings.service';
import {
  GetUsersDto,
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  UserListResponseDto,
} from './dto/user-management.dto';
import {
  GetTasksDto,
  TaskMonitoringResponseDto,
  TaskStatsDto,
  TaskMonitoringListResponseDto,
} from './dto/task-monitoring.dto';
import {
  GetLogsDto,
  LogEntryDto,
  LogStatsDto,
  LogListResponseDto,
} from './dto/system-logs.dto';
import {
  SystemSettingsDto,
  SystemInfoDto,
} from './dto/system-settings.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private systemStartTime: Date;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    @InjectRepository(SystemLog)
    private readonly logRepository: Repository<SystemLog>,
    private readonly loggerService: LoggerService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {
    this.systemStartTime = new Date();
  }

  // ==================== 用户管理 ====================

  async getUsers(query: GetUsersDto): Promise<UserListResponseDto> {
    const { search, status, page = 1, limit = 10 } = query;

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    // 搜索条件
    if (search) {
      queryBuilder.where(
        '(user.username LIKE :search OR user.email LIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (status) {
      queryBuilder.andWhere('user.status = :status', { status });
    }

    // 分页
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // 排序
    queryBuilder.orderBy('user.createdAt', 'DESC');

    const [users, total] = await queryBuilder.getManyAndCount();

    const items: UserResponseDto[] = users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const { username, email, password, role, status } = createUserDto;

    // 检查用户名是否已存在
    const existingUser = await this.userRepository.findOne({
      where: [{ username }, { email }],
    });

    if (existingUser) {
      throw new BadRequestException('用户名或邮箱已存在');
    }

    // 加密密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = this.userRepository.create({
      username,
      email,
      password: hashedPassword,
      role,
      status,
    });

    const savedUser = await this.userRepository.save(user);

    await this.loggerService.info('admin', `管理员创建新用户: ${savedUser.username}`, {
      userId: savedUser.id,
      username: savedUser.username,
      role: savedUser.role,
    });

    return {
      id: savedUser.id,
      username: savedUser.username,
      email: savedUser.email,
      role: savedUser.role,
      status: savedUser.status,
      createdAt: savedUser.createdAt,
    };
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 检查用户名或邮箱是否已被其他用户使用
    if (updateUserDto.username || updateUserDto.email) {
      const existingUser = await this.userRepository
        .createQueryBuilder('user')
        .where('user.id != :id', { id })
        .andWhere(
          '(user.username = :username OR user.email = :email)',
          {
            username: updateUserDto.username || user.username,
            email: updateUserDto.email || user.email,
          }
        )
        .getOne();

      if (existingUser) {
        throw new BadRequestException('用户名或邮箱已被使用');
      }
    }

    // 更新用户
    await this.userRepository.update(id, updateUserDto);

    // 获取更新后的用户
    const updatedUser = await this.userRepository.findOne({ where: { id } });

    if (!updatedUser) {
      throw new NotFoundException('用户不存在');
    }

    await this.loggerService.info('admin', `管理员更新用户信息: ${updatedUser.username}`, {
      userId: updatedUser.id,
      username: updatedUser.username,
      changes: updateUserDto,
    });

    return {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      status: updatedUser.status,
      createdAt: updatedUser.createdAt,
      lastLoginAt: updatedUser.lastLoginAt,
    };
  }

  async deleteUser(id: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    await this.userRepository.remove(user);

    await this.loggerService.warn('admin', `管理员删除了用户: ${user.username}`, {
      userId: user.id,
      username: user.username,
      email: user.email,
    });
  }

  async toggleUserStatus(id: number): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const oldStatus = user.status;
    user.status = user.status === 'active' ? 'disabled' : 'active';
    await this.userRepository.save(user);

    await this.loggerService.info('admin', `管理员${user.status === 'active' ? '启用了' : '禁用了'}用户: ${user.username}`, {
      userId: user.id,
      username: user.username,
      oldStatus,
      newStatus: user.status,
    });

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status || 'active',
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  // ==================== 任务监控 ====================

  async getTasks(query: GetTasksDto): Promise<TaskMonitoringListResponseDto> {
    const { status, search, startDate, endDate, page = 1, limit = 10 } = query;

    // 查询任务
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user');

    // 筛选条件
    if (status) {
      queryBuilder.andWhere('task.status = :status', { status });
    }

    if (search) {
      queryBuilder.andWhere(
        '(task.name LIKE :search OR task.url LIKE :search OR user.username LIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('task.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    // 分页
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // 排序
    queryBuilder.orderBy('task.createdAt', 'DESC');

    const [tasks, total] = await queryBuilder.getManyAndCount();

    // 为每个任务获取最新的执行记录
    const items: TaskMonitoringResponseDto[] = await Promise.all(
      tasks.map(async (task) => {
        // 获取最新的执行记录
        const lastExecution = await this.executionRepository.findOne({
          where: { taskId: task.id },
          order: { startTime: 'DESC' },
        });

        // 获取最近5次执行记录
        const executions = await this.executionRepository.find({
          where: { taskId: task.id },
          order: { startTime: 'DESC' },
          take: 5,
        });

        return {
          id: task.id,
          name: task.name,
          url: task.url,
          status: task.status,
          createdAt: task.createdAt,
          lastExecutionTime: lastExecution?.startTime,
          user: task.user ? {
            id: task.user.id,
            username: task.user.username,
          } : null,
          executions: executions.map(exec => ({
            id: exec.id,
            status: exec.status,
            startTime: exec.startTime,
            endTime: exec.endTime,
            log: exec.log,
          })),
        };
      })
    );

    // 计算统计数据
    const stats: TaskStatsDto = {
      totalTasks: total,
      runningTasks: tasks.filter(t => t.status === 'running').length,
      successTasks: tasks.filter(t => t.status === 'success').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
    };

    return {
      items,
      stats,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async stopTask(taskId: number): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (task.status !== 'running') {
      throw new BadRequestException('任务不在运行状态');
    }

    // 更新任务状态
    task.status = 'failed';
    task.endTime = new Date();
    await this.taskRepository.save(task);

    await this.loggerService.warn('admin', `管理员停止了任务: ${task.name}`, {
      taskId: task.id,
      taskName: task.name,
      userId: task.user?.id,
    });
  }

  // ==================== 系统日志 ====================

  async getLogs(query: GetLogsDto): Promise<LogListResponseDto> {
    const { level, module, search, startDate, endDate, page = 1, limit = 50 } = query;

    const queryBuilder = this.logRepository.createQueryBuilder('log');

    // 筛选条件
    if (level) {
      queryBuilder.andWhere('log.level = :level', { level });
    }

    if (module) {
      queryBuilder.andWhere('log.module LIKE :module', { module: `%${module}%` });
    }

    if (search) {
      queryBuilder.andWhere(
        '(log.message LIKE :search OR log.user LIKE :search OR log.module LIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('log.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    // 获取统计数据
    const stats = await this.loggerService.getLogStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    // 分页
    const skip = (page - 1) * limit;
    queryBuilder
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [logs, total] = await queryBuilder.getManyAndCount();

    const items: LogEntryDto[] = logs.map(log => ({
      id: log.id,
      timestamp: log.createdAt,
      level: log.level,
      module: log.module,
      user: log.user,
      message: log.message,
      details: log.details,
    }));

    return {
      items,
      stats,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async clearLogs(): Promise<void> {
    const result = await this.logRepository.delete({});
    await this.loggerService.info('admin', '管理员清空了系统日志', {
      affectedRows: result.affected,
    });
  }

  // ==================== 系统设置 ====================

  async getSystemSettings(): Promise<SystemSettingsDto> {
    return this.systemSettingsService.getAllSettings();
  }

  async updateSystemSettings(settings: SystemSettingsDto): Promise<SystemSettingsDto> {
    const updatedSettings = await this.systemSettingsService.updateSettings(settings);
    await this.loggerService.info('admin', '管理员更新了系统设置', { settings });
    return updatedSettings;
  }

  async getSystemInfo(): Promise<SystemInfoDto> {
    const uptime = Date.now() - this.systemStartTime.getTime();

    return {
      startTime: this.systemStartTime.toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      status: 'running',
      uptime,
    };
  }
}
