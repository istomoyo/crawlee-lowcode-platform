/*
Result 爬虫结果实体
字段：
id: 结果 ID，自增
task: 关联的任务
data: 抓取到的数据，JSON 格式
createdAt: 创建时间
*/
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Task } from '../../task/entities/task.entity';

@Entity()
export class Result {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Task)
  task: Task;

  @Column('text')
  data: string; // JSON 数据（抓到的内容）

  @CreateDateColumn()
  createdAt: Date;
}
