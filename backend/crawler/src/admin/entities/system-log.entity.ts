import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

@Entity('system_logs')
@Index(['level', 'module', 'createdAt'])
@Index(['createdAt'])
export class SystemLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: LogLevel,
    default: LogLevel.INFO,
  })
  level: LogLevel;

  @Column({ length: 100 })
  module: string;

  @Column({ length: 255, nullable: true })
  user?: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'json', nullable: true })
  details?: any;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  createdAt: Date;

  // 便捷方法
  static createLog(params: {
    level: LogLevel;
    module: string;
    message: string;
    user?: string;
    details?: any;
    ip?: string;
    userAgent?: string;
  }): SystemLog {
    const log = new SystemLog();
    log.level = params.level;
    log.module = params.module;
    log.message = params.message;
    log.user = params.user;
    log.details = params.details;
    log.ip = params.ip;
    log.userAgent = params.userAgent;
    return log;
  }
}
