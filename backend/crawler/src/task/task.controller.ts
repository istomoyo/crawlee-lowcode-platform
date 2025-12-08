// task.controller.ts
import { Controller, Get, Req, UseGuards, Param, Query } from '@nestjs/common';
import { TaskService } from './task.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../user/entities/user-role.enum';

@Controller('task')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my-tasks')
  getUserTasks(@Req() req, @Query() query) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const search = query.search || '';
    const status = query.status || undefined;
    return this.taskService.getUserTasks(req.user.id, {
      page,
      limit,
      search,
      status,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('all-tasks')
  getAllTasks(@Query() query) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const search = query.search || '';
    const status = query.status || undefined;
    return this.taskService.getAllTasks({ page, limit, search, status });
  }
}
