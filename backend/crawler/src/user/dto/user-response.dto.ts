import { Exclude, Expose } from 'class-transformer';

import { UserRole } from '../entities/user-role.enum';

@Exclude() // 默认排除所有字段
export class UserResponseDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  username: string;

  @Expose()
  avatar?: string;

  @Expose()
  role: UserRole;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
