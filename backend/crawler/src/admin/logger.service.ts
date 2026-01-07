import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemLog, LogLevel } from './entities/system-log.entity';

@Injectable()
export class LoggerService {
  private readonly logger = new Logger(LoggerService.name);

  constructor(
    @InjectRepository(SystemLog)
    private readonly logRepository: Repository<SystemLog>,
  ) {}

  /**
   * 记录错误日志
   */
  async error(module: string, message: string, details?: any, user?: string, ip?: string, userAgent?: string) {
    await this.log(LogLevel.ERROR, module, message, details, user, ip, userAgent);
  }

  /**
   * 记录警告日志
   */
  async warn(module: string, message: string, details?: any, user?: string, ip?: string, userAgent?: string) {
    await this.log(LogLevel.WARN, module, message, details, user, ip, userAgent);
  }

  /**
   * 记录信息日志
   */
  async info(module: string, message: string, details?: any, user?: string, ip?: string, userAgent?: string) {
    await this.log(LogLevel.INFO, module, message, details, user, ip, userAgent);
  }

  /**
   * 记录调试日志
   */
  async debug(module: string, message: string, details?: any, user?: string, ip?: string, userAgent?: string) {
    await this.log(LogLevel.DEBUG, module, message, details, user, ip, userAgent);
  }

  /**
   * 通用日志记录方法
   */
  private async log(
    level: LogLevel,
    module: string,
    message: string,
    details?: any,
    user?: string,
    ip?: string,
    userAgent?: string,
  ) {
    try {
      const logEntry = SystemLog.createLog({
        level,
        module,
        message,
        user,
        details,
        ip,
        userAgent,
      });

      await this.logRepository.save(logEntry);

      // 使用 NestJS Logger 输出到控制台
      const consoleLogger = new Logger(module);
      switch (level) {
        case LogLevel.ERROR:
          consoleLogger.error(message, details);
          break;
        case LogLevel.WARN:
          consoleLogger.warn(message, details);
          break;
        case LogLevel.INFO:
          consoleLogger.log(message, details);
          break;
        case LogLevel.DEBUG:
          consoleLogger.debug(message, details);
          break;
      }
    } catch (error) {
      // 如果日志记录失败，不应该影响主要业务逻辑
      const errorLogger = new Logger(LoggerService.name);
      errorLogger.error('日志记录失败', error);
    }
  }

  /**
   * 获取日志统计信息
   */
  async getLogStats(startDate?: Date, endDate?: Date) {
    const queryBuilder = this.logRepository.createQueryBuilder('log');

    if (startDate && endDate) {
      queryBuilder.where('log.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const stats = await queryBuilder
      .select('log.level', 'level')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.level')
      .getRawMany();

    const result = {
      total: 0,
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
    };

    stats.forEach(stat => {
      result[stat.level] = parseInt(stat.count);
      result.total += parseInt(stat.count);
    });

    return result;
  }

  /**
   * 清理过期日志
   */
  async cleanupOldLogs(daysToKeep: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.logRepository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    await this.info('logger', `清理了 ${result.affected} 条过期日志`, {
      cutoffDate,
      daysToKeep,
    });

    return result.affected;
  }
}
