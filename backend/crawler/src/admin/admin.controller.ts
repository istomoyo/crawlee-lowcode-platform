import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../user/entities/user-role.enum';
import { AdminService } from './admin.service';
import {
  SystemInfoDto,
  SystemSettingsDto,
} from './dto/system-settings.dto';
import {
  GetLogsDto,
  LogListResponseDto,
} from './dto/system-logs.dto';
import {
  GetTasksDto,
  TaskMonitoringListResponseDto,
} from './dto/task-monitoring.dto';
import {
  CreateUserDto,
  GetUsersDto,
  UpdateUserDto,
  UserListResponseDto,
} from './dto/user-management.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async getUsers(@Query() query: GetUsersDto): Promise<UserListResponseDto> {
    return this.adminService.getUsers(query);
  }

  @Post('users')
  async createUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.adminService.createUser(createUserDto);
    return {
      statusCode: HttpStatus.CREATED,
      message: '用户创建成功',
      data: user,
    };
  }

  @Put('users/:id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const user = await this.adminService.updateUser(id, updateUserDto);
    return {
      statusCode: HttpStatus.OK,
      message: '用户更新成功',
      data: user,
    };
  }

  @Delete('users/:id')
  async deleteUser(@Param('id', ParseIntPipe) id: number) {
    await this.adminService.deleteUser(id);
    return {
      statusCode: HttpStatus.OK,
      message: '用户删除成功',
    };
  }

  @Put('users/:id/toggle-status')
  async toggleUserStatus(@Param('id', ParseIntPipe) id: number) {
    const user = await this.adminService.toggleUserStatus(id);
    return {
      statusCode: HttpStatus.OK,
      message: `用户${user.status === 'active' ? '启用' : '禁用'}成功`,
      data: user,
    };
  }

  @Get('tasks')
  async getTasks(@Query() query: GetTasksDto): Promise<TaskMonitoringListResponseDto> {
    return this.adminService.getTasks(query);
  }

  @Put('tasks/:id/stop')
  async stopTask(@Param('id', ParseIntPipe) taskId: number) {
    await this.adminService.stopTask(taskId);
    return {
      statusCode: HttpStatus.OK,
      message: '已发送停止请求',
    };
  }

  @Get('logs')
  async getLogs(@Query() query: GetLogsDto): Promise<LogListResponseDto> {
    return this.adminService.getLogs(query);
  }

  @Delete('logs')
  async clearLogs() {
    await this.adminService.clearLogs();
    return {
      statusCode: HttpStatus.OK,
      message: '日志清空成功',
    };
  }

  @Get('settings')
  async getSystemSettings(): Promise<SystemSettingsDto> {
    return this.adminService.getSystemSettings();
  }

  @Put('settings')
  async updateSystemSettings(@Body() settings: SystemSettingsDto) {
    const updatedSettings = await this.adminService.updateSystemSettings(settings);
    return {
      statusCode: HttpStatus.OK,
      message: '设置保存成功',
      data: updatedSettings,
    };
  }

  @Get('system-info')
  async getSystemInfo(): Promise<SystemInfoDto> {
    return this.adminService.getSystemInfo();
  }
}
