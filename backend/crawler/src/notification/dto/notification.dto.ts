import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export const NOTIFICATION_STATUS = ['all', 'unread', 'read'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number];

export class GetNotificationsDto {
  @IsOptional()
  @IsIn(NOTIFICATION_STATUS)
  status?: NotificationStatus = 'all';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;
}
