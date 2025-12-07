/*
Execution 爬虫执行实体
字段：
id: 执行 ID，自增
task: 关联的任务
status: 执行状态，running | success | failed
log: 执行日志 or 错误原因
startTime: 开始时间
endTime: 结束时间
*/
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Task } from '../../task/entities/task.entity';

@Entity()
export class Execution {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Task)
  task: Task;

  @Column({ default: 'running' })
  status: string; // running | success | failed

  @Column('text', { nullable: true })
  log: string; // 执行日志 or 错误原因

  @CreateDateColumn()
  startTime: Date;

  @UpdateDateColumn()
  endTime: Date;
}
