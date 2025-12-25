/*
Task 爬虫任务实体
字段：
id: 任务 ID，自增
name: 任务名称
url: 爬取的 URL
config: 配置，JSON 格式
script: 用户写的爬虫逻辑（低代码）
status: 任务状态，pending | running | success | failed
user: 关联的用户
createdAt: 创建时间
endTime: 任务结束时间
*/

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
@Entity()
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  url: string;

  @Column('text', { nullable: true })
  config: string; // JSON 配置

  @Column('text', { nullable: true })
  script: string; // 用户写的爬虫逻辑（低代码）

  @Column({ default: 'pending' })
  status: string; // pending | running | success | failed

  @ManyToOne(() => User)
  user: User;

  @Column({ nullable: true })
  screenshotPath: string; // 爬取首页截图路径

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  endTime: Date; // 任务结束时间
}
