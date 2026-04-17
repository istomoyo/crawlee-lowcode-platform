import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Task } from '../../task/entities/task.entity';

@Entity()
export class Execution {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  taskId: number;

  @ManyToOne(() => Task)
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @Column({ default: 'running' })
  status: string;

  @Column('text', { nullable: true })
  log: string;

  @Column({ nullable: true })
  resultPath: string;

  @Column('text', { nullable: true })
  runtimeCookieEncrypted?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  runtimeCookieIv?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  runtimeCookieAuthTag?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  runtimeCookieDomain?: string | null;

  @Column({ type: 'datetime', nullable: true })
  runtimeCookieExpiresAt?: Date | null;

  @CreateDateColumn()
  startTime: Date;

  @UpdateDateColumn()
  endTime: Date;
}
