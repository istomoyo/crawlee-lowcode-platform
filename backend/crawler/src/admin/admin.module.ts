import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { LoggerService } from './logger.service';
import { SystemSettingsService } from './system-settings.service';
import { User } from '../user/entities/user.entity';
import { Task } from '../task/entities/task.entity';
import { Execution } from '../execution/entities/execution.entity';
import { SystemLog } from './entities/system-log.entity';
import { SystemSetting } from './entities/system-setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Task, Execution, SystemLog, SystemSetting]),
  ],
  controllers: [AdminController],
  providers: [AdminService, LoggerService, SystemSettingsService],
  exports: [AdminService, LoggerService, SystemSettingsService],
})
export class AdminModule implements OnModuleInit {
  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit() {
    console.log('[ADMIN MODULE] 开始初始化管理员模块...');

    try {
      // 初始化默认设置
      console.log('[ADMIN MODULE] 初始化系统设置...');
      await this.systemSettingsService.initializeDefaultSettings();
      console.log('[ADMIN MODULE] 系统设置初始化完成');

      // 记录系统启动日志
      console.log('[ADMIN MODULE] 记录系统启动日志...');
      await this.loggerService.info('system', '系统启动完成', {
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
      });
      console.log('[ADMIN MODULE] 系统启动日志记录完成');

    } catch (error) {
      console.error('[ADMIN MODULE] 初始化失败:', error);
      throw error;
    }
  }
}
