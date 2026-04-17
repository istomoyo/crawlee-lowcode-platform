import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('task_templates')
@Unique('uq_task_template_user_name', ['userId', 'name'])
export class TaskTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  category?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceTaskName?: string;

  @Column({ nullable: true })
  sourceTaskId?: number;

  @Column({ type: 'varchar', length: 1000 })
  url: string;

  @Column('text')
  config: string;

  @Column('text', { nullable: true })
  script?: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
