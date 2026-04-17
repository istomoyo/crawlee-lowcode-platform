import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
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
  config: string;

  @Column('text', { nullable: true })
  script: string;

  @Column({ default: 'pending' })
  status: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ nullable: true })
  userId?: number;

  @Column({ nullable: true })
  screenshotPath?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  folder?: string | null;

  @Column('simple-json', { nullable: true })
  tags?: string[];

  @Column({ default: false })
  isFavorite: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  endTime: Date;
}
