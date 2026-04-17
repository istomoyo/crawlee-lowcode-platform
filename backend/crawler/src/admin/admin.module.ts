import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { PlatformController } from './platform.controller';
import { AdminService } from './admin.service';
import { LoggerService } from './logger.service';
import { SystemSettingsService } from './system-settings.service';
import { ResourceCleanupService } from './resource-cleanup.service';
import { User } from '../user/entities/user.entity';
import { Task } from '../task/entities/task.entity';
import { Execution } from '../execution/entities/execution.entity';
import { SystemLog } from './entities/system-log.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Task, Execution, SystemLog, SystemSetting]),
    NotificationModule,
  ],
  controllers: [AdminController, PlatformController],
  providers: [AdminService, LoggerService, SystemSettingsService, ResourceCleanupService],
  exports: [AdminService, LoggerService, SystemSettingsService, ResourceCleanupService],
})
export class AdminModule implements OnModuleInit {
  private readonly logger = new Logger(AdminModule.name);

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit() {
    this.logger.log('开始初始化管理后台模块...');

    try {
      // 初始化默认设置
      this.logger.log('开始初始化系统设置...');
      await this.systemSettingsService.initializeDefaultSettings();
      this.logger.log('系统设置初始化完成');

      // 记录系统启动日志
      this.logger.log('记录系统启动日志...');
      await this.loggerService.info('system', '系统启动完成', {
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
      });
      this.logger.log('系统启动日志写入完成');
    } catch (error) {
      this.logger.error('管理后台初始化失败', error);
      throw error;
    }
  }
}
