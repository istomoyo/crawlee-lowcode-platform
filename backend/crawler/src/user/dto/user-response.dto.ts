import { Exclude, Expose } from 'class-transformer';

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
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
