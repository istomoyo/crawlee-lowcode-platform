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

@Entity('task_cookie_credentials')
@Unique('uq_task_cookie_credential_user_name', ['userId', 'name'])
export class TaskCookieCredential {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cookieDomain?: string | null;

  @Column('text')
  encryptedCookie: string;

  @Column({ type: 'varchar', length: 64 })
  iv: string;

  @Column({ type: 'varchar', length: 64 })
  authTag: string;

  @Column({ type: 'int', default: 0 })
  cookieCount: number;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt?: Date | null;

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
