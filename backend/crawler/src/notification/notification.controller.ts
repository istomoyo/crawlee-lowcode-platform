import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuccessMessage } from '../common/decorators/success-message.decorator';
import { GetNotificationsDto } from './dto/notification.dto';
import { NotificationService } from './notification.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(@Req() req: Request, @Query() query: GetNotificationsDto) {
    const user = req.user as { id: number };
    return this.notificationService.getNotifications(user.id, query);
  }

  @SuccessMessage('通知已标记为已读')
  @Put(':notificationId/read')
  async markAsRead(
    @Req() req: Request,
    @Param('notificationId', ParseIntPipe) notificationId: number,
  ) {
    const user = req.user as { id: number };
    return this.notificationService.markAsRead(user.id, notificationId);
  }

  @SuccessMessage('通知已全部标记为已读')
  @Put('read-all')
  async markAllAsRead(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.notificationService.markAllAsRead(user.id);
  }
}
